import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useVisibleInterval } from "@/hooks/useVisibleInterval";

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
 * Polls GET /api/live-visitors every `pollMs` (paused while the tab is
 * hidden) and returns the latest
 * count + behavior details. Failure-tolerant: errors keep the previous
 * values (zeros initially) and never surface to the UI.
 */
export function useLiveVisitors(pollMs = 30000): LiveVisitorsState {
  const [count, setCount] = useState(0);
  const [details, setDetails] = useState<LiveVisitorDetails>(EMPTY_DETAILS);
  const [loaded, setLoaded] = useState(false);
  const cancelledRef = useRef(false);

  const fetchCount = useCallback(async () => {
    try {
      const res = await apiFetch("/api/live-visitors", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (!cancelledRef.current) {
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
      if (!cancelledRef.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    void fetchCount();
    return () => {
      cancelledRef.current = true;
    };
  }, [fetchCount]);

  useVisibleInterval(() => void fetchCount(), pollMs);

  return { count, details, loaded };
}
