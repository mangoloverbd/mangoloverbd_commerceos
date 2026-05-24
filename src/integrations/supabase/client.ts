import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const envUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const envKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "";

if (!envUrl || !envKey) {
  console.error(
    "[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY at build time. Auth will not work until these Railway build variables are set."
  );
}

export const supabase = createClient<Database>(envUrl, envKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

export async function initSupabaseFromServer() {
  // Kept for main.tsx compatibility. The browser client must be configured by
  // Vite build variables so it is created exactly once with stable auth storage.
}
