import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useVisibleInterval } from "@/hooks/useVisibleInterval";

export interface SidebarAlert {
  id: string;
  type: "stale_pending" | "unsent_confirmed";
  order_number: string;
  customer_name: string | null;
  created_at: string;
  daysOld: number;
}

export interface SidebarAIInsight {
  headline: string;
  insight: string;
}

export interface SidebarAIInsights {
  stalePending?: SidebarAIInsight;
  unsentConfirmed?: SidebarAIInsight;
}

export function useSidebarAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<SidebarAlert[]>([]);
  const [aiInsights, setAIInsights] = useState<SidebarAIInsights>({});
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const res = await apiFetch("/api/sidebar-alerts", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load sidebar alerts");
      const data = await res.json();

      setAlerts((data.alerts as SidebarAlert[]) || []);
      setAIInsights((data.aiInsights as SidebarAIInsights) || {});
    } catch (e) {
      // Keep the previously loaded alerts/insights; the next poll retries.
      console.error("useSidebarAlerts error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setAlerts([]);
    setAIInsights({});
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch();
  }, [user?.id, fetch]);

  useVisibleInterval(fetch, 5 * 60_000, Boolean(user));

  const stalePending = alerts.filter((a) => a.type === "stale_pending");
  const unsentConfirmed = alerts.filter((a) => a.type === "unsent_confirmed");

  return { alerts, stalePending, unsentConfirmed, aiInsights, loading };
}
