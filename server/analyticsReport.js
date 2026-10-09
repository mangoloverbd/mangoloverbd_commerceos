// Request and response shaping for the Analytics page website report.
// Pure: route handlers supply the clock and the database results.
import { resolveBusinessReportRequest, resolvePreviousBusinessReportRequest } from "./businessReport.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000; // Asia/Dhaka has no daylight saving.
export const DEFAULT_ANALYTICS_DAYS = 30;
const FRESH_EVENT_MS = 60 * 60 * 1000;
const STALE_ROLLUP_MS = 36 * 60 * 60 * 1000;

export const dhakaDay = (date) => new Date(date.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
const addDays = (day, offset) => new Date(Date.parse(`${day}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);

// Defaults to the last 30 Dhaka days including today. Explicit ranges follow the
// Business Report rules (both dates, not in the future, at most 366 days).
export function resolveAnalyticsReportRequest({ from, to } = {}, now = new Date()) {
  const hasRange = from !== undefined || to !== undefined;
  const today = dhakaDay(now);
  const request = resolveBusinessReportRequest(hasRange ? { from, to } : { from: addDays(today, 1 - DEFAULT_ANALYTICS_DAYS), to: today });
  return { request, previousRequest: resolvePreviousBusinessReportRequest(request, now.getTime()) };
}

export function rangeDays(range) {
  const days = [];
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) days.push(day);
  return days;
}

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const TEXT_FIELDS = new Set(["day", "source", "medium", "campaign", "device", "path", "product_slug", "name"]);
// Postgres numeric sums may arrive as strings; labels stay text.
const numbers = (row) => Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key, TEXT_FIELDS.has(key) ? value : num(value)]));

const EMPTY_TOTALS = {
  sessions: 0, visitors: 0, new_visitors: 0, pageviews: 0, product_views: 0, engaged_seconds: 0, bounced_sessions: 0,
  product_sessions: 0, cart_sessions: 0, checkout_sessions: 0, ordered_sessions: 0, orders: 0, delivered_sessions: 0,
  reached_product_sessions: 0, reached_checkout_sessions: 0,
};

// Funnel reach comes from the database. Until its migration is applied, estimate
// it from the raw steps (a lower bound) so the funnel never shows empty stages.
function withFunnelReach(totals, raw) {
  const checkout = Math.max(totals.checkout_sessions, totals.ordered_sessions);
  return {
    ...totals,
    reached_checkout_sessions: "reached_checkout_sessions" in raw ? totals.reached_checkout_sessions : checkout,
    reached_product_sessions: "reached_product_sessions" in raw ? totals.reached_product_sessions
      : Math.max(totals.product_sessions, totals.cart_sessions, checkout),
  };
}

// Fills every Dhaka day and hour so charts never skip quiet periods.
export function normalizeWebsiteReport(raw, range) {
  const report = raw || {};
  const byDay = new Map((report.daily || []).map((row) => [String(row.day).slice(0, 10), numbers(row)]));
  const byHour = new Map((report.hourly || []).map((row) => [num(row.hour), num(row.sessions)]));
  const acquisition = report.acquisition || {};
  return {
    totals: withFunnelReach({ ...EMPTY_TOTALS, ...numbers(report.totals) }, report.totals || {}),
    daily: rangeDays(range).map((day) => ({ sessions: 0, visitors: 0, pageviews: 0, ordered_sessions: 0, ...byDay.get(day), day })),
    hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: byHour.get(hour) || 0 })),
    sources: (report.sources || []).map(numbers),
    campaigns: (report.campaigns || []).map(numbers),
    devices: (report.devices || []).map(numbers),
    pages: (report.pages || []).map(numbers),
    entry_pages: (report.entry_pages || []).map(numbers),
    products: (report.products || []).map(numbers),
    acquisition: {
      last: (acquisition.last || []).map(numbers),
      first: (acquisition.first || []).map(numbers),
      campaigns: (acquisition.campaigns || []).map(numbers),
      website_orders: num(acquisition.website_orders),
      matched_orders: num(acquisition.matched_orders),
    },
  };
}

export function buildDataHealth({ latestEventAt, job, current }, now = new Date()) {
  const latest = latestEventAt ? new Date(latestEventAt) : null;
  const succeeded = job?.last_succeeded_at ? new Date(job.last_succeeded_at) : null;
  const failed = job?.last_failed_at ? new Date(job.last_failed_at) : null;
  const websiteOrders = current.acquisition.website_orders;
  const matched = current.acquisition.matched_orders;
  const direct = current.sources.filter((row) => row.source === "direct").reduce((sum, row) => sum + row.sessions, 0);
  return {
    latest_event_at: latest ? latest.toISOString() : null,
    collecting: Boolean(latest && now.getTime() - latest.getTime() <= FRESH_EVENT_MS),
    rollup: {
      last_succeeded_at: succeeded ? succeeded.toISOString() : null,
      last_failed_at: failed && (!succeeded || failed > succeeded) ? failed.toISOString() : null,
      healthy: Boolean(succeeded && now.getTime() - succeeded.getTime() <= STALE_ROLLUP_MS && !(failed && failed > succeeded)),
    },
    matched_orders: matched,
    website_orders: websiteOrders,
    order_coverage: websiteOrders > 0 ? matched / websiteOrders : null,
    direct_sessions: direct,
    direct_share: current.totals.sessions > 0 ? direct / current.totals.sessions : null,
  };
}
