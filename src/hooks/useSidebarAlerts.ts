import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

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

interface OrderAlertSource {
  id: string;
  order_number: string;
  customer_name: string | null;
  created_at: string;
  status: string | null;
  sent_to_courier?: boolean | null;
}

function toSidebarAlerts(orders: OrderAlertSource[]): SidebarAlert[] {
  const now = Date.now();
  const twoDaysMs = 2 * 24 * 60 * 60 * 1000;

  return orders
    .filter((order) => {
      const status = String(order.status || "").toLowerCase();
      const ageMs = now - new Date(order.created_at).getTime();
      if (status === "pending") return ageMs > twoDaysMs;
      if (status === "confirmed") return order.sent_to_courier !== true;
      return false;
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(0, 20)
    .map((order) => ({
      id: order.id,
      type: String(order.status || "").toLowerCase() === "pending" ? "stale_pending" : "unsent_confirmed",
      order_number: order.order_number,
      customer_name: order.customer_name,
      created_at: order.created_at,
      daysOld: Math.floor((now - new Date(order.created_at).getTime()) / 86400000),
    }));
}

function fallbackAIInsights(alerts: SidebarAlert[]): SidebarAIInsights {
  const stalePending = alerts.filter((alert) => alert.type === "stale_pending");
  const unsentConfirmed = alerts.filter((alert) => alert.type === "unsent_confirmed");

  return {
    stalePending: stalePending.length
      ? {
          headline: `${stalePending.length} pending order${stalePending.length === 1 ? "" : "s"} need follow-up`,
          insight: `Oldest is #${stalePending[0].order_number}, ${stalePending[0].daysOld}d old.`,
        }
      : undefined,
    unsentConfirmed: unsentConfirmed.length
      ? {
          headline: `${unsentConfirmed.length} confirmed order${unsentConfirmed.length === 1 ? "" : "s"} ready`,
          insight: `Send #${unsentConfirmed[0].order_number} to courier first.`,
        }
      : undefined,
  };
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
      console.error("useSidebarAlerts error", e);
      try {
        const ordersRes = await apiFetch("/api/orders", { cache: "no-store" });
        if (!ordersRes.ok) throw new Error("Failed to load fallback orders");
        const ordersData = await ordersRes.json();
        const fallbackAlerts = toSidebarAlerts((ordersData.orders as OrderAlertSource[]) || []);
        setAlerts(fallbackAlerts);
        setAIInsights(fallbackAIInsights(fallbackAlerts));
      } catch (fallbackError) {
        console.error("useSidebarAlerts fallback error", fallbackError);
      }
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
    const intervalId = window.setInterval(fetch, 60000);
    return () => window.clearInterval(intervalId);
  }, [user?.id, fetch]);

  const stalePending = alerts.filter((a) => a.type === "stale_pending");
  const unsentConfirmed = alerts.filter((a) => a.type === "unsent_confirmed");

  return { alerts, stalePending, unsentConfirmed, aiInsights, loading };
}
