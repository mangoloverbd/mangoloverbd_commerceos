import { normalizeBdPhone } from "@/lib/bdPhone";
import { classifyOrderStatus, type StatusFilterOrder } from "@/lib/orderStatusFilters";

export type PendingOrderMatch = { id: string; order_number: string | null };

type MatchableOrder = StatusFilterOrder & { id: string; order_number?: string | null; phone?: string | null };

/** Index orders in the Pending tab by normalised BD phone. */
export function buildPendingOrdersByPhone(orders: MatchableOrder[]): Map<string, PendingOrderMatch[]> {
  const map = new Map<string, PendingOrderMatch[]>();
  for (const order of orders) {
    if (classifyOrderStatus(order) !== "pending") continue;
    const phone = normalizeBdPhone(order.phone);
    if (!phone) continue;
    const match = { id: order.id, order_number: order.order_number ?? null };
    const existing = map.get(phone);
    if (existing) existing.push(match);
    else map.set(phone, [match]);
  }
  return map;
}

export function pendingOrdersForPhone(
  map: Map<string, PendingOrderMatch[]>,
  phone: string | null | undefined,
): PendingOrderMatch[] {
  const normalized = normalizeBdPhone(phone);
  return (normalized && map.get(normalized)) || [];
}

/** "#1234" whether or not the stored order number already carries the "#". */
export function pendingOrderLabel(match: PendingOrderMatch): string {
  const number = (match.order_number || "").trim().replace(/^#+/, "");
  return number ? `#${number}` : "#—";
}
