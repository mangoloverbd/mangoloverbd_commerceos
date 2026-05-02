import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function makeClient(url: string, key: string) {
  return createClient<Database>(url, key, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

// Start with env vars as fallback (may be empty on Replit)
const envUrl = import.meta.env.VITE_SUPABASE_URL || "";
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

export let supabase = makeClient(envUrl, envKey);

// Re-initialize after fetching config from the server
export async function initSupabaseFromServer() {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) return;
    const cfg = await res.json();
    if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
      supabase = makeClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    }
  } catch {}
}
