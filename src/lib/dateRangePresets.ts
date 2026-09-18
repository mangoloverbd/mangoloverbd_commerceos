import {
  endOfMonth,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";
import type { DateRange } from "react-day-picker";

export type DateRangePreset = { label: string; range: DateRange | null };

export function buildDateRangePresets(today: Date): DateRangePreset[] {
  const lastMonth = subMonths(today, 1);

  return [
    { label: "All Time", range: null },
    { label: "Today", range: { from: today, to: today } },
    { label: "Yesterday", range: { from: subDays(today, 1), to: subDays(today, 1) } },
    { label: "Last 7 Days", range: { from: subDays(today, 6), to: today } },
    { label: "Last 30 Days", range: { from: subDays(today, 29), to: today } },
    { label: "Last 90 Days", range: { from: subDays(today, 89), to: today } },
    { label: "This Week", range: { from: startOfWeek(today, { weekStartsOn: 0 }), to: today } },
    { label: "This Month", range: { from: startOfMonth(today), to: today } },
    { label: "Last Month", range: { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) } },
    { label: "This Year", range: { from: startOfYear(today), to: today } },
  ];
}
