import type { QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// Minimal shape the sync needs; callers keep their own richer Order type.
export interface SyncableOrder {
  id: string;
  created_at?: string | null;
}

export class OrdersSyncError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface OrdersResponse<T> {
  orders?: T[];
  totalCount?: number;
  syncedAt?: string;
  delta?: boolean;
}

const FULL_REFRESH_MS = 10 * 60_000;

// Cursor for the list currently held in the ["/api/orders"] cache.
let cursor: { syncedAt: string; fullAt: number } | null = null;

export function resetOrdersSyncCursor(): void {
  cursor = null;
}

/** Replace changed orders by id, insert new ones, sort by created_at desc (stable). */
export function mergeOrderDelta<T extends SyncableOrder>(current: T[], changed: T[]): T[] {
  const changedById = new Map(changed.map((order) => [order.id, order]));
  const merged = current.map((order) => changedById.get(order.id) ?? order);
  const existingIds = new Set(current.map((order) => order.id));
  for (const order of changed) {
    if (!existingIds.has(order.id)) merged.push(order);
  }
  return merged
    .map((order, index) => ({ order, index, time: Date.parse(order.created_at ?? "") || 0 }))
    .sort((left, right) => right.time - left.time || left.index - right.index)
    .map(({ order }) => order);
}

async function fetchOrdersResponse<T>(url: string): Promise<OrdersResponse<T>> {
  const res = await apiFetch(url);
  if (!res.ok) throw new OrdersSyncError("Failed to load orders", res.status);
  return (await res.json()) as OrdersResponse<T>;
}

function totalCountOf<T>(data: OrdersResponse<T>, fallback: number): number {
  return typeof data.totalCount === "number" && Number.isFinite(data.totalCount) ? data.totalCount : fallback;
}

function writeCache<T>(queryClient: QueryClient, orders: T[], totalCount: number): void {
  queryClient.setQueryData(["/api/orders"], orders);
  queryClient.setQueryData(["/api/orders/count"], totalCount);
}

async function fullSync<T extends SyncableOrder>(queryClient: QueryClient): Promise<T[]> {
  const data = await fetchOrdersResponse<T>("/api/orders");
  const orders = data.orders || [];
  writeCache(queryClient, orders, totalCountOf(data, orders.length));
  cursor = data.syncedAt ? { syncedAt: data.syncedAt, fullAt: Date.now() } : null;
  return orders;
}

/**
 * Refresh the cached orders list. Uses a delta request when a cached list and
 * a recent cursor exist; otherwise (or with `full`) reloads the whole list.
 * Writes ["/api/orders"] and ["/api/orders/count"] and returns the list.
 */
export async function syncOrders<T extends SyncableOrder>(
  queryClient: QueryClient,
  opts: { full?: boolean } = {},
): Promise<T[]> {
  const current = queryClient.getQueryData<T[]>(["/api/orders"]);
  if (opts.full || !Array.isArray(current) || !cursor || Date.now() - cursor.fullAt > FULL_REFRESH_MS) {
    return fullSync<T>(queryClient);
  }

  const { fullAt } = cursor;
  const data = await fetchOrdersResponse<T>(`/api/orders?changed_since=${encodeURIComponent(cursor.syncedAt)}`);
  // A server that ignored the cursor returned the full list.
  if (data.delta !== true) {
    const orders = data.orders || [];
    writeCache(queryClient, orders, totalCountOf(data, orders.length));
    cursor = data.syncedAt ? { syncedAt: data.syncedAt, fullAt: Date.now() } : null;
    return orders;
  }

  const merged = mergeOrderDelta(current, data.orders || []);
  const totalCount = totalCountOf(data, merged.length);
  // Deletes are invisible to a delta; a count mismatch means reload.
  if (merged.length !== totalCount) return fullSync<T>(queryClient);

  writeCache(queryClient, merged, totalCount);
  cursor = data.syncedAt ? { syncedAt: data.syncedAt, fullAt } : null;
  return merged;
}
