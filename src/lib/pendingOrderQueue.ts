export const PENDING_ORDER_QUEUE_KEY = "ml:pending-order-queue";
const PRINT_ORDER_QUEUE_KEY = "ml:print-order-queue";
export const PENDING_QUEUE_MAX_AGE_MS = 30 * 60 * 1000;

export type NavigableQueueTab = "pending" | "print";

const QUEUE_KEYS: Record<NavigableQueueTab, string> = {
  pending: PENDING_ORDER_QUEUE_KEY,
  print: PRINT_ORDER_QUEUE_KEY,
};

type PendingQueuePayload = {
  ids: string[];
  savedAt: number;
};

export function saveTabOrderQueue(tab: NavigableQueueTab, ids: string[]): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const payload: PendingQueuePayload = { ids, savedAt: Date.now() };
    window.localStorage.setItem(QUEUE_KEYS[tab], JSON.stringify(payload));
  } catch {
    return;
  }
}

export function readTabOrderQueue(tab: NavigableQueueTab, now: number = Date.now()): string[] | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(QUEUE_KEYS[tab]);
    if (!raw) return null;
    const payload = JSON.parse(raw) as Partial<PendingQueuePayload>;
    if (!Array.isArray(payload.ids)) return null;
    if (typeof payload.savedAt !== "number") return null;
    if (now - payload.savedAt > PENDING_QUEUE_MAX_AGE_MS) return null;
    const ids = payload.ids.filter((value): value is string => typeof value === "string");
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

export function savePendingOrderQueue(ids: string[]): void {
  saveTabOrderQueue("pending", ids);
}

export function readPendingOrderQueue(now: number = Date.now()): string[] | null {
  return readTabOrderQueue("pending", now);
}
