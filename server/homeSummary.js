// Home page summary: today's headline metrics and the ranked "needs attention"
// cards. Pure functions; server/index.js gathers the data and calls these.
// Plan: docs/superpowers/plans/2026-10-06-home-page.md §3–§4.

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Today in Dhaka so far, and yesterday up to the same time of day.
export function homeWindows(now = new Date()) {
  const local = new Date(now.getTime() + DHAKA_OFFSET_MS);
  const todayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - DHAKA_OFFSET_MS;
  const iso = (ms) => new Date(ms).toISOString();
  return {
    today: { since: iso(todayStart), until: iso(now.getTime()) },
    yesterday: { since: iso(todayStart - DAY_MS), until: iso(now.getTime() - DAY_MS) },
    hour: local.getUTCHours(),
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
  const time = Date.parse(value);
  return time >= Date.parse(window.since) && time < Date.parse(window.until);
};

const dhakaHour = (value) => new Date(Date.parse(value) + DHAKA_OFFSET_MS).getUTCHours();

const metric = (value, previous, series) => ({ value, previous, change: percentChange(value, previous), series });

const round2 = (value) => Math.round(value * 100) / 100;

export function buildHomeMetrics({ orders, windows, website }) {
  const hours = windows.hour + 1;
  const salesSeries = Array(hours).fill(0);
  const orderSeries = Array(hours).fill(0);
  let sales = 0, count = 0, previousSales = 0, previousCount = 0;
  for (const order of orders || []) {
    if (inWindow(order.created_at, windows.today)) {
      const revenue = orderRevenue(order);
      const hour = dhakaHour(order.created_at);
      sales += revenue;
      count += 1;
      if (hour < hours) {
        salesSeries[hour] += revenue;
        orderSeries[hour] += 1;
      }
    } else if (inWindow(order.created_at, windows.yesterday)) {
      previousSales += orderRevenue(order);
      previousCount += 1;
    }
  }

  let sessions = null;
  let conversion = null;
  if (website?.today && website?.yesterday) {
    const today = website.today.totals || {};
    const yesterday = website.yesterday.totals || {};
    const sessionSeries = Array(hours).fill(0);
    for (const row of website.today.hourly || []) {
      if (row.hour < hours) sessionSeries[row.hour] = Number(row.sessions) || 0;
    }
    const rate = (totals) => (totals.sessions > 0 ? round2((totals.ordered_sessions / totals.sessions) * 100) : 0);
    sessions = metric(Number(today.sessions) || 0, Number(yesterday.sessions) || 0, sessionSeries);
    conversion = metric(rate(today), rate(yesterday), null);
  }

  return {
    sessions,
    sales: metric(round2(sales), round2(previousSales), salesSeries),
    orders: metric(count, previousCount, orderSeries),
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
