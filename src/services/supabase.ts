import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mmcxugtxnfsafgxbpbix.supabase.co';
const SUPABASE_KEY = 'sb_publishable_0JXvCHTIc984oEoFBloemQ_kCgDF6Bb';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
