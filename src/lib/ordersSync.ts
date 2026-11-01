import type { QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { clearOrdersSnapshot, loadOrdersSnapshot, saveOrdersSnapshot } from "@/lib/ordersSnapshot";

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
  // Latest DB updated_at the server saw; null when there were no rows.
  syncedAt?: string | null;
  delta?: boolean;
}

/** Orders shown before the full list arrives: the saved list, or the newest first page. */
export interface OrdersPreview<T> {
  orders: T[];
  totalCount: number;
  // true for the first page only: the list (and every count derived from it) is incomplete.
  partial: boolean;
}

// Newest orders fetched alongside a cold full load. Covers the largest table page size.
export const FIRST_PAGE_SIZE = 200;

// Deletes are caught by the count check on every delta; this is only a safety net.
const FULL_REFRESH_MS = 30 * 60_000;

// Cursor for the list currently held in the ["/api/orders"] cache.
let cursor: { syncedAt: string; fullAt: number } | null = null;

// The sync currently running per query client, shared by overlapping callers.
let inFlight = new WeakMap<QueryClient, Promise<unknown>>();

// Signed-in user whose list is saved in this browser; null saves nothing.
let snapshotUserId: string | null = null;
// The saved list is read at most once per user (the first sync with an empty cache).
let snapshotChecked = false;
// A first page shown while the full list loads; cleared once the full list is cached.
let partialPreview: OrdersPreview<unknown> | null = null;
const previewListeners = new Set<(preview: OrdersPreview<unknown>) => void>();
let pendingSave: (() => void) | null = null;

export function resetOrdersSyncCursor(): void {
  cursor = null;
  inFlight = new WeakMap();
  snapshotChecked = false;
  partialPreview = null;
  pendingSave = null;
}

/**
 * Called by the auth provider whenever the signed-in user changes. Another user
 * (or sign-out) wipes the list saved in this browser.
 */
export function setOrdersSyncUser(userId: string | null): void {
  if (userId !== null && userId === snapshotUserId) return;
  // Signed out (including an expired session at startup) or switched user.
  const wipe = userId === null || snapshotUserId !== null;
  snapshotUserId = userId;
  resetOrdersSyncCursor();
  if (wipe) void clearOrdersSnapshot();
}

/** The first page currently shown in place of the full list, if any. */
export function getOrdersPreview<T>(): OrdersPreview<T> | null {
  return partialPreview as OrdersPreview<T> | null;
}

/** Notified when orders can be shown before the sync that loads them finishes. */
export function subscribeOrdersPreview<T>(listener: (preview: OrdersPreview<T>) => void): () => void {
  const wrapped = listener as (preview: OrdersPreview<unknown>) => void;
  previewListeners.add(wrapped);
  return () => { previewListeners.delete(wrapped); };
}

function emitPreview<T>(preview: OrdersPreview<T>): void {
  partialPreview = preview.partial ? preview : null;
  for (const listener of previewListeners) listener(preview);
}

// Saving clones the whole list on the main thread, so it waits for an idle moment
// and only the latest list is written.
function scheduleSnapshotSave<T>(orders: T[], totalCount: number): void {
  const userId = snapshotUserId;
  if (!userId) return;
  const saved = cursor;
  const save = () => {
    if (pendingSave !== save || snapshotUserId !== userId) return;
    pendingSave = null;
    if (!saved) void clearOrdersSnapshot();
    else void saveOrdersSnapshot({ userId, orders, totalCount, syncedAt: saved.syncedAt, fullAt: saved.fullAt });
  };
  pendingSave = save;
  if (typeof window === "undefined") return;
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(save, { timeout: 5_000 });
  else window.setTimeout(save, 1_000);
}

// Puts the list saved in this browser into the cache and shows it. The sync then
// continues from its cursor: a delta, or a full reload when it is over 30 minutes old.
async function hydrateFromSnapshot<T extends SyncableOrder>(queryClient: QueryClient): Promise<T[] | null> {
  const userId = snapshotUserId;
  snapshotChecked = true;
  if (!userId) return null;
  const snapshot = await loadOrdersSnapshot<T>(userId);
  // Signed out, or another sync filled the cache while the snapshot was read.
  if (!snapshot || snapshotUserId !== userId || queryClient.getQueryData(["/api/orders"])) return null;
  writeCache(queryClient, snapshot.orders, snapshot.totalCount);
  cursor = { syncedAt: snapshot.syncedAt, fullAt: snapshot.fullAt };
  emitPreview({ orders: snapshot.orders, totalCount: snapshot.totalCount, partial: false });
  return snapshot.orders;
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

// `firstPage` also asks for the newest orders and shows them if they arrive
// before the full list (only when nothing is cached).
async function fullSync<T extends SyncableOrder>(queryClient: QueryClient, firstPage = false): Promise<T[]> {
  const full = fetchOrdersResponse<T>("/api/orders");
  if (firstPage) {
    let fullDone = false;
    full.then(() => { fullDone = true; }, () => { fullDone = true; });
    fetchOrdersResponse<T>(`/api/orders?limit=${FIRST_PAGE_SIZE}`)
      .then((page) => {
        if (fullDone || queryClient.getQueryData(["/api/orders"])) return;
        const orders = page.orders || [];
        emitPreview({ orders, totalCount: totalCountOf(page, orders.length), partial: true });
      })
      // The full list is what matters; a failed first page just isn't shown.
      .catch(() => undefined);
  }
  const data = await full;
  const orders = data.orders || [];
  const totalCount = totalCountOf(data, orders.length);
  writeCache(queryClient, orders, totalCount);
  partialPreview = null;
  cursor = data.syncedAt ? { syncedAt: data.syncedAt, fullAt: Date.now() } : null;
  scheduleSnapshotSave(orders, totalCount);
  return orders;
}

/**
 * Refresh the cached orders list. Uses a delta request when a cached list and
 * a recent cursor exist; otherwise (or with `full`) reloads the whole list.
 * Writes ["/api/orders"] and ["/api/orders/count"] and returns the list.
 * An overlapping plain call shares the in-flight sync; an overlapping full
 * call waits for it and then runs. `fresh` also waits and then runs, but as a
 * delta, for changes made after the in-flight request may have read the data.
 */
export function syncOrders<T extends SyncableOrder>(
  queryClient: QueryClient,
  opts: { full?: boolean; fresh?: boolean; firstPage?: boolean } = {},
): Promise<T[]> {
  const previous = inFlight.get(queryClient);
  if (previous && !opts.full && !opts.fresh) return previous as Promise<T[]>;

  const run = previous
    ? previous.catch(() => undefined).then(() => runSync<T>(queryClient, opts))
    : runSync<T>(queryClient, opts);
  inFlight.set(queryClient, run);
  const clear = () => {
    if (inFlight.get(queryClient) === run) inFlight.delete(queryClient);
  };
  run.then(clear, clear);
  return run;
}

async function runSync<T extends SyncableOrder>(
  queryClient: QueryClient,
  opts: { full?: boolean; firstPage?: boolean },
): Promise<T[]> {
  let current = queryClient.getQueryData<T[]>(["/api/orders"]);
  // A reload starts with an empty cache: show the list saved in this browser first.
  if (!Array.isArray(current) && !opts.full && snapshotUserId && !snapshotChecked) {
    current = (await hydrateFromSnapshot<T>(queryClient)) ?? undefined;
  }
  if (opts.full || !Array.isArray(current) || !cursor || Date.now() - cursor.fullAt > FULL_REFRESH_MS) {
    return fullSync<T>(queryClient, Boolean(opts.firstPage) && !Array.isArray(current));
  }

  const { fullAt } = cursor;
  const data = await fetchOrdersResponse<T>(`/api/orders?changed_since=${encodeURIComponent(cursor.syncedAt)}`);
  // A server that ignored the cursor returned the full list.
  if (data.delta !== true) {
    const orders = data.orders || [];
    const totalCount = totalCountOf(data, orders.length);
    writeCache(queryClient, orders, totalCount);
    cursor = data.syncedAt ? { syncedAt: data.syncedAt, fullAt: Date.now() } : null;
    scheduleSnapshotSave(orders, totalCount);
    return orders;
  }

  // Merge into the cache as it is now, not as it was before the request, so
  // optimistic updates made while the delta was in flight are kept.
  const latest = queryClient.getQueryData<T[]>(["/api/orders"]);
  if (!Array.isArray(latest)) return fullSync<T>(queryClient);
  const merged = mergeOrderDelta(latest, data.orders || []);
  const totalCount = totalCountOf(data, merged.length);
  // Deletes are invisible to a delta; a count mismatch means reload.
  if (merged.length !== totalCount) return fullSync<T>(queryClient);

  writeCache(queryClient, merged, totalCount);
  const previousSyncedAt = cursor?.syncedAt;
  cursor = data.syncedAt ? { syncedAt: data.syncedAt, fullAt } : null;
  // Most polls change nothing; only a changed list is saved again.
  if ((data.orders?.length ?? 0) > 0 || cursor?.syncedAt !== previousSyncedAt) scheduleSnapshotSave(merged, totalCount);
  return merged;
}
