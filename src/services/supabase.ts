import { createClient } from '@supabase/supabase-js';
import { getCrmActor } from './crmActor';

export const SUPABASE_URL = 'https://mmcxugtxnfsafgxbpbix.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_0JXvCHTIc984oEoFBloemQ_kCgDF6Bb';

if (typeof window !== 'undefined') {
  Object.keys(window.localStorage)
    .filter(key => key.startsWith('sb-') && key.endsWith('-auth-token'))
    .forEach(key => window.localStorage.removeItem(key));
}

// Серверные функции по умолчанию запускаются в регионе рядом с пользователем,
// а каждый их запрос к базе в Сеуле идёт издалека. Запуск рядом с базой
// ускоряет их в 2–3 раза. Регион передаём параметром в адресе, а не
// заголовком x-region: заголовок не разрешён в CORS функций.
export const FUNCTIONS_REGION = 'ap-northeast-2';

export function withFunctionsRegion(url: string): string {
  if (!url.startsWith(`${SUPABASE_URL}/functions/v1/`)) return url;
  const parsed = new URL(url);
  if (!parsed.searchParams.has('forceFunctionRegion')) parsed.searchParams.set('forceFunctionRegion', FUNCTIONS_REGION);
  return parsed.toString();
}

const regionalFetch: typeof fetch = (input, init) =>
  fetch(typeof input === 'string' ? withFunctionsRegion(input) : input instanceof URL ? withFunctionsRegion(input.toString()) : input, init);

function fetchWithActor(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const actor = getCrmActor();
  // Только запросы к базе: edge-функции этот заголовок в CORS не пропускают.
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!actor || !url.includes('/rest/v1/')) return regionalFetch(input, init);
  const headers = new Headers(init.headers);
  headers.set('x-crm-employee', actor);
  return regionalFetch(input, { ...init, headers });
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: { fetch: fetchWithActor },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
