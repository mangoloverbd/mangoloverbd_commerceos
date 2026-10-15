import {
  addDays, endOfMonth, endOfQuarter, endOfYear, startOfMonth, startOfQuarter,
  startOfWeek, startOfYear, subDays, subMonths, subQuarters, subYears,
} from "date-fns";
import type { DateRange } from "./utils";

export type DateRangePreset = { label: string; range: DateRange | null };

export type DateRangeMenuItem =
  | { kind: "preset"; preset: DateRangePreset }
  | { kind: "submenu"; label: string; presets: DateRangePreset[] }
  | { kind: "custom"; label: "Custom range" };

/** `tight` rows are 21px tall instead of 26px (used for the longer festival group). */
export type DateRangeMenuGroup = { items: DateRangeMenuItem[]; tight?: boolean };

/**
 * Bangladesh Eid days (month is 0-based). A festival preset covers the 7 days
 * up to and including Eid. Add next year's dates once they're announced.
 */
const FESTIVAL_DAYS: { name: string; date: [number, number, number] }[] = [
  { name: "Eid ul-Fitr", date: [2025, 2, 31] },
  { name: "Eid ul-Adha", date: [2025, 5, 7] },
  { name: "Eid ul-Fitr", date: [2026, 2, 21] },
  { name: "Eid ul-Adha", date: [2026, 4, 27] },
  { name: "Eid ul-Fitr", date: [2027, 2, 10] },
  { name: "Eid ul-Adha", date: [2027, 4, 17] },
];

const span = (from: Date, to: Date): DateRange => ({ from, to });
const preset = (label: string, range: DateRange | null): DateRangePreset => ({ label, range });

function festivalPresets(today: Date): DateRangePreset[] {
  const out: DateRangePreset[] = [];
  const names = [...new Set(FESTIVAL_DAYS.map((f) => f.name))];
  for (const name of names) {
    const latest = FESTIVAL_DAYS
      .filter((f) => f.name === name)
      .map((f) => new Date(f.date[0], f.date[1], f.date[2]))
      .filter((day) => day <= today)
      .pop();
    if (latest) out.push(preset(`${name} ${latest.getFullYear()}`, span(subDays(latest, 6), latest)));
  }
  let boishakh = new Date(today.getFullYear(), 3, 14);
  if (boishakh > today) boishakh = new Date(today.getFullYear() - 1, 3, 14);
  out.push(preset(`Pohela Boishakh ${boishakh.getFullYear()}`, span(boishakh, boishakh)));
  return out;
}

/** The four most recent started quarters, oldest first; the current one ends today. */
function quarterPresets(today: Date): DateRangePreset[] {
  return [3, 2, 1, 0].map((back) => {
    const from = startOfQuarter(subQuarters(today, back));
    const end = endOfQuarter(from);
    return preset(`Q${Math.floor(from.getMonth() / 3) + 1} ${from.getFullYear()}`, span(from, end > today ? today : end));
  });
}

/**
 * `today` is the business-timezone calendar day; `hour` is the hour there (0-23).
 * Ranges are whole days, so "Last 30 minutes" = today and "Last 12 hours"
 * reaches into yesterday before noon.
 */
export function buildDateRangeMenu(today: Date, hour = 12): DateRangeMenuGroup[] {
  const weekStart = startOfWeek(today, { weekStartsOn: 0 });
  const lastQuarter = subQuarters(today, 1);
  const lastMonth = subMonths(today, 1);
  const lastYear = subYears(today, 1);

  return [
    {
      items: [
        { kind: "preset", preset: preset("Today", span(today, today)) },
        { kind: "preset", preset: preset("Yesterday", span(subDays(today, 1), subDays(today, 1))) },
      ],
    },
    {
      items: [
        {
          kind: "submenu",
          label: "Last",
          presets: [
            preset("Last 30 minutes", span(today, today)),
            preset("Last 12 hours", span(hour < 12 ? subDays(today, 1) : today, today)),
            preset("Last 7 days", span(subDays(today, 6), today)),
            preset("Last 30 days", span(subDays(today, 29), today)),
            preset("Last 90 days", span(subDays(today, 89), today)),
            preset("Last 365 days", span(subDays(today, 364), today)),
            preset("Last week", span(subDays(weekStart, 7), subDays(weekStart, 1))),
            preset("Last month", span(startOfMonth(lastMonth), endOfMonth(lastMonth))),
            preset("Last quarter", span(startOfQuarter(lastQuarter), endOfQuarter(lastQuarter))),
            preset("Last 12 months", span(addDays(subMonths(today, 12), 1), today)),
            preset("Last year", span(startOfYear(lastYear), endOfYear(lastYear))),
          ],
        },
        {
          kind: "submenu",
          label: "Period to date",
          presets: [
            preset("Week to date", span(weekStart, today)),
            preset("Month to date", span(startOfMonth(today), today)),
            preset("Quarter to date", span(startOfQuarter(today), today)),
            preset("Year to date", span(startOfYear(today), today)),
          ],
        },
      ],
    },
    {
      tight: true,
      items: [
        ...festivalPresets(today).map((p): DateRangeMenuItem => ({ kind: "preset", preset: p })),
        { kind: "submenu", label: "Quarters", presets: quarterPresets(today) },
      ],
    },
    {
      items: [
        { kind: "preset", preset: preset("All time", null) },
        { kind: "custom", label: "Custom range" },
      ],
    },
  ];
}

/** Every preset, top-level rows first, so "Today" wins over "Last 30 minutes" when matching. */
export function flattenDateRangeMenu(menu: DateRangeMenuGroup[]): DateRangePreset[] {
  const items = menu.flatMap((group) => group.items);
  return [
    ...items.flatMap((item) => (item.kind === "preset" ? [item.preset] : [])),
    ...items.flatMap((item) => (item.kind === "submenu" ? item.presets : [])),
  ];
}
