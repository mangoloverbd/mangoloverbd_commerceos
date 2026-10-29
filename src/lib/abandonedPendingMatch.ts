import { normalizeBdPhone } from "@/lib/bdPhone";
import { classifyOrderStatus, type StatusFilterOrder } from "@/lib/orderStatusFilters";

/** Tabs whose orders are still open, so a matching abandoned cart is probably already handled. */
const OPEN_ORDER_TABS = ["pending", "approved", "print"] as const;
export type OpenOrderTab = (typeof OPEN_ORDER_TABS)[number];

export type PendingOrderMatch = { id: string; order_number: string | null; tab: OpenOrderTab };

const OPEN_ORDER_TAB_LABELS: Record<OpenOrderTab, string> = { pending: "Pending", approved: "Approved", print: "Print" };
export const openOrderTabLabel = (tab: OpenOrderTab) => OPEN_ORDER_TAB_LABELS[tab];

type MatchableOrder = StatusFilterOrder & { id: string; order_number?: string | null; phone?: string | null };

/** Index orders in the Pending, Approved and Print tabs by normalised BD phone. */
export function buildPendingOrdersByPhone(orders: MatchableOrder[]): Map<string, PendingOrderMatch[]> {
  const map = new Map<string, PendingOrderMatch[]>();
  for (const order of orders) {
    const tab = classifyOrderStatus(order);
    if (!(OPEN_ORDER_TABS as readonly string[]).includes(tab)) continue;
    const phone = normalizeBdPhone(order.phone);
    if (!phone) continue;
    const match = { id: order.id, order_number: order.order_number ?? null, tab: tab as OpenOrderTab };
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
