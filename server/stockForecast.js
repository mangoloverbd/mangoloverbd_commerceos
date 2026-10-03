// Stock & forecast tab (Analytics). Rule-based, no AI: every number is simple
// arithmetic on orders, line items, variant stock, cost prices and website views.
// Pure: the route supplies the rows and the clock.
import { customerOrderOutcome } from "./customerOutcomes.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000; // Asia/Dhaka has no daylight saving.
export const HISTORY_DAYS = 56;
export const FORECAST_DAYS = 30;
export const LEAD_DAYS = 2;
export const SAFETY_DAYS = 3;
export const RESTOCK_URGENT_DAYS = 7;
export const RESTOCK_SOON_DAYS = 14;
export const OVERSTOCK_DAYS = 60;
const MATURE_MIN_DAYS = 15; // older orders have mostly reached a courier result
const MIN_VIEWS_FOR_PAGE_RULE = 500;
const MIN_FINISHED_FOR_RATES = 5;
export const RHYTHM_SLOTS = [
  { id: "morning", label: "Morning", from: 6, to: 12 },
  { id: "afternoon", label: "Afternoon", from: 12, to: 17 },
  { id: "evening", label: "Evening", from: 17, to: 22 },
  { id: "night", label: "Night", from: 22, to: 30 }, // 22:00–05:59
];

const local = (date) => new Date(new Date(date).getTime() + DHAKA_OFFSET_MS);
export const dhakaDay = (date) => local(date).toISOString().slice(0, 10);
export const addDays = (day, offset) => new Date(Date.parse(`${day}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);
const weekdayOf = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const round = (value, places = 1) => Math.round(value * 10 ** places) / 10 ** places;
const roundThousand = (value) => Math.round(value / 1000) * 1000;

// "কাটিমন আম | Katimon Mango" → "Katimon Mango"; names without a separator stay as they are.
export function displayProductName(name) {
  const text = String(name || "").trim();
  const parts = text.split("|").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : text;
}

const isDelivered = (outcome) => outcome === "delivered" || outcome === "partial_delivered";

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

// Same weekday over the last 8 weeks, scaled by the last 4 weeks against the 4 before
// (kept within ±15% so one unusual week cannot swing the forecast).
export function forecastOrders(dailyCounts, today) {
  const history = Array.from({ length: HISTORY_DAYS }, (_, index) => {
    const day = addDays(today, index - HISTORY_DAYS);
    return { day, orders: dailyCounts.get(day) || 0 };
  });
  const recent = history.slice(-28).reduce((sum, row) => sum + row.orders, 0);
  const before = history.slice(0, 28).reduce((sum, row) => sum + row.orders, 0);
  const trend = before > 0 ? Math.min(1.15, Math.max(0.85, recent / before)) : 1;
  const byWeekday = Array.from({ length: 7 }, () => []);
  for (const row of history) byWeekday[weekdayOf(row.day)].push(row.orders);
  const weekday = byWeekday.map((values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return { mean, low: percentile(sorted, 0.2), high: percentile(sorted, 0.8) };
  });
  const future = Array.from({ length: FORECAST_DAYS }, (_, index) => {
    const day = addDays(today, index);
    const stats = weekday[weekdayOf(day)];
    return { day, orders: round(stats.mean * trend), low: round(stats.low * trend), high: round(stats.high * trend) };
  });
  return { history, future, trend: round(trend, 3), weekdayMeans: weekday.map((stats) => round(stats.mean)) };
}

function slotOf(hour) {
  return RHYTHM_SLOTS.findIndex((slot) => (hour >= slot.from && hour < slot.to) || (hour + 24 >= slot.from && hour + 24 < slot.to));
}

export function buildStockForecast({ orders = [], products = [], variants = [], productViews = null, now = new Date() } = {}) {
  const today = dhakaDay(now);
  const nowMs = new Date(now).getTime();
  const productById = new Map(products.map((product) => [product.id, product]));
  const stockByProduct = new Map();
  for (const variant of variants) stockByProduct.set(variant.product_id, (stockByProduct.get(variant.product_id) || 0) + Math.max(0, num(variant.stock_quantity)));

  const enriched = orders.map((order) => ({
    ...order,
    day: dhakaDay(order.created_at),
    ageDays: (nowMs - new Date(order.created_at).getTime()) / DAY_MS,
    outcome: customerOrderOutcome(order),
    items: Array.isArray(order.order_items) ? order.order_items : [],
  }));
  const live = enriched.filter((order) => order.outcome !== "cancelled");

  // ── Forecast ─────────────────────────────────────────────────────────
  const dailyCounts = new Map();
  for (const order of live) if (order.day < today) dailyCounts.set(order.day, (dailyCounts.get(order.day) || 0) + 1);
  const forecast = forecastOrders(dailyCounts, today);
  const mature = enriched.filter((order) => order.ageDays >= MATURE_MIN_DAYS && order.ageDays < HISTORY_DAYS);
  const matureFinished = mature.filter((order) => order.outcome !== "active");
  const matureDelivered = mature.filter((order) => isDelivered(order.outcome));
  const deliveredRate = matureFinished.length ? matureDelivered.length / matureFinished.length : null;
  const deliveredValue = matureDelivered.length ? matureDelivered.reduce((sum, order) => sum + num(order.price), 0) / matureDelivered.length : null;
  const valuePerOrder = deliveredRate !== null && deliveredValue !== null ? deliveredRate * deliveredValue : null;
  const sum = (rows, key, count) => rows.slice(0, count).reduce((total, row) => total + row[key], 0);
  const busiest = forecast.weekdayMeans.reduce((best, value, index) => (value > forecast.weekdayMeans[best] ? index : best), 0);
  const weekMean = forecast.weekdayMeans.reduce((a, b) => a + b, 0) / 7;

  // ── Per-product sales ────────────────────────────────────────────────
  const sold = new Map();
  const statsFor = (productId) => {
    if (!sold.has(productId)) sold.set(productId, { sold14: 0, sold30: 0, delivered: 0, returned: 0, cancelled: 0, revenue: 0, courier: 0, deliveredUnits: 0, orders30: new Set() });
    return sold.get(productId);
  };
  for (const order of enriched) {
    const lineTotal = order.items.reduce((total, item) => total + num(item.unit_price) * num(item.quantity), 0);
    for (const item of order.items) {
      if (!item.product_id || !productById.has(item.product_id)) continue;
      const stats = statsFor(item.product_id);
      const qty = num(item.quantity);
      const share = lineTotal > 0 ? (num(item.unit_price) * qty) / lineTotal : 1 / order.items.length;
      if (order.outcome !== "cancelled" && order.ageDays < 14) stats.sold14 += qty;
      if (order.outcome !== "cancelled" && order.ageDays < 30) stats.sold30 += qty;
      if (order.ageDays >= 30 || stats.orders30.has(order.id)) continue;
      // Outcomes and money count once per order, even when it has two lines of the product.
      const productLines = order.items.filter((line) => line.product_id === item.product_id);
      const productValue = productLines.reduce((total, line) => total + num(line.unit_price) * num(line.quantity), 0);
      const productQty = productLines.reduce((total, line) => total + num(line.quantity), 0);
      const productShare = lineTotal > 0 ? productValue / lineTotal : share;
      stats.orders30.add(order.id);
      if (isDelivered(order.outcome)) {
        stats.delivered += 1;
        if (order.outcome === "delivered") { stats.revenue += productValue; stats.deliveredUnits += productQty; }
        stats.courier += num(order.courier_fee) * productShare;
      } else if (order.outcome === "returned") {
        stats.returned += 1;
        stats.courier += num(order.courier_fee) * productShare;
      } else if (order.outcome === "cancelled") {
        stats.cancelled += 1;
      }
    }
  }

  // ── Restock ──────────────────────────────────────────────────────────
  const restock = products.map((product) => {
    const stats = sold.get(product.id) || { sold14: 0, sold30: 0 };
    const stock = stockByProduct.get(product.id) || 0;
    const rate = stats.sold14 / 14;
    const rate30 = stats.sold30 / 30;
    const daysLeft = rate > 0 ? stock / rate : null;
    let status;
    if (rate > 0 && stock <= 0) status = "urgent";
    else if (daysLeft === null) status = stock > 0 ? "no_sales" : "empty";
    else if (daysLeft <= RESTOCK_URGENT_DAYS) status = "urgent";
    else if (daysLeft <= RESTOCK_SOON_DAYS) status = "soon";
    else if (daysLeft > OVERSTOCK_DAYS) status = "over";
    else status = "ok";
    const runsOut = daysLeft === null ? null : addDays(today, Math.floor(daysLeft));
    const orderBy = runsOut === null ? null : (addDays(runsOut, -LEAD_DAYS) < today ? today : addDays(runsOut, -LEAD_DAYS));
    return {
      product_id: product.id,
      name: displayProductName(product.name),
      stock,
      sold_per_day: round(rate, 2),
      sold_per_day_30: round(rate30, 2),
      change_pct: rate30 > 0 ? Math.round((rate / rate30 - 1) * 100) : null,
      days_left: daysLeft === null ? null : round(daysLeft),
      runs_out: runsOut,
      order_by: orderBy,
      status,
      cost_price: num(product.cog) > 0 ? num(product.cog) : null,
    };
  }).sort((a, b) => (a.days_left ?? Infinity) - (b.days_left ?? Infinity) || b.sold_per_day - a.sold_per_day);

  // ── Product health ───────────────────────────────────────────────────
  const viewsBySlug = new Map((productViews || []).map((row) => [row.product_slug, row]));
  let viewSessions = 0;
  let viewOrders = 0;
  for (const row of productViews || []) { viewSessions += num(row.sessions); viewOrders += num(row.orders); }
  let finishedAll = 0;
  let deliveredAll = 0;
  let returnedAll = 0;
  for (const stats of sold.values()) { finishedAll += stats.delivered + stats.returned + stats.cancelled; deliveredAll += stats.delivered; returnedAll += stats.returned; }
  const averages = {
    order_rate: viewSessions > 0 ? round((viewOrders / viewSessions) * 100) : null,
    delivered_rate: finishedAll > 0 ? round((deliveredAll / finishedAll) * 100) : null,
    returned_rate: finishedAll > 0 ? round((returnedAll / finishedAll) * 100) : null,
  };
  const health = products.map((product) => {
    const stats = sold.get(product.id);
    const views = product.slug ? viewsBySlug.get(product.slug) : null;
    const finished = stats ? stats.delivered + stats.returned + stats.cancelled : 0;
    const orderRate = views && num(views.sessions) > 0 ? round((num(views.orders) / num(views.sessions)) * 100) : null;
    const delivered = finished >= MIN_FINISHED_FOR_RATES ? round((stats.delivered / finished) * 100) : null;
    const returned = finished >= MIN_FINISHED_FOR_RATES ? round((stats.returned / finished) * 100) : null;
    let verdict = "steady";
    if (orderRate !== null && averages.order_rate && num(views.views) >= MIN_VIEWS_FOR_PAGE_RULE && orderRate < averages.order_rate / 2) verdict = "fix_page";
    else if (delivered !== null && averages.delivered_rate !== null && delivered < averages.delivered_rate - 10) verdict = "check_delivery";
    else if (orderRate !== null && delivered !== null && orderRate >= (averages.order_rate ?? Infinity) && delivered >= (averages.delivered_rate ?? Infinity)) verdict = "star";
    return {
      product_id: product.id,
      name: displayProductName(product.name),
      views: views ? num(views.views) : null,
      order_rate: orderRate,
      delivered_rate: delivered,
      returned_rate: returned,
      orders: stats ? stats.orders30.size : 0,
      verdict,
    };
  }).filter((row) => row.orders > 0 || row.views).sort((a, b) => (b.views ?? -1) - (a.views ?? -1) || b.orders - a.orders);

  // ── Profit ───────────────────────────────────────────────────────────
  const profit = products.map((product) => {
    const stats = sold.get(product.id);
    if (!stats || (stats.revenue <= 0 && stats.courier <= 0)) return null;
    const costPrice = num(product.cog) > 0 ? num(product.cog) : null;
    const cost = costPrice === null ? null : costPrice * stats.deliveredUnits;
    return {
      product_id: product.id,
      name: displayProductName(product.name),
      delivered_revenue: Math.round(stats.revenue),
      courier: Math.round(stats.courier),
      cost: cost === null ? null : Math.round(cost),
      profit: cost === null ? null : Math.round(stats.revenue - cost - stats.courier),
    };
  }).filter(Boolean).sort((a, b) => b.delivered_revenue - a.delivered_revenue);

  // ── Weekly rhythm ────────────────────────────────────────────────────
  const rhythmCounts = Array.from({ length: 7 }, () => Array(RHYTHM_SLOTS.length).fill(0));
  for (const order of enriched) {
    if (order.ageDays >= HISTORY_DAYS || order.day >= today) continue;
    const at = local(order.created_at);
    const slot = slotOf(at.getUTCHours());
    if (slot >= 0) rhythmCounts[at.getUTCDay()][slot] += 1;
  }
  const weeks = HISTORY_DAYS / 7;
  const rhythm = rhythmCounts.map((row) => row.map((count) => round(count / weeks)));

  // ── Summary and actions ──────────────────────────────────────────────
  const next30 = sum(forecast.future, "orders", FORECAST_DAYS);
  const restockNow = restock.filter((row) => row.status === "urgent");
  const slow = restock.filter((row) => (row.status === "over" || row.status === "no_sales") && row.stock > 0);
  const slowKnown = slow.filter((row) => row.cost_price !== null);
  const summary = {
    // Rounded to the nearest ৳1,000: a forecast is not precise to the taka.
    next30_delivered_value: valuePerOrder === null ? null : roundThousand(next30 * valuePerOrder),
    next30_delivered_low: valuePerOrder === null ? null : roundThousand(sum(forecast.future, "low", FORECAST_DAYS) * valuePerOrder),
    next30_delivered_high: valuePerOrder === null ? null : roundThousand(sum(forecast.future, "high", FORECAST_DAYS) * valuePerOrder),
    next7_orders: Math.round(sum(forecast.future, "orders", 7)),
    next7_low: Math.round(sum(forecast.future, "low", 7)),
    next7_high: Math.round(sum(forecast.future, "high", 7)),
    busiest_weekday: busiest,
    busiest_lift_pct: weekMean > 0 ? Math.round((forecast.weekdayMeans[busiest] / weekMean - 1) * 100) : null,
    restock_now: restockNow.length,
    first_runs_out: restockNow[0] ? { name: restockNow[0].name, runs_out: restockNow[0].runs_out, order_by: restockNow[0].order_by } : null,
    slow_products: slow.length,
    slow_stock_value: slowKnown.reduce((total, row) => total + row.stock * row.cost_price, 0),
    slow_with_cost: slowKnown.length,
    delivered_rate: deliveredRate === null ? null : round(deliveredRate * 100),
    missing_cost_products: products.filter((product) => !(num(product.cog) > 0)).length,
  };

  const actions = [];
  for (const row of restock.filter((item) => item.status === "urgent")) {
    actions.push({ kind: "restock", severity: "urgent", product_id: row.product_id, name: row.name, rule: "runs_out_within_7_days", order_qty: suggestedOrder(row, 21), order_by: row.order_by, runs_out: row.runs_out, stock: row.stock, sold_per_day: row.sold_per_day });
  }
  for (const row of restock.filter((item) => item.status === "soon")) {
    actions.push({ kind: "restock", severity: "soon", product_id: row.product_id, name: row.name, rule: "runs_out_within_14_days", order_qty: suggestedOrder(row, 21), order_by: row.order_by, runs_out: row.runs_out, change_pct: row.change_pct });
  }
  for (const row of health.filter((item) => item.verdict === "fix_page")) {
    actions.push({ kind: "fix_page", severity: "soon", product_id: row.product_id, name: row.name, rule: "order_rate_under_half_average", views: row.views, order_rate: row.order_rate, average: averages.order_rate });
  }
  for (const row of health.filter((item) => item.returned_rate !== null && averages.returned_rate && item.returned_rate >= Math.max(10, averages.returned_rate * 2))) {
    actions.push({ kind: "returns", severity: "soon", product_id: row.product_id, name: row.name, rule: "returns_twice_average", returned_rate: row.returned_rate, average: averages.returned_rate });
  }
  for (const row of restock.filter((item) => item.status === "over").sort((a, b) => b.days_left - a.days_left).slice(0, 2)) {
    actions.push({ kind: "slow", severity: "info", product_id: row.product_id, name: row.name, rule: "covers_more_than_60_days", stock: row.stock, days_left: row.days_left });
  }
  if (summary.missing_cost_products > 0) {
    actions.push({ kind: "cost_price", severity: "info", rule: "profit_needs_cost_price", count: summary.missing_cost_products });
  }

  return {
    generated_at: new Date(now).toISOString(),
    today,
    settings: { lead_days: LEAD_DAYS, safety_days: SAFETY_DAYS, history_days: HISTORY_DAYS },
    summary,
    forecast: { history: forecast.history, future: forecast.future, trend: forecast.trend, value_per_order: valuePerOrder === null ? null : Math.round(valuePerOrder) },
    actions: actions.slice(0, 6),
    restock,
    health,
    health_averages: averages,
    profit,
    rhythm: { slots: RHYTHM_SLOTS.map(({ id, label }) => ({ id, label })), weeks, values: rhythm },
  };
}

// Enough for `coverDays` plus safety and supplier lead time, minus what is in stock.
export function suggestedOrder(row, coverDays) {
  if (!(row.sold_per_day > 0)) return 0;
  return Math.max(0, Math.ceil(row.sold_per_day * (coverDays + SAFETY_DAYS + LEAD_DAYS) - row.stock));
}
