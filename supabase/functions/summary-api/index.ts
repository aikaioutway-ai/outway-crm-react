// supabase/functions/summary-api/index.ts
// «Сводка»: сохранение рабочих дней месяца для расчёта COGS. Число дней общее
// для владельца (emp-admin) и гендиректора, поэтому браузер напрямую писать в
// v2_summary_working_days не может (см. миграцию 20261028120000_summary_forecast.sql).
//
// Деплой:
//   supabase functions deploy summary-api --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OWNER_EMPLOYEE_ID = 'emp-admin';
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
    if (employee.id !== OWNER_EMPLOYEE_ID && employee.role !== 'gen_director') {
      return response({ ok: false, error: 'Сводка доступна только владельцу и гендиректору' }, 403);
    }

    const body = await req.json();
    if (body.action === 'setWorkingDays') {
      const year = Number(body.year);
      const month = Number(body.month);
      const days = Number(body.days);
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return response({ ok: false, error: 'Некорректный месяц' }, 400);
      }
      if (!Number.isInteger(days) || days < 14 || days > 24) {
        return response({ ok: false, error: 'Выберите от 14 до 24 дней' }, 400);
      }
      const { error } = await supabase.from('v2_summary_working_days').upsert({
        period_year: year,
        period_month: month,
        days,
        updated_by: String(employee.full_name ?? 'CRM'),
        updated_at: new Date().toISOString(),
      });
      if (error) return response({ ok: false, error: error.message }, 400);
      return response({ ok: true });
    }

    return response({ ok: false, error: 'Неизвестное действие' }, 400);
  } catch (error) {
    return response({ ok: false, error: error instanceof Error ? error.message : 'Ошибка сервера' }, 500);
  }
});
