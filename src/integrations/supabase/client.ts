import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

type SupabaseConfig = {
  url: string;
  key: string;
};

let client: SupabaseClient<Database> | null = null;

function envConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL ?? "";
  const key =
    import.meta.env.VITE_SUPABASE_ANON_KEY ??
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    "";
  return url && key ? { url, key } : null;
}

async function runtimeConfig(): Promise<SupabaseConfig | null> {
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    if (!res.ok) return null;
    const cfg = await res.json();
    const url = cfg.supabaseUrl ?? "";
    const key = cfg.supabaseAnonKey ?? "";
    return url && key ? { url, key } : null;
  } catch {
    return null;
  }
}

function createSupabaseClient({ url, key }: SupabaseConfig) {
  return createClient<Database>(url, key, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export async function initSupabaseFromServer() {
  if (client) return;

  const config = envConfig() ?? await runtimeConfig();
  if (!config) {
    throw new Error(
      "[Supabase] Missing browser config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or expose /api/config."
    );
  }

  client = createSupabaseClient(config);
}

export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop, receiver) {
    if (!client) {
      throw new Error("[Supabase] Client used before initSupabaseFromServer() finished.");
    }
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
