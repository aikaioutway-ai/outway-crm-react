import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ROLES = new Set(['admin', 'cashier']);
const ALLOWED_METHODS = new Set(['cash', 'personal_account', 'legal_account']);
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
    if (!payload?.sub || !payload?.role || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
    return { sub: String(payload.sub), role: String(payload.role) };
  } catch {
    return null;
  }
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
    if (!ALLOWED_ROLES.has(session.role)) return response({ ok: false, error: 'Редактировать выплаты могут только администратор и кассир' }, 403);

    const body = await req.json();
    const payoutId = String(body.payoutId ?? '');
    if (!payoutId) return response({ ok: false, error: 'Не указана выплата' }, 400);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (body.action === 'update') {
      const payout = (body.payout && typeof body.payout === 'object' ? body.payout : {}) as Record<string, unknown>;
      const amount = Number(payout.amount);
      const method = String(payout.method ?? '');
      if (!Number.isFinite(amount) || amount <= 0 || !ALLOWED_METHODS.has(method) || !validDate(payout.paymentDate)) {
        return response({ ok: false, error: 'Проверьте сумму, способ и дату выплаты' }, 400);
      }
      const { data, error } = await supabase.from('v2_b2b_driver_payments').update({
        amount,
        payment_method: method,
        payment_date: payout.paymentDate,
        purpose: String(payout.purpose ?? '').trim(),
        payment_order_number: String(payout.paymentOrderNumber ?? '').trim() || null,
      }).eq('id', payoutId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return response({ ok: false, error: 'Выплата не найдена' }, 404);
      return response({ ok: true });
    }

    if (body.action === 'delete') {
      const { data, error } = await supabase.from('v2_b2b_driver_payments').delete().eq('id', payoutId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return response({ ok: false, error: 'Выплата не найдена' }, 404);
      return response({ ok: true });
    }

    return response({ ok: false, error: 'Неизвестное действие' }, 400);
  } catch (error) {
    return response({ ok: false, error: error instanceof Error ? error.message : 'Ошибка сервера' }, 500);
  }
});
