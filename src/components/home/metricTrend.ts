import type { HomeMetric } from "./types";

export type BucketUnit = "hour" | "day";

export interface TrendPoint {
  label: string;
  current: number | null;
  previous: number | null;
}

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The Dhaka calendar day an instant falls on, as a UTC-midnight Date.
function dhakaDay(iso: string, plusDays = 0) {
  const local = new Date(Date.parse(iso) + DHAKA_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + plusDays));
}

export function dhakaDateLabel(iso: string) {
  const day = dhakaDay(iso);
  return `${MONTHS[day.getUTCMonth()]} ${day.getUTCDate()}, ${day.getUTCFullYear()}`;
}

// "Oct 6, 2026", or "Sep 30, 2026 – Oct 6, 2026" for a span. `until` is exclusive.
export function periodLabel(since: string, until: string | null | undefined) {
  const start = dhakaDateLabel(since);
  if (!until) return start;
  const end = dhakaDateLabel(new Date(Date.parse(until) - 1).toISOString());
  return end === start ? start : `${start} – ${end}`;
}

function hourLabel(hour: number) {
  const h = hour % 24;
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
}

// The summary sends running totals (for the sparkline); the chart shows each bucket.
export const perBucket = (series: number[] | null) =>
  series?.map((value, index) => Math.round((value - (index > 0 ? series[index - 1] : 0)) * 100) / 100) ?? null;

export function trendPoints(metric: Pick<HomeMetric, "series" | "previous_series" | "buckets" | "previous_buckets">, unit: BucketUnit, since: string): TrendPoint[] {
  const current = metric.buckets ?? perBucket(metric.series);
  const previous = metric.buckets ? metric.previous_buckets ?? null : perBucket(metric.previous_series);
  if (!current) return [];
  return current.map((value, index) => {
    const day = unit === "day" ? dhakaDay(since, index) : null;
    return {
      label: day ? `${MONTHS[day.getUTCMonth()]} ${day.getUTCDate()}` : hourLabel(index),
      current: value,
      previous: previous?.[index] ?? null,
    };
  });
}
