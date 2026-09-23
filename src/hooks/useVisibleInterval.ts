import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Like setInterval, but ticks are skipped while the tab is hidden
 * (`document.hidden`). When the tab becomes visible again and at least one
 * tick was skipped, the callback runs once immediately so data is fresh
 * without waiting a full interval. It does not run on mount — callers keep
 * their own initial fetch. The latest callback is always used, so changing
 * it does not restart the timer; changing `delayMs` or `enabled` does.
 */
export function useVisibleInterval(callback: () => void, delayMs: number, enabled = true): void {
  const callbackRef = useRef(callback);

  // Layout effect so a tick right after a re-render already sees the new callback.
  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    let skippedTick = false;

    const intervalId = window.setInterval(() => {
      if (document.hidden) {
        skippedTick = true;
        return;
      }
      callbackRef.current();
    }, delayMs);

    const onVisibilityChange = () => {
      if (document.hidden || !skippedTick) return;
      skippedTick = false;
      callbackRef.current();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [delayMs, enabled]);
}
