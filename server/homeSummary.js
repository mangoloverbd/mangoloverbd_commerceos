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

const metric = (value, previous, series) => ({
  value,
  previous,
  change: previous === null ? null : percentChange(value, previous),
  series,
});

function bucketOf(ms, windows) {
  const { bucket, current } = windows;
  if (!bucket) return -1;
  return bucket.unit === "hour"
    ? Math.floor((ms - Date.parse(current.since)) / HOUR_MS)
    : dayIndex(ms) - dayIndex(Date.parse(current.since));
}

export function buildHomeMetrics({ orders, windows, website, channel = "all" }) {
  const count = windows.bucket?.count ?? 0;
  const salesSeries = Array(count).fill(0);
  const orderSeries = Array(count).fill(0);
  let sales = 0, total = 0, previousSales = 0, previousTotal = 0;
  for (const order of orders || []) {
    if (channel !== "all" && normalizeBusinessReportSource(order.source) !== channel) continue;
    if (inWindow(order.created_at, windows.current)) {
      const revenue = orderRevenue(order);
      const index = bucketOf(Date.parse(order.created_at), windows);
      sales += revenue;
      total += 1;
      if (index >= 0 && index < count) {
        salesSeries[index] += revenue;
        orderSeries[index] += 1;
      }
    } else if (inWindow(order.created_at, windows.previous)) {
      previousSales += orderRevenue(order);
      previousTotal += 1;
    }
  }

  let sessions = null;
  let conversion = null;
  if (website?.current) {
    const current = website.current.totals || {};
    const previous = website.previous?.totals || null;
    let sessionSeries = null;
    if (windows.bucket) {
      sessionSeries = Array(count).fill(0);
      const rows = windows.bucket.unit === "hour"
        ? (website.current.hourly || []).map((row) => [Number(row.hour), row.sessions])
        : (website.current.daily || []).map((row) => [bucketOf(Date.parse(`${String(row.day).slice(0, 10)}T00:00:00+06:00`), windows), row.sessions]);
      for (const [index, value] of rows) if (index >= 0 && index < count) sessionSeries[index] = Number(value) || 0;
    }
    const rate = (totals) => (totals.sessions > 0 ? round2((totals.ordered_sessions / totals.sessions) * 100) : 0);
    sessions = metric(Number(current.sessions) || 0, previous ? Number(previous.sessions) || 0 : null, sessionSeries);
    conversion = metric(rate(current), previous ? rate(previous) : null, null);
  }

  const hasPrevious = Boolean(windows.previous);
  return {
    sessions,
    sales: metric(round2(sales), hasPrevious ? round2(previousSales) : null, windows.bucket ? salesSeries : null),
    orders: metric(total, hasPrevious ? previousTotal : null, windows.bucket ? orderSeries : null),
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
    kind: "protection_holds", signal: "protectionHolds", adminOnly: true, preview: null,
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
