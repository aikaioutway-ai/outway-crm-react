// supabase/functions/employee-login/index.ts
// Серверная проверка логина/пароля сотрудника — password_hash больше не
// уходит в браузер (см. supabase/v2_employee_password_hardening.sql).
//
// Деплой:
//   supabase functions deploy employee-login --no-verify-jwt
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
//
// Вызов из CRM: supabase.functions.invoke('employee-login', { body: { login, password } })

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return Response.json({ ok: false, error: 'Method not allowed' }, { headers: corsHeaders, status: 405 });
  }

  try {
    const { login, password } = await req.json();
    const normalizedLogin = String(login ?? '').trim();
    const normalizedPassword = String(password ?? '').trim();
    if (!normalizedLogin || !normalizedPassword) {
      return Response.json({ ok: false, error: 'Логин и пароль обязательны' }, { headers: corsHeaders, status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: employee, error } = await supabase
      .from('v2_employees')
      .select('id, full_name, login, role, position, school_keys, status, password_hash')
      .eq('login', normalizedLogin)
      .eq('status', 'active')
      .single();

    if (error || !employee || employee.role === 'driver') {
      return Response.json({ ok: false, error: 'Неверный логин или пароль' }, { headers: corsHeaders, status: 401 });
    }

    const passwordHash = await sha256Hex(normalizedPassword);
    if (!employee.password_hash || employee.password_hash !== passwordHash) {
      return Response.json({ ok: false, error: 'Неверный логин или пароль' }, { headers: corsHeaders, status: 401 });
    }

    return Response.json({
      ok: true,
      user: {
        id: employee.id,
        name: employee.full_name,
        login: employee.login,
        role: employee.role,
        schoolKeys: Array.isArray(employee.school_keys) ? employee.school_keys : ['ALL'],
        position: employee.position ?? undefined,
      },
    }, { headers: corsHeaders });
  } catch (err) {
    return Response.json({
      ok: false,
      error: err instanceof Error ? err.message : 'Login failed',
    }, { headers: corsHeaders, status: 500 });
  }
});
