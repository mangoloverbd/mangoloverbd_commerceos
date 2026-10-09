// Types and pure metrics for the Analytics page website report
// (GET /api/analytics/website, built by server/analyticsReport.js).

export type WebsiteTotals = {
  sessions: number; visitors: number; new_visitors: number; pageviews: number; product_views: number; engaged_seconds: number;
  bounced_sessions: number; product_sessions: number; cart_sessions: number; checkout_sessions: number;
  ordered_sessions: number; orders: number; delivered_sessions: number;
  // Cumulative funnel stages: visits that reached the stage or any later one.
  reached_product_sessions: number; reached_checkout_sessions: number;
};
export type DailyRow = { day: string; sessions: number; visitors: number; pageviews: number; ordered_sessions: number };
export type HourRow = { hour: number; sessions: number };
export type SourceRow = { source: string; medium: string; sessions: number; visitors: number; bounced_sessions: number; ordered_sessions: number; orders: number };
export type CampaignRow = { campaign: string; sessions: number; ordered_sessions: number };
export type DeviceRow = { device: string; sessions: number; cart_sessions: number; ordered_sessions: number };
export type PageRow = { path: string; views: number; sessions: number; entries: number };
export type EntryPageRow = { path: string; sessions: number; bounced_sessions: number; ordered_sessions: number; orders: number };
export type ProductRow = { product_slug: string; name: string | null; views: number; sessions: number; ordered_sessions: number; orders: number; delivered: number };
export type AcquisitionRow = {
  source: string; medium: string; orders: number; placed_value: number; delivered: number; delivered_value: number;
  partial_delivered: number; returned: number; cancelled: number; active: number;
};
export type AcquisitionCampaignRow = { campaign: string; orders: number; delivered: number; delivered_value: number };

export type WebsiteReport = {
  totals: WebsiteTotals;
  daily: DailyRow[];
  hourly: HourRow[];
  sources: SourceRow[];
  campaigns: CampaignRow[];
  devices: DeviceRow[];
  pages: PageRow[];
  entry_pages: EntryPageRow[];
  products: ProductRow[];
  acquisition: { last: AcquisitionRow[]; first: AcquisitionRow[]; campaigns: AcquisitionCampaignRow[]; website_orders: number; matched_orders: number };
};

export type WebsiteHealth = {
  latest_event_at: string | null;
  collecting: boolean;
  rollup: { last_succeeded_at: string | null; last_failed_at: string | null; healthy: boolean };
  matched_orders: number;
  website_orders: number;
  order_coverage: number | null;
  direct_sessions: number;
  direct_share: number | null;
};

export type WebsiteAnalyticsResponse = {
  range: { from: string; to: string };
  previous_range: { from: string; to: string } | null;
  generated_at: string;
  current: WebsiteReport;
  previous: WebsiteReport | null;
  health: WebsiteHealth;
};

export type AttributionModel = "last" | "first";

const SOURCE_NAMES: Record<string, string> = {
  direct: "Direct", facebook: "Facebook", instagram: "Instagram", google: "Google", bing: "Bing", tiktok: "TikTok",
  youtube: "YouTube", whatsapp: "WhatsApp", messenger: "Messenger", campaign_link: "Campaign links",
};

// Facebook and Instagram can be organic or paid; paid traffic gets its own row.
export function sourceLabel(source: string, medium?: string) {
  const name = SOURCE_NAMES[source] ?? source;
  return medium === "paid" && source !== "campaign_link" ? `${name} ads` : name;
}

export const rate = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

export type Delta = { text: string; tone: "good" | "bad" | "neutral" };

// A zero previous value has no meaningful percentage change.
export function percentDelta(current: number, previous: number | undefined, higherIsBetter = true): Delta | null {
  if (previous === undefined || previous === 0) return null;
  const change = Math.round(((current - previous) / previous) * 1000) / 10;
  const sign = change > 0 ? "+" : change < 0 ? "−" : "";
  const better = higherIsBetter ? change > 0 : change < 0;
  return { text: `${sign}${Math.abs(change).toLocaleString("en-BD")}%`, tone: change === 0 ? "neutral" : better ? "good" : "bad" };
}

export function pointsDelta(current: number, previous: number | undefined, previousBase: number | undefined): Delta | null {
  if (previous === undefined || !previousBase) return null;
  const change = Math.round((current - previous) * 10) / 10;
  const sign = change > 0 ? "+" : change < 0 ? "−" : "";
  return { text: `${sign}${Math.abs(change).toLocaleString("en-BD")} pts`, tone: change === 0 ? "neutral" : change > 0 ? "good" : "bad" };
}

export type FunnelStep = { key: string; label: string; value: number };

// The cart is optional (Buy now and landing pages skip it), so it is not a stage.
export function funnelSteps(totals: WebsiteTotals): FunnelStep[] {
  return [
    { key: "visits", label: "Visits", value: totals.sessions },
    { key: "product", label: "Product", value: totals.reached_product_sessions },
    { key: "checkout", label: "Checkout", value: totals.reached_checkout_sessions },
    { key: "order", label: "Order", value: totals.ordered_sessions },
    { key: "delivered", label: "Delivered", value: totals.delivered_sessions },
  ];
}

// The step (from stage i to i + 1) that keeps the smallest share of its visits.
// Delivery is excluded: it reflects couriers, not the website.
export function biggestDrop(steps: FunnelStep[]): { index: number; kept: number } | null {
  let worst: { index: number; kept: number } | null = null;
  for (let index = 0; index < steps.length - 2; index++) {
    if (steps[index].value <= 0) continue;
    const kept = Math.min(1, steps[index + 1].value / steps[index].value);
    if (!worst || kept < worst.kept) worst = { index, kept };
  }
  return worst;
}

export function peakHour(hourly: HourRow[]): HourRow | null {
  let peak: HourRow | null = null;
  for (const row of hourly) if (row.sessions > 0 && (!peak || row.sessions > peak.sessions)) peak = row;
  return peak;
}

export const hourLabel = (hour: number) => `${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`;

export function acquisitionTotals(rows: AcquisitionRow[]) {
  return rows.reduce((sum, row) => ({
    orders: sum.orders + row.orders, delivered: sum.delivered + row.delivered, delivered_value: sum.delivered_value + row.delivered_value,
    cancelled: sum.cancelled + row.cancelled, returned: sum.returned + row.returned,
  }), { orders: 0, delivered: 0, delivered_value: 0, cancelled: 0, returned: 0 });
}

// Joins traffic (visits by entry source) with economics (orders credited to the source).
export function sourcePerformance(sources: SourceRow[], acquisition: AcquisitionRow[]) {
  const key = (row: { source: string; medium: string }) => `${row.source}\u0000${row.medium}`;
  const economics = new Map(acquisition.map((row) => [key(row), row]));
  const rows = sources.map((row) => ({ ...row, economics: economics.get(key(row)) ?? null }));
  for (const row of acquisition) {
    if (!sources.some((source) => key(source) === key(row))) {
      rows.push({ source: row.source, medium: row.medium, sessions: 0, visitors: 0, bounced_sessions: 0, ordered_sessions: 0, orders: 0, economics: row });
    }
  }
  return rows;
}

export const formatNumber = (value: number) => Math.round(Number(value || 0)).toLocaleString("en-BD");
export const formatTaka = (value: number) => `৳${Math.round(Number(value || 0)).toLocaleString("en-BD")}`;
export const formatPct = (value: number) => `${(Math.round(value * 10) / 10).toLocaleString("en-BD")}%`;
export function formatDuration(seconds: number) {
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, "0")}s`;
}
export function timeAgo(iso: string | null, now = Date.now()) {
  if (!iso) return "never";
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function healthSummary(health: WebsiteHealth): { label: string; tone: "ok" | "warn" } {
  if (!health.collecting) return { label: "Not collecting", tone: "warn" };
  if (!health.rollup.healthy) return { label: "Summary late", tone: "warn" };
  return { label: "Healthy", tone: "ok" };
}
