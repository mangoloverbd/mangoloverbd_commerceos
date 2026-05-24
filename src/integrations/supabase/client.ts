import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

// Single client instance — never recreated to avoid multiple GoTrueClient instances
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

// No-op — kept for import compatibility. Env vars are set at build time on Railway.
export async function initSupabaseFromServer() {
  // Previously this re-created the client after fetching /api/config, which caused
  // multiple GoTrueClient instances and session loss (all 401s). Now a no-op.
}
