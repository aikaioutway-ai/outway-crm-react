import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Выписки банка для «Сверки платежей»: общие для всех, кому открыта сверка
// (кассир и руководство без ограничения по школам).
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ROLES = new Set(['admin', 'gen_director', 'director', 'cashier']);
const MAX_ENTRIES = 20000;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-employee-session',
};

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

async function verifySession(token: string): Promise<{ sub: string; role: string } | null> {
  try {
    const [payloadPart, signaturePart, extra] = token.split('.');
    if (!payloadPart || !signaturePart || extra) return null;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SUPABASE_SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, decodeBase64Url(signaturePart), new TextEncoder().encode(payloadPart));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart)));
    if (!payload?.sub || !payload?.role || !Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
    return { sub: String(payload.sub), role: String(payload.role) };
  } catch {
    return null;
  }
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ''));
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validEntry(entry: any) {
  return entry && typeof entry === 'object' && isDate(entry.postingDate) &&
    typeof entry.document === 'string' && Number.isFinite(Number(entry.amount)) && Array.isArray(entry.codes);
}

function toStatement(row: any) {
  return {
    id: row.id, name: row.file_name, uploadedMonth: row.uploaded_month ?? undefined,
    range: { from: row.range_from, to: row.range_to }, entries: row.entries,
    uploadedByName: row.uploaded_by_name ?? undefined, createdAt: row.created_at,
  };
}

const COLUMNS = 'id,file_name,uploaded_month,range_from,range_to,entries,uploaded_by_name,created_at';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405);
  try {
    const session = await verifySession(req.headers.get('x-employee-session') ?? '');
    if (!session) return response({ ok: false, error: 'Сессия недействительна или истекла' }, 401);
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: employee, error: employeeError } = await db.from('v2_employees')
      .select('id,full_name,role,status,school_keys').eq('id', session.sub).maybeSingle();
    if (employeeError) throw employeeError;
    const schools: string[] = employee?.school_keys ?? [];
    if (!employee || employee.status !== 'active' || !ALLOWED_ROLES.has(employee.role) ||
        (schools.length && !schools.includes('ALL'))) {
      return response({ ok: false, error: 'Нет доступа к сверке платежей' }, 403);
    }

    const body = await req.json();
    if (body.action === 'list') {
      const { data, error } = await db.from('v2_bank_statements').select(COLUMNS).order('created_at', { ascending: false });
      if (error) throw error;
      return response({ ok: true, statements: (data ?? []).map(toStatement) });
    }

    if (body.action === 'add') {
      const statement = body.statement ?? {};
      const name = String(statement.name ?? '').trim().slice(0, 300);
      const entries = statement.entries;
      const uploadedMonth = /^\d{4}-\d{2}$/.test(String(statement.uploadedMonth ?? '')) ? statement.uploadedMonth : null;
      if (!name || !Array.isArray(entries) || !entries.length || entries.length > MAX_ENTRIES || !entries.every(validEntry)) {
        return response({ ok: false, error: 'Выписка повреждена. Загрузите файл заново.' }, 400);
      }
      const dates = entries.map((entry: any) => entry.postingDate).sort();
      const from = isDate(statement.range?.from) ? statement.range.from : dates[0];
      const to = isDate(statement.range?.to) ? statement.range.to : dates[dates.length - 1];
      const hash = await sha256(JSON.stringify([name, uploadedMonth, entries]));
      const { error } = await db.from('v2_bank_statements').upsert({
        file_name: name, uploaded_month: uploadedMonth, range_from: from, range_to: to, entries,
        content_hash: hash, uploaded_by: employee.id, uploaded_by_name: employee.full_name,
      }, { onConflict: 'content_hash', ignoreDuplicates: true });
      if (error) throw error;
      const saved = await db.from('v2_bank_statements').select(COLUMNS).eq('content_hash', hash).single();
      if (saved.error) throw saved.error;
      return response({ ok: true, statement: toStatement(saved.data) });
    }

    if (body.action === 'delete') {
      if (!isUuid(body.statementId)) return response({ ok: false, error: 'Не указана выписка' }, 400);
      const { error } = await db.from('v2_bank_statements').delete().eq('id', body.statementId);
      if (error) throw error;
      return response({ ok: true });
    }

    return response({ ok: false, error: 'Неизвестное действие' }, 400);
  } catch (error) {
    console.error(error);
    return response({ ok: false, error: 'Не удалось выполнить действие с выпиской' }, 500);
  }
});
