export const PENDING_ORDER_QUEUE_KEY = "ml:pending-order-queue";
export const PENDING_QUEUE_MAX_AGE_MS = 30 * 60 * 1000;

type PendingQueuePayload = {
  ids: string[];
  savedAt: number;
};

export function savePendingOrderQueue(ids: string[]): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const payload: PendingQueuePayload = { ids, savedAt: Date.now() };
    window.localStorage.setItem(PENDING_ORDER_QUEUE_KEY, JSON.stringify(payload));
  } catch {
    return;
  }
}

export function readPendingOrderQueue(now: number = Date.now()): string[] | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(PENDING_ORDER_QUEUE_KEY);
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
