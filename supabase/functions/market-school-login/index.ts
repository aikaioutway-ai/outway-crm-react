// supabase/functions/market-school-login/index.ts
// Логин клиента Маркета (школы) для отдельного портала — по образцу
// supabase/functions/employee-login. Возвращает HMAC-подписанный токен
// с ролью 'market_client' и client_id в payload.sub; портал никогда
// не видит password_hash и не может подставить чужой client_id.
//
// Деплой:
//   supabase functions deploy market-school-login --no-verify-jwt
//
// Вызов из портала: supabase.functions.invoke('market-school-login', { body: { login, password } })

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64Url(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

async function createClientSessionToken(client: { id: string; name: string }): Promise<string> {
  const payload = base64Url(JSON.stringify({
    sub: client.id,
    role: 'market_client',
    exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60,
  }));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SUPABASE_SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  return `${payload}.${base64Url(signature)}`;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return Response.json({ ok: false, error: 'Method not allowed' }, { headers: corsHeaders, status: 405 });

  try {
    const { login, password } = await req.json();
    const normalizedLogin = String(login ?? '').trim();
    const normalizedPassword = String(password ?? '').trim();
    if (!normalizedLogin || !normalizedPassword) {
      return Response.json({ ok: false, error: 'Логин и пароль обязательны' }, { headers: corsHeaders, status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: client, error } = await supabase
      .from('v2_market_clients')
      .select('id, name, login, password_hash, active')
      .eq('login', normalizedLogin)
      .eq('active', true)
      .single();

    if (error || !client) {
      return Response.json({ ok: false, error: 'Неверный логин или пароль' }, { headers: corsHeaders, status: 401 });
    }

    const passwordHash = await sha256Hex(normalizedPassword);
    if (!client.password_hash || client.password_hash !== passwordHash) {
      return Response.json({ ok: false, error: 'Неверный логин или пароль' }, { headers: corsHeaders, status: 401 });
    }

    const sessionToken = await createClientSessionToken(client);
    return Response.json({
      ok: true,
      client: { id: client.id, name: client.name, login: client.login, sessionToken },
    }, { headers: corsHeaders });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : 'Login failed' }, { headers: corsHeaders, status: 500 });
  }
});
