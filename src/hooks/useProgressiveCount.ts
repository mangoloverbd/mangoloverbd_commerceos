import { startTransition, useEffect, useState } from "react";

/**
 * How many items of a long list to render. The first `initial` render at once; the
 * rest follow in batches once `delayMs` has passed (the page's entrance), each as a
 * transition so React renders it in slices. Opening a page with a 100+ row table
 * then never freezes its animation.
 */
export function useProgressiveCount(
  total: number,
  { initial = 20, batch = 20, delayMs = 900, enabled = true }: { initial?: number; batch?: number; delayMs?: number; enabled?: boolean } = {},
): number {
  const [count, setCount] = useState(initial);

  useEffect(() => {
    if (!enabled || count >= total) return;
    const timer = window.setTimeout(
      () => startTransition(() => setCount((current) => current + batch)),
      count === initial ? delayMs : 0,
    );
    return () => window.clearTimeout(timer);
  }, [enabled, count, total, initial, batch, delayMs]);

  return enabled ? Math.min(count, total) : total;
}
