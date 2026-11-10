import type { DateRange } from "react-day-picker";
import type { OrderStatusFilter } from "@/lib/orderStatusFilters";

/** Order tabs that offer an order-date filter. */
export const DATE_FILTER_TABS: readonly OrderStatusFilter[] = ["processing", "delivered"];

/** The order date a tab's filter matches: Processing uses the day the order moved to Processing. */
export type OrderDateField = "created_at" | "processing_at";

export function orderDateFieldFor(tab: OrderStatusFilter): OrderDateField {
  return tab === "processing" ? "processing_at" : "created_at";
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Keep orders whose `field` date falls on a day inside the (inclusive, local-time) range. */
export function filterOrdersByDateRange<T extends { created_at?: string | null; processing_at?: string | null }>(
  orders: T[],
  range: DateRange | null | undefined,
  field: OrderDateField = "created_at",
): T[] {
  if (!range?.from) return orders;
  const from = startOfDay(range.from);
  const toDay = new Date(startOfDay(range.to ?? range.from));
  const until = new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1).getTime();
  return orders.filter((order) => {
    const value = order[field];
    const at = value ? Date.parse(value) : Number.NaN;
    return Number.isFinite(at) && at >= from && at < until;
  });
}

/** The range as an ISO [from, to) window of local days, for `/api/orders?created_from&created_to[&date_field]`. */
export function orderDateRangeBounds(range: DateRange | null | undefined): { from: string; to: string } | null {
  if (!range?.from) return null;
  const toDay = new Date(startOfDay(range.to ?? range.from));
  const until = new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1);
  return { from: new Date(startOfDay(range.from)).toISOString(), to: until.toISOString() };
}
