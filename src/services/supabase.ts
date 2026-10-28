import { createClient } from '@supabase/supabase-js';
import { getCrmActor } from './crmActor';

export const SUPABASE_URL = 'https://mmcxugtxnfsafgxbpbix.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_0JXvCHTIc984oEoFBloemQ_kCgDF6Bb';

if (typeof window !== 'undefined') {
  Object.keys(window.localStorage)
    .filter(key => key.startsWith('sb-') && key.endsWith('-auth-token'))
    .forEach(key => window.localStorage.removeItem(key));
}

function fetchWithActor(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const actor = getCrmActor();
  // Только запросы к базе: edge-функции этот заголовок в CORS не пропускают.
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!actor || !url.includes('/rest/v1/')) return fetch(input, init);
  const headers = new Headers(init.headers);
  headers.set('x-crm-employee', actor);
  return fetch(input, { ...init, headers });
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: { fetch: fetchWithActor },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
