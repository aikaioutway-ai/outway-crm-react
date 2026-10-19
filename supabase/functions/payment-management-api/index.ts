import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ROLES = new Set(['admin', 'gen_director', 'cashier']);
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
  if (!payload?.sub || !payload?.role || !Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
  return { sub: String(payload.sub), role: String(payload.role) };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405);
  try {
    const session = await verifySession(req.headers.get('x-employee-session') ?? '');
    if (!session) return response({ ok: false, error: 'Сессия недействительна или истекла' }, 401);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: employee, error: employeeError } = await supabase.from('v2_employees')
      .select('id, full_name, role, status').eq('id', session.sub).maybeSingle();
    if (employeeError) throw employeeError;
    if (!employee || employee.status !== 'active' || !ALLOWED_ROLES.has(employee.role)) {
      return response({ ok: false, error: 'Нет доступа к удалению платежей' }, 403);
    }
    const body = await req.json();
    if (body.action !== 'delete' || typeof body.paymentId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.paymentId)) {
      return response({ ok: false, error: 'Некорректный платёж' }, 400);
    }
    const { error } = await supabase.rpc('v2_delete_payment_with_history', {
      p_payment_id: body.paymentId, p_actor_id: employee.id,
    });
    if (error) throw error;
    return response({ ok: true });
  } catch (error) {
    return response({ ok: false, error: error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Ошибка удаления платежа' }, 500);
  }
});
