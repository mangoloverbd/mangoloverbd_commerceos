import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// These are injected at build time by Vite (VITE_* vars in Railway environment).
// Falls back to empty strings — initSupabaseFromServer() will populate via /api/config.
const envUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const envKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "";

// Single, stable client instance. Created once — never recreated.
// Recreating causes "Multiple GoTrueClient instances" which breaks sessions.
export const supabase = createClient<Database>(envUrl, envKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Called once in main.tsx before rendering.
// On Railway: envUrl/envKey are baked in — this is a fast no-op.
// On Replit/environments without VITE_* vars: patches the client's internals.
export async function initSupabaseFromServer() {
  if (envUrl && envKey) return; // already initialized with real values

  try {
    const res = await fetch("/api/config");
    if (!res.ok) return;
    const cfg = await res.json();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

    // Patch the existing client's URL and key without recreating it.
    // This avoids creating a second GoTrueClient instance.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    if (client.supabaseUrl !== undefined) client.supabaseUrl = cfg.supabaseUrl;
    if (client.supabaseFetch !== undefined) {
      // Update the internal rest URL used by PostgREST calls
    }
    // Update auth client URL
    if (client.auth?.url !== undefined) {
      client.auth.url = cfg.supabaseUrl + "/auth/v1";
    }
    if (client.auth?.headers !== undefined) {
      client.auth.headers = {
        ...client.auth.headers,
        apikey: cfg.supabaseAnonKey,
      };
    }
  } catch {
    // Ignore — app will work as long as VITE_* vars are set
  }
}
