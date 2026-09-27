import { format } from "date-fns";
import type { DateRange } from "react-day-picker";

const dhakaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" });

/** True when the customer placed at least one order on a Dhaka calendar day inside the range. */
export function customerOrderedInRange(
  customer: { timeline: Array<{ createdAt?: string | null }> },
  range: DateRange | null | undefined,
): boolean {
  if (!range?.from) return true;
  const from = format(range.from, "yyyy-MM-dd");
  const to = format(range.to ?? range.from, "yyyy-MM-dd");
  return customer.timeline.some((entry) => {
    if (!entry.createdAt) return false;
    const day = dhakaDay.format(new Date(entry.createdAt));
    return day >= from && day <= to;
  });
}
