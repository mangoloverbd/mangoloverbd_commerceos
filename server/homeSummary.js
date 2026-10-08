// Home page summary: today's headline metrics and the ranked "needs attention"
// cards. Pure functions; server/index.js gathers the data and calls these.
// Plan: docs/superpowers/plans/2026-10-06-home-page.md §3–§4.

import {
  normalizeBusinessReportSource,
  resolveBusinessReportRequest,
  resolvePreviousBusinessReportRequest,
} from "./businessReport.js";

// "all", or an order source as the Business Report groups them.
export function isHomeChannel(value) {
  return value === "all" || (typeof value === "string" && normalizeBusinessReportSource(value) === value);
}

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const dhakaDayOf = (ms) => new Date(ms + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
const dayIndex = (ms) => Math.floor((ms + DHAKA_OFFSET_MS) / DAY_MS);

/**
 * The period Home reports on and the period it is compared with. Ranges use the
 * Business Report's rules (Dhaka days, same validation, equal-length previous
 * period up to the same elapsed time). No range means today; `all` means all time.
 */
export function homeWindows(now = new Date(), { from, to, all = false } = {}) {
  const nowMs = now.getTime();
  if (all) return { current: { since: null, until: now.toISOString() }, previous: null, bucket: null };

  const today = dhakaDayOf(nowMs);
  const request = resolveBusinessReportRequest(from || to ? { from, to } : { from: today, to: today });
  const until = Math.min(Date.parse(request.until), nowMs);
  const previous = resolvePreviousBusinessReportRequest(request, nowMs);
  const sinceMs = Date.parse(request.since);
  const singleDay = request.range.from === request.range.to;
  return {
    current: { since: request.since, until: new Date(until).toISOString() },
    previous: previous && { since: previous.since, until: previous.until },
    bucket: singleDay
      ? { unit: "hour", count: Math.floor((until - 1 - sinceMs) / HOUR_MS) + 1 }
      : { unit: "day", count: dayIndex(until - 1) - dayIndex(sinceMs) + 1 },
  };
}

// Same revenue rule as GET /api/analytics: price plus delivery, cancelled excluded upstream.
export function orderRevenue(order) {
  return (parseFloat(order?.price || 0) || 0) + (parseFloat(order?.delivery_rate || 0) || 0);
}

export function percentChange(current, previous) {
  if (!(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 100);
}

const inWindow = (value, window) => {
  if (!window) return false;
  const time = Date.parse(value);
  return (!window.since || time >= Date.parse(window.since)) && time < Date.parse(window.until);
};

const round2 = (value) => Math.round(value * 100) / 100;

const metric = (value, previous, series = null, previousSeries = null) => ({
  value,
  previous,
  change: previous === null ? null : percentChange(value, previous),
  series,
  previous_series: previousSeries,
});

// Running totals, so a sparkline rises to the headline value instead of
// showing each (partly elapsed) hour or day on its own.
const cumulative = (values) => {
  let sum = 0;
  return values.map((value) => round2((sum += value)));
};

// Bucket of a timestamp within a window: hours or Dhaka days since its start.
function bucketOf(ms, windows, since) {
  if (!windows.bucket || !since) return -1;
  return windows.bucket.unit === "hour"
    ? Math.floor((ms - Date.parse(since)) / HOUR_MS)
    : dayIndex(ms) - dayIndex(Date.parse(since));
}

export function buildHomeMetrics({ orders, windows, website, channel = "all" }) {
  const count = windows.bucket?.count ?? 0;
  const blank = () => Array(count).fill(0);
  const current = { sales: 0, total: 0, salesSeries: blank(), orderSeries: blank() };
  const previous = { sales: 0, total: 0, salesSeries: blank(), orderSeries: blank() };
  for (const order of orders || []) {
    if (channel !== "all" && normalizeBusinessReportSource(order.source) !== channel) continue;
    const [period, window] = inWindow(order.created_at, windows.current)
      ? [current, windows.current]
      : inWindow(order.created_at, windows.previous) ? [previous, windows.previous] : [null, null];
    if (!period) continue;
    const revenue = orderRevenue(order);
    period.sales += revenue;
    period.total += 1;
    const index = bucketOf(Date.parse(order.created_at), windows, window.since);
    if (index >= 0 && index < count) {
      period.salesSeries[index] += revenue;
      period.orderSeries[index] += 1;
    }
  }

  // Each bucket's sessions, and its ordered sessions when the report has them.
  const websiteBuckets = (report, since) => {
    const rows = windows.bucket.unit === "hour" ? report?.hourly || [] : report?.daily || [];
    const sessions = blank();
    const ordered = rows.some((row) => "ordered_sessions" in row) ? blank() : null;
    for (const row of rows) {
      const index = windows.bucket.unit === "hour"
        ? Number(row.hour)
        : bucketOf(Date.parse(`${String(row.day).slice(0, 10)}T00:00:00+06:00`), windows, since);
      if (!(index >= 0 && index < count)) continue;
      sessions[index] = Number(row.sessions) || 0;
      if (ordered) ordered[index] = Number(row.ordered_sessions) || 0;
    }
    return { sessions, ordered };
  };
  const percent = (part, whole) => (whole > 0 ? round2((part / whole) * 100) : 0);
  // The running rate (so the sparkline ends at the headline) and each bucket's own rate.
  const conversionSeries = (buckets) => {
    if (!buckets.ordered) return { running: null, own: null };
    const sessions = cumulative(buckets.sessions);
    const ordered = cumulative(buckets.ordered);
    return {
      running: sessions.map((total, index) => percent(ordered[index], total)),
      own: buckets.sessions.map((total, index) => percent(buckets.ordered[index], total)),
    };
  };

  let sessions = null;
  let conversion = null;
  if (website?.current) {
    const totals = website.current.totals || {};
    const previousTotals = website.previous?.totals || null;
    const rate = (row) => (row.sessions > 0 ? round2((row.ordered_sessions / row.sessions) * 100) : 0);
    const currentBuckets = windows.bucket ? websiteBuckets(website.current, windows.current.since) : null;
    const previousBuckets = windows.bucket && website.previous ? websiteBuckets(website.previous, windows.previous.since) : null;
    sessions = metric(
      Number(totals.sessions) || 0,
      previousTotals ? Number(previousTotals.sessions) || 0 : null,
      currentBuckets && cumulative(currentBuckets.sessions),
      previousBuckets && cumulative(previousBuckets.sessions),
    );
    // A rate can't be summed, so its hover chart reads `buckets` instead of
    // differencing the running series. Absent until the report has ordered sessions per bucket.
    const currentRate = currentBuckets ? conversionSeries(currentBuckets) : { running: null, own: null };
    const previousRate = previousBuckets ? conversionSeries(previousBuckets) : { running: null, own: null };
    conversion = {
      ...metric(rate(totals), previousTotals ? rate(previousTotals) : null, currentRate.running, currentRate.running && previousRate.running),
      buckets: currentRate.own,
      previous_buckets: currentRate.own && previousRate.own,
    };
  }

  const hasPrevious = Boolean(windows.previous);
  const series = (values) => (windows.bucket ? cumulative(values) : null);
  const previousSeries = (values) => (windows.bucket && hasPrevious ? cumulative(values) : null);
  return {
    sessions,
    sales: metric(round2(current.sales), hasPrevious ? round2(previous.sales) : null, series(current.salesSeries), previousSeries(previous.salesSeries)),
    orders: metric(current.total, hasPrevious ? previous.total : null, series(current.orderSeries), previousSeries(previous.orderSeries)),
    conversion_rate: conversion,
  };
}

// "হোমমেড কুমড়ো বড়ি | Homemade Pumpkin Bori" → "Homemade Pumpkin Bori".
export function shortProductName(name) {
  const text = String(name || "").trim();
  const parts = text.split("|").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : text;
}

// Units sold per product, most first.
export function topProducts(items, limit = 4) {
  const units = new Map();
  for (const item of items || []) {
    const name = shortProductName(item.product_name);
    if (!name) continue;
    units.set(name, (units.get(name) || 0) + (Number(item.quantity) || 0));
  }
  return [...units].map(([label, value]) => ({ label, value }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

// Most urgent first. A card shows only when it has something to do.
const ATTENTION_CARDS = [
  {
    kind: "fraud_flags", signal: "flagged", preview: "orders",
    title: (n) => `${plural(n, "order")} flagged for review`,
    body: "Customers with a poor delivery record, or parcels the courier marked unclear. Check them before they go out.",
    cta: { label: "Review flagged", to: "/orders", state: { fulfillmentTab: "flagged" } },
  },
  {
    kind: "protection_holds", signal: "protectionHolds", adminOnly: true, preview: "orders",
    title: (n) => `${plural(n, "checkout")} held by Order Protection`,
    body: "Storefront orders that scored as risky are waiting for your approval before they become orders.",
    cta: { label: "Open Order Protection", to: "/order-protection" },
  },
  {
    kind: "ready_for_courier", signal: "readyForCourier", preview: "orders",
    title: (n) => (n === 1 ? "1 order is ready for dispatch" : `${n} orders are ready for dispatch`),
    body: "Confirmed and waiting for a courier. Send them to Steadfast or Pathao in one batch.",
    cta: { label: "Dispatch batch", to: "/orders", state: { fulfillmentTab: "approved" } },
  },
  {
    kind: "inbox_unread", signal: "inboxUnread", preview: "chat",
    title: (n) => `${plural(n, "chat")} waiting for a reply`,
    body: "Customers messaged on Facebook, Instagram or WhatsApp and haven't heard back yet.",
    cta: { label: "Open inbox", to: "/inbox/facebook" },
  },
  {
    kind: "to_confirm", signal: "toConfirm", preview: "orders",
    title: (n) => `${plural(n, "new order")} to confirm`,
    body: "Call or message these customers to confirm the order before it moves to dispatch.",
    cta: { label: "Confirm orders", to: "/orders", state: { fulfillmentTab: "pending" } },
  },
  {
    kind: "inbox_orders", signal: "inboxOrders", preview: null,
    title: (n) => `${plural(n, "order")} captured from chats`,
    body: "The social bot turned conversations into orders. Review them before they reach the courier.",
    cta: { label: "Open inbox orders", to: "/inbox/orders" },
  },
  {
    kind: "abandoned", signal: "abandoned", preview: "orders",
    title: (n) => `${plural(n, "checkout")} left before ordering`,
    body: "These shoppers filled in their details but didn't finish. A quick call often recovers the order.",
    cta: { label: "Recover checkouts", to: "/orders", state: { fulfillmentTab: "abandoned" } },
  },
  {
    kind: "returns", signal: "returnsPending", preview: null,
    title: (n) => `${plural(n, "return")} waiting to be received`,
    body: "Parcels the courier is bringing back. Mark them received so stock and reports stay right.",
    cta: { label: "Open returns", to: "/returns" },
  },
];

export function rankAttentionCards(signals, { isAdmin }) {
  const cards = [];
  for (const def of ATTENTION_CARDS) {
    if (def.adminOnly && !isAdmin) continue;
    const signal = signals?.[def.signal];
    const count = Number(signal?.count) || 0;
    if (count <= 0) continue;
    cards.push({
      kind: def.kind,
      count,
      title: def.title(count),
      body: def.body,
      cta: def.cta,
      preview: def.preview ? { type: def.preview, rows: signal.rows || [] } : null,
    });
    if (cards.length === 3) return cards;
  }

  const varieties = signals?.topVarieties || [];
  if (varieties.length) {
    cards.push({
      kind: "top_varieties", count: null,
      title: "What's selling this week",
      body: "Units sold over the last 7 days. Compare margins after COGs in Business Analytics.",
      cta: isAdmin ? { label: "Open analytics", to: "/analytics" } : { label: "Open products", to: "/products" },
      preview: { type: "bars", rows: varieties.slice(0, 4) },
    });
  }
  const cities = signals?.liveCities || [];
  if (cities.length && cards.length < 3) {
    const shoppers = cities.reduce((sum, row) => sum + row.count, 0);
    cards.push({
      kind: "live_now", count: shoppers,
      title: `${plural(shoppers, "shopper")} on your store right now`,
      body: "Where today's live visitors are browsing from.",
      cta: { label: "Open analytics", to: isAdmin ? "/analytics" : "/overview" },
      preview: { type: "places", rows: cities.slice(0, 5) },
    });
  }
  if (cards.length < 3) {
    cards.push({
      kind: "all_clear", count: null,
      title: "You're all caught up",
      body: "No orders, chats or checkouts need you right now. New ones will show up here as they arrive.",
      cta: { label: "Open orders", to: "/orders" },
      preview: null,
    });
  }
  return cards.slice(0, 3);
}
