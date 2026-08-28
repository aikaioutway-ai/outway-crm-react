import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FINANCE_ROLES = new Set(['admin', 'gen_director', 'director', 'senior_logist', 'cashier']);
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-employee-session',
};

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function verifySession(token: string): Promise<{ sub: string; role: string } | null> {
  const [payloadPart, signaturePart, extra] = token.split('.');
  if (!payloadPart || !signaturePart || extra) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SUPABASE_SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, decodeBase64Url(signaturePart), new TextEncoder().encode(payloadPart));
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart)));
  if (!payload?.sub || !payload?.role || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
  return { sub: String(payload.sub), role: String(payload.role) };
}

function isAigerimMamazirova(name: string): boolean {
  const normalized = name.trim().toLowerCase().replaceAll('ё', 'е');
  return normalized.includes('айгерим')
    && (normalized.includes('мамазирова') || normalized.includes('мамазаирова'));
}

function isKairatEsenali(name: string): boolean {
  const normalized = name.trim().toLowerCase().replaceAll('ё', 'е');
  return (normalized.includes('эсенали') || normalized.includes('есенали')) && normalized.includes('кайрат');
}

function validPeriod(month: unknown, year: unknown): boolean {
  return Number.isInteger(Number(month)) && Number(month) >= 1 && Number(month) <= 12
    && Number.isInteger(Number(year)) && Number(year) >= 2020 && Number(year) <= 2100;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const session = await verifySession(req.headers.get('x-employee-session') ?? '');
    if (!session) return response({ ok: false, error: 'Сессия недействительна или истекла' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: employee, error: employeeError } = await supabase
      .from('v2_employees')
      .select('id, full_name, role, status')
      .eq('id', session.sub)
      .eq('status', 'active')
      .single();
    if (employeeError || !employee || employee.role !== session.role) return response({ ok: false, error: 'Сотрудник не найден' }, 403);
    if (!FINANCE_ROLES.has(employee.role)) return response({ ok: false, error: 'Нет доступа к согласованию табеля' }, 403);

    const body = await req.json();
    const schoolKey = String(body.schoolKey ?? '').trim();
    if (!validPeriod(body.periodMonth, body.periodYear)) return response({ ok: false, error: 'Некорректный период' }, 400);
    const periodMonth = Number(body.periodMonth);
    const periodYear = Number(body.periodYear);

    if (body.action === 'get') {
      if (!schoolKey) return response({ ok: false, error: 'Не указана школа' }, 400);
      const { data, error } = await supabase.from('v2_payroll_approvals').select('*')
        .eq('school_key', schoolKey).eq('period_month', periodMonth).eq('period_year', periodYear).maybeSingle();
      if (error) throw error;
      return response({ ok: true, row: data ?? null });
    }

    if (body.action === 'list') {
      const { data, error } = await supabase.from('v2_payroll_approvals').select('*')
        .eq('period_month', periodMonth).eq('period_year', periodYear);
      if (error) throw error;
      return response({ ok: true, rows: data ?? [] });
    }

    if (body.action === 'setStatus') {
      if (!schoolKey) return response({ ok: false, error: 'Не указана школа' }, 400);
      const status = String(body.status ?? '');
      if (!['pending', 'approved', 'rejected'].includes(status)) return response({ ok: false, error: 'Некорректный статус' }, 400);
      const authorizedApprover = employee.role === 'gen_director'
        || (employee.role === 'admin' && isKairatEsenali(employee.full_name));
      if ((status === 'approved' || status === 'rejected') && !authorizedApprover) {
        return response({ ok: false, error: 'Утвердить или вернуть табель могут генеральный директор и Есенали Кайрат' }, 403);
      }

      const { data: current, error: currentError } = await supabase.from('v2_payroll_approvals').select('status')
        .eq('school_key', schoolKey).eq('period_month', periodMonth).eq('period_year', periodYear).maybeSingle();
      if (currentError) throw currentError;
      if ((status === 'approved' || status === 'rejected') && current?.status !== 'pending') {
        return response({ ok: false, error: 'Подписать или вернуть можно только табель, ожидающий подписи' }, 409);
      }
      if (status === 'pending' && (current?.status === 'pending' || current?.status === 'approved')) {
        return response({ ok: false, error: current.status === 'approved' ? 'Подписанный табель нельзя отправить повторно' : 'Табель уже ожидает подписи' }, 409);
      }

      const now = new Date().toISOString();
      const payload: Record<string, unknown> = {
        school_key: schoolKey,
        period_month: periodMonth,
        period_year: periodYear,
        status,
        updated_at: now,
      };
      const subjects = Array.isArray(body.subjects) ? body.subjects : [];
      if (status === 'pending') {
        payload.submitted_by_id = employee.id;
        payload.submitted_by_name = employee.full_name;
        payload.submitted_at = now;
        payload.approved_by_id = null;
        payload.approved_by_name = null;
        payload.approved_at = null;
        payload.rejection_comment = null;

      } else if (status === 'approved') {
        payload.approved_by_id = employee.id;
        payload.approved_by_name = employee.full_name;
        payload.approved_at = now;
        payload.rejection_comment = null;
      } else {
        payload.approved_by_id = null;
        payload.approved_by_name = null;
        payload.approved_at = null;
        payload.rejection_comment = String(body.rejectionComment ?? '').trim() || null;
      }

      const entryPatch = status === 'approved'
        ? { approval_status: 'approved', approved_by_id: employee.id, approved_by_name: employee.full_name, approved_at: now, rejection_comment: null }
        : status === 'pending'
          ? { approval_status: 'pending', approved_by_id: null, approved_by_name: null, approved_at: null, rejection_comment: null }
          : { approval_status: 'rejected', approved_by_id: null, approved_by_name: null, approved_at: null, rejection_comment: String(body.rejectionComment ?? '').trim() || null };
      for (const subject of subjects) {
        const subjectId = String(subject?.subjectId ?? '');
        const subjectType = String(subject?.subjectType ?? '');
        if (!subjectId || !['driver', 'employee'].includes(subjectType)) continue;
        const { error: entryError } = await supabase.from('v2_payroll_entries').update(entryPatch)
          .eq('subject_id', subjectId).eq('subject_type', subjectType)
          .eq('period_month', periodMonth).eq('period_year', periodYear);
        if (entryError) throw entryError;
      }

      const { data, error } = await supabase.from('v2_payroll_approvals')
        .upsert(payload, { onConflict: 'school_key,period_month,period_year' }).select('*').single();
      if (error) throw error;
      return response({ ok: true, row: data });
    }

    if (body.action === 'setEntryStatus') {
      if (!schoolKey) return response({ ok: false, error: 'Не указана школа' }, 400);
      if (!isAigerimMamazirova(employee.full_name) && !isKairatEsenali(employee.full_name)) {
        return response({ ok: false, error: 'Утверждать табель могут Мамазирова Айгерим и Эсенали Кайрат' }, 403);
      }

      const status = String(body.status ?? '');
      if (!['draft', 'approved', 'rejected'].includes(status)) {
        return response({ ok: false, error: 'Некорректный статус строки' }, 400);
      }
      const allSubjects = Array.isArray(body.allSubjects) ? body.allSubjects : [];
      const selectedSubjects = body.subjectId
        ? [{ subjectId: body.subjectId, subjectType: body.subjectType }]
        : allSubjects;
      if (selectedSubjects.length === 0 || allSubjects.length === 0) {
        return response({ ok: false, error: 'В табеле нет строк для утверждения' }, 400);
      }

      const now = new Date().toISOString();
      const changedEntries: Record<string, unknown>[] = [];
      for (const subject of selectedSubjects) {
        const subjectId = String(subject?.subjectId ?? '');
        const subjectType = String(subject?.subjectType ?? '');
        if (!subjectId || !['driver', 'employee'].includes(subjectType)) continue;
        const entryPatch = status === 'approved'
          ? { approval_status: status, approved_by_id: employee.id, approved_by_name: employee.full_name, approved_at: now, rejection_comment: null }
          : { approval_status: status, approved_by_id: null, approved_by_name: null, approved_at: null, rejection_comment: status === 'rejected' ? String(body.rejectionComment ?? '').trim() || null : null };
        const { data: changed, error: entryError } = await supabase.from('v2_payroll_entries')
          .update(entryPatch).eq('subject_id', subjectId).eq('subject_type', subjectType)
          .eq('period_month', periodMonth).eq('period_year', periodYear).select('*').single();
        if (entryError) throw entryError;
        changedEntries.push(changed);
      }

      const statusRows: Array<{ approval_status?: string }> = [];
      for (const subject of allSubjects) {
        const subjectId = String(subject?.subjectId ?? '');
        const subjectType = String(subject?.subjectType ?? '');
        if (!subjectId || !['driver', 'employee'].includes(subjectType)) continue;
        const { data: statusRow, error: statusError } = await supabase.from('v2_payroll_entries')
          .select('approval_status').eq('subject_id', subjectId).eq('subject_type', subjectType)
          .eq('period_month', periodMonth).eq('period_year', periodYear).single();
        if (statusError) throw statusError;
        statusRows.push(statusRow);
      }
      const allApproved = statusRows.length === allSubjects.length
        && statusRows.every(row => row.approval_status === 'approved');
      const approvalPatch = allApproved
        ? { status: 'approved', approved_by_id: employee.id, approved_by_name: employee.full_name, approved_at: now, rejection_comment: null, updated_at: now }
        : { status: 'pending', approved_by_id: null, approved_by_name: null, approved_at: null, updated_at: now };
      const { data: approvalRow, error: approvalError } = await supabase.from('v2_payroll_approvals')
        .update(approvalPatch).eq('school_key', schoolKey).eq('period_month', periodMonth)
        .eq('period_year', periodYear).select('*').single();
      if (approvalError) throw approvalError;
      return response({ ok: true, approval: approvalRow, entries: changedEntries });
    }

    return response({ ok: false, error: 'Неизвестное действие' }, 400);
  } catch (error) {
    return response({ ok: false, error: error instanceof Error ? error.message : 'Ошибка согласования табеля' }, 500);
  }
});
