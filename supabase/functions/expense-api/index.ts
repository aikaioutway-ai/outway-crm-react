import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ROLES = new Set(['admin', 'gen_director']);
const ALLOWED_CATEGORIES = new Set(['school', 'office', 'logistics', 'extra_trip', 'personal']);
const ALLOWED_METHODS = new Set(['cash', 'cashless']);
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

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405);
  try {
    const session = await verifySession(req.headers.get('x-employee-session') ?? '');
    if (!session) return response({ ok: false, error: 'Сессия недействительна или истекла' }, 401);
    if (!ALLOWED_ROLES.has(session.role)) return response({ ok: false, error: 'Нет доступа к расходам' }, 403);

    const body = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    if (body.action === 'list') {
      if (!validDate(body.periodStart) || !validDate(body.periodEnd)) return response({ ok: false, error: 'Некорректный период' }, 400);
      const { data, error } = await supabase.from('v2_expenses').select('*')
        .gte('expense_date', body.periodStart).lte('expense_date', body.periodEnd)
        .order('expense_date', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;
      return response({ ok: true, rows: data ?? [] });
    }
    if (body.action === 'create') {
      const expense = body.expense ?? {};
      const name = String(expense.name ?? '').trim();
      const category = String(expense.category ?? '');
      const subcategory = String(expense.subcategory ?? '').trim();
      const unitPrice = Number(expense.unitPrice);
      const quantity = Number(expense.quantity);
      const expenseDate = expense.expenseDate;
      const paymentMethod = String(expense.paymentMethod ?? '');
      if (!name || !subcategory || !ALLOWED_CATEGORIES.has(category) || !ALLOWED_METHODS.has(paymentMethod) || !validDate(expenseDate) || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(quantity) || quantity <= 0) {
        return response({ ok: false, error: 'Проверьте обязательные поля расхода' }, 400);
      }
      const amount = Math.round(unitPrice * quantity * 100) / 100;
      const { data, error } = await supabase.from('v2_expenses').insert({
        name, category, subcategory, unit_price: unitPrice, quantity, amount,
        expense_date: expenseDate, payment_method: paymentMethod,
        comment: String(expense.comment ?? '').trim() || null,
        created_by: session.sub,
      }).select('*').single();
      if (error) throw error;
      return response({ ok: true, row: data });
    }
    return response({ ok: false, error: 'Неизвестное действие' }, 400);
  } catch (error) {
    return response({ ok: false, error: error instanceof Error ? error.message : 'Ошибка сервера' }, 500);
  }
});
