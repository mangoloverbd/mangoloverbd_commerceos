import { supabase } from "@/integrations/supabase/client";

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export type AppConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  stripePublishableKey?: string;
  aiProvider?: string;
  aiDefaultModel?: string;
};

let cachedConfig: AppConfig | null = null;

// Fetches /api/config once and caches it. Safe to call repeatedly.
export async function getAppConfig(): Promise<AppConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    if (res.ok) cachedConfig = (await res.json()) as AppConfig;
  } catch {
    // ignore — fall back to defaults
  }
  return cachedConfig ?? ({} as AppConfig);
}
