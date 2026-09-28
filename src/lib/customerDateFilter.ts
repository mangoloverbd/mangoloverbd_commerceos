import { format } from "date-fns";
import type { DateRange } from "react-day-picker";

const dhakaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * True when the customer placed at least one order on a Dhaka calendar day inside the range.
 * With a product, that same order must also contain the product's catalog name.
 */
export function customerOrderedInRange(
  customer: { timeline: Array<{ createdAt?: string | null; product?: string }> },
  range: DateRange | null | undefined,
  product?: string | null,
): boolean {
  if (!range?.from && !product) return true;
  const from = range?.from ? format(range.from, "yyyy-MM-dd") : null;
  const to = range?.from ? format(range.to ?? range.from, "yyyy-MM-dd") : null;
  const needle = product?.toLowerCase();
  return customer.timeline.some((entry) => {
    if (needle && !entry.product?.toLowerCase().includes(needle)) return false;
    if (!from || !to) return true;
    if (!entry.createdAt) return false;
    const day = dhakaDay.format(new Date(entry.createdAt));
    return day >= from && day <= to;
  });
}
