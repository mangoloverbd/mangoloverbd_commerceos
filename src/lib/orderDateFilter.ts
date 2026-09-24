import type { DateRange } from "react-day-picker";
import type { OrderStatusFilter } from "@/lib/orderStatusFilters";

/** Order tabs that offer an order-date filter. */
export const DATE_FILTER_TABS: readonly OrderStatusFilter[] = ["processing", "delivered"];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Keep orders placed on a day inside the (inclusive, local-time) range. */
export function filterOrdersByDateRange<T extends { created_at?: string | null }>(orders: T[], range: DateRange | null | undefined): T[] {
  if (!range?.from) return orders;
  const from = startOfDay(range.from);
  const toDay = new Date(startOfDay(range.to ?? range.from));
  const until = new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1).getTime();
  return orders.filter((order) => {
    const placed = order.created_at ? Date.parse(order.created_at) : Number.NaN;
    return Number.isFinite(placed) && placed >= from && placed < until;
  });
}

/** The range as an ISO [from, to) window of local days, for `/api/orders?created_from&created_to`. */
export function orderDateRangeBounds(range: DateRange | null | undefined): { from: string; to: string } | null {
  if (!range?.from) return null;
  const toDay = new Date(startOfDay(range.to ?? range.from));
  const until = new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1);
  return { from: new Date(startOfDay(range.from)).toISOString(), to: until.toISOString() };
}
