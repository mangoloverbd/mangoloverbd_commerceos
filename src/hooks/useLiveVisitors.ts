import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface LiveVisitorDetails {
  activeCarts: number;
  checkingOut: number;
  purchased: number;
}

export interface LiveVisitorsState {
  count: number;
  details: LiveVisitorDetails;
  loaded: boolean;
}

const EMPTY_DETAILS: LiveVisitorDetails = {
  activeCarts: 0,
  checkingOut: 0,
  purchased: 0,
};

/**
 * Polls GET /api/live-visitors every `pollMs` and returns the latest
 * count + behavior details. Failure-tolerant: errors keep the previous
 * values (zeros initially) and never surface to the UI.
 */
export function useLiveVisitors(pollMs = 5000): LiveVisitorsState {
  const [count, setCount] = useState(0);
  const [details, setDetails] = useState<LiveVisitorDetails>(EMPTY_DETAILS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchCount = async () => {
      try {
        const res = await apiFetch("/api/live-visitors", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setCount(Number(data.count) || 0);
          setDetails({
            activeCarts: Number(data.details?.activeCarts) || 0,
            checkingOut: Number(data.details?.checkingOut) || 0,
            purchased: Number(data.details?.purchased) || 0,
          });
        }
      } catch {
        // Non-critical dashboard signal — keep previous values.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    fetchCount();
    const intervalId = window.setInterval(fetchCount, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [pollMs]);

  return { count, details, loaded };
}
