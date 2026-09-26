import type { QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type OrderActivityChange = {
  type?: string;
  field?: string;
  label?: string;
  before?: unknown;
  after?: unknown;
  addition_reason?: string;
};

export type OrderActivityEvent = {
  id: string;
  occurred_at: string | null;
  event_type?: string;
  action?: string;
  actor_display_name: string;
  summary?: string;
  reason_code?: string | null;
  reason_note?: string | null;
  metadata?: { hold_until_date?: string | null; [key: string]: unknown } | null;
  changes?: OrderActivityChange[];
};

export type OrderActivityProvenance = {
  origin_source?: string | null;
  created_at?: string | null;
  created_by_display_name?: string | null;
  assigned_to_display_name?: string | null;
  last_edited_by?: string | null;
  viewer_count?: number;
};

export type OrderActivityResponse = {
  events: OrderActivityEvent[];
  provenance?: OrderActivityProvenance;
};

export const ORDER_ACTIVITY_PREFETCH_STALE_MS = 15_000;

export async function fetchOrderActivity(endpoint: string): Promise<OrderActivityResponse> {
  const response = await apiFetch(endpoint);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not load activity");
  return body;
}

export function orderActivityQueryOptions(endpoint: string) {
  return {
    queryKey: [endpoint],
    queryFn: () => fetchOrderActivity(endpoint),
  };
}

export function prefetchOrderActivity(queryClient: QueryClient, endpoint: string) {
  return queryClient.prefetchQuery({
    ...orderActivityQueryOptions(endpoint),
    staleTime: ORDER_ACTIVITY_PREFETCH_STALE_MS,
  });
}

// Refetches even when the Logs tab is closed, so opening it shows fresh data immediately.
export function refreshOrderActivity(queryClient: QueryClient, endpoint: string) {
  return queryClient.invalidateQueries({ queryKey: [endpoint], refetchType: "all" });
}
