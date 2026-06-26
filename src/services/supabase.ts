import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://mmcxugtxnfsafgxbpbix.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_0JXvCHTIc984oEoFBloemQ_kCgDF6Bb';

if (typeof window !== 'undefined') {
  Object.keys(window.localStorage)
    .filter(key => key.startsWith('sb-') && key.endsWith('-auth-token'))
    .forEach(key => window.localStorage.removeItem(key));
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
