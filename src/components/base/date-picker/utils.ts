/** Same shape as react-day-picker's DateRange, so the two are interchangeable. */
export type { DateRange } from "react-day-picker";

/**
 * The business timezone. "Today", the max selectable day and the "today" ring
 * all follow this zone, not the viewer's device.
 */
export const APP_TIME_ZONE = "Asia/Dhaka";

function zonedParts(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

/** Today's calendar day (as a local-midnight Date) and hour (0-23) in `timeZone`. */
export function zonedNow(timeZone = APP_TIME_ZONE): { today: Date; hour: number } {
  const p = zonedParts(timeZone);
  return {
    today: new Date(Number(p.year), Number(p.month) - 1, Number(p.day)),
    hour: Number(p.hour) % 24,
  };
}

/** "YYYY-MM-DD" for today in `timeZone`. */
export function todayKey(timeZone = APP_TIME_ZONE): string {
  const p = zonedParts(timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}
