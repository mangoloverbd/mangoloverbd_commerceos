import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AIAlertInsight {
  headline: string;
  insight: string;
}

export interface AIAlerts {
  stalePending?: AIAlertInsight;
  unsentConfirmed?: AIAlertInsight;
}

const CACHE_KEY = "ai_alerts_cache";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function useAIAlerts() {
  const [data, setData] = useState<AIAlerts>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { ts, value } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL_MS) {
          setData(value);
          return;
        }
      } catch {}
    }

    const fetch = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const res = await window.fetch(`${supabaseUrl}/functions/v1/ai-alerts`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) return;
        const json = await res.json();
        setData(json);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), value: json }));
      } catch (e) {
        console.error("useAIAlerts error", e);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, []);

  return { data, loading };
}
