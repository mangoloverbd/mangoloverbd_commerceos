import { detectCustomerOrderSource } from "./customers.js";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalidReportRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function isValidYmd(value) {
  if (typeof value !== "string" || !YMD_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDaysYmd(ymd, days) {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function toDhakaInterval(from, to) {
  if (!isValidYmd(from) || !isValidYmd(to)) {
    throw invalidReportRequest("Invalid report date");
  }

  const untilDay = addDaysYmd(to, 1);

  return {
    from,
    to,
    since: new Date(`${from}T00:00:00+06:00`).toISOString(),
    until: new Date(`${untilDay}T00:00:00+06:00`).toISOString(),
  };
}

// Team members are limited to their own rows unless the report opts into a
// team-wide view (Staff Performance shows every member to everyone).
export function resolveStaffReportRequest({ from, to, users, role, userId, staff, teamWide = false }) {
  const hasFrom = from !== undefined && from !== null;
  const hasTo = to !== undefined && to !== null;
  if (hasFrom !== hasTo) {
    throw invalidReportRequest("Provide both from and to dates");
  }

  const interval = hasFrom ? toDhakaInterval(from, to) : null;
  if (interval && interval.from > interval.to) {
    throw invalidReportRequest("Report start date must not be after the end date");
  }
  const selfOnly = role === "team_member" && !teamWide;
  const rosterIds = (staff || []).map((member) => member.user_id).filter(Boolean);
  if (!selfOnly && users !== undefined && users !== null && typeof users !== "string") {
    throw invalidReportRequest("Invalid users filter");
  }
  const requestedUserIds = [...new Set((selfOnly ? "" : users || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean))];
  if (!selfOnly && requestedUserIds.some((id) => !UUID_RE.test(id))) {
    throw invalidReportRequest("Invalid users filter");
  }
  if (!selfOnly && requestedUserIds.some((id) => !rosterIds.includes(id))) {
    throw invalidReportRequest("Selected staff member is not in this workspace");
  }
  const selectedUserIds = selfOnly
    ? [userId]
    : requestedUserIds.length > 0 ? requestedUserIds : rosterIds;

  return {
    range: interval ? { from: interval.from, to: interval.to } : { from: null, to: null },
    since: interval?.since ?? null,
    until: interval?.until ?? null,
    selectedUserIds,
  };
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toValidQuantity(value) {
  const quantity = toNumber(value);
  return quantity > 0 ? quantity : 0;
}

function isInInterval(value, since, until) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  if (since && timestamp < new Date(since).getTime()) return false;
  if (until && timestamp >= new Date(until).getTime()) return false;
  return true;
}

function emptyMetrics() {
  return {
    assigned_count: 0,
    handled_count: 0,
    handled_confirmed_count: 0,
    handled_confirmed_value: 0,
    handled_confirmed_kg: 0,
    handled_cancelled_count: 0,
    handled_cancelled_value: 0,
    handled_delivered_count: 0,
    handled_delivered_value: 0,
    handled_returned_count: 0,
    handled_returned_value: 0,
    confirmed_count: 0,
    confirmed_assigned_count: 0,
    confirmed_assigned_delivered_count: 0,
    confirmed_assigned_returned_count: 0,
    confirmed_assigned_cancelled_count: 0,
    confirmed_value: 0,
    confirmed_kg: 0,
    confirmation_rate: null,
    average_order_value: null,
    cancelled_count: 0,
    cancelled_assigned_count: 0,
    cancelled_value: 0,
    cancellation_rate: null,
    delivered_count: 0,
    delivered_value: 0,
    delivered_rate: null,
    returned_count: 0,
    returned_value: 0,
    telesales_confirmed_count: 0,
    telesales_confirmed_value: 0,
    telesales_confirmed_kg: 0,
    retained_upsell_count: 0,
    retained_upsell_value: 0,
    products: [],
    sources: [],
  };
}

// Abandoned checkouts have their own status machine (open → contacted →
// dismissed/recovered) — not the confirm/cancel vocabulary orders use — so
// they get their own metrics shape instead of reusing emptyMetrics().
function emptyAbandonedMetrics() {
  return {
    contacted_count: 0,
    dismissed_count: 0,
    reopened_count: 0,
    converted_count: 0,
    converted_value: 0,
  };
}

function normalizeCourierStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function classifyCourierOutcome({ courier_status: courierStatus, return_status: returnStatus } = {}) {
  const courier = normalizeCourierStatus(courierStatus);
  const returned = normalizeCourierStatus(returnStatus);
  if (courier.includes("cancel") || courier.includes("reject")) return null;
  if (courier === "delivered" || courier === "partial_delivered") return "delivered";
  if (courier.includes("return") || returned === "returned" || returned === "completed") return "returned";
  return null;
}

function activityNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateRetainedUpsells(events = [], {
  selectedActorIds = [],
  since = null,
  until = null,
  terminalLossOrderIds = new Set(),
  onRetainedLot = null,
} = {}) {
  const selected = new Set(selectedActorIds);
  const totals = new Map([...selected].map((actorId) => [actorId, { count: 0, value: 0 }]));
  const lotsByItem = new Map();
  const terminalOrders = new Set(terminalLossOrderIds);
  const ordered = [...events].sort((a, b) => {
    const timeDelta = new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime();
    return timeDelta || String(a?.id || "").localeCompare(String(b?.id || ""));
  });

  const reduceItemQuantity = (orderId, itemKey, reduction) => {
    const lots = lotsByItem.get(`${orderId}:${itemKey}`) || [];
    const activeQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
    if (activeQuantity <= 0) return;
    const reductionRatio = Math.min(1, Math.max(0, reduction) / activeQuantity);
    for (const lot of lots) {
      lot.quantity *= 1 - reductionRatio;
      lot.value *= 1 - reductionRatio;
    }
  };

  for (const event of ordered) {
    const occurredAt = new Date(event?.created_at || 0).getTime();
    if (until && occurredAt >= new Date(until).getTime()) continue;
    const eventStatus = normalizeCourierStatus(event?.metadata?.to_status);
    if (event?.event_type === "order.reopened") terminalOrders.delete(event.order_id);
    if (
      event?.event_type === "order.cancelled"
      || event?.event_type === "order.deleted"
      || eventStatus === "cancelled"
      || eventStatus === "canceled"
      || eventStatus === "rejected"
      || eventStatus === "returned"
      || eventStatus === "return_completed"
    ) terminalOrders.add(event.order_id);
    for (const change of Array.isArray(event?.changes) ? event.changes : []) {
      const itemKey = change?.item_key;
      const quantityDelta = activityNumber(change?.quantity_delta);
      const inRange = (!since || occurredAt >= new Date(since).getTime())
        && (!until || occurredAt < new Date(until).getTime());
      if (change?.addition_reason === "upsell" && quantityDelta > 0 && event?.actor_id && inRange) {
        const key = `${event.order_id}:${itemKey || "unknown"}`;
        const lots = lotsByItem.get(key) || [];
        lots.push({ actorId: event.actor_id, quantity: quantityDelta, value: Math.max(0, activityNumber(change?.amount_delta)), occurredAt: event.created_at });
        lotsByItem.set(key, lots);
        continue;
      }

      if (itemKey && quantityDelta < 0) {
        reduceItemQuantity(event.order_id, itemKey, Math.abs(quantityDelta));
        continue;
      }

      if (change?.type === "item_discount_changed" && itemKey) {
        const discountIncrease = Math.max(0, activityNumber(change.after) - activityNumber(change.before));
        for (const lot of lotsByItem.get(`${event.order_id}:${itemKey}`) || []) {
          lot.value = Math.max(0, lot.value - (discountIncrease * lot.quantity));
        }
        continue;
      }

      if (change?.type === "field_changed" && change?.field === "discount") {
        const lots = [...lotsByItem.entries()]
          .filter(([key]) => key.startsWith(`${event.order_id}:`))
          .flatMap(([, itemLots]) => itemLots)
          .filter((lot) => lot.quantity > 0 && lot.value > 0);
        const retainedValue = lots.reduce((sum, lot) => sum + lot.value, 0);
        const discountIncrease = Math.min(
          retainedValue,
          Math.max(0, activityNumber(change.after) - activityNumber(change.before)),
        );
        if (discountIncrease > 0 && retainedValue > 0) {
          for (const lot of lots) lot.value = Math.max(0, lot.value - (discountIncrease * (lot.value / retainedValue)));
        }
      }
    }
  }

  for (const [orderItemKey, lots] of lotsByItem) {
    const orderId = orderItemKey.slice(0, orderItemKey.indexOf(":"));
    if (terminalOrders.has(orderId)) continue;
    for (const lot of lots) {
      if (selected.size > 0 && !selected.has(lot.actorId)) continue;
      const total = totals.get(lot.actorId) || { count: 0, value: 0 };
      total.count += lot.quantity;
      total.value += lot.value;
      totals.set(lot.actorId, total);
      onRetainedLot?.(lot);
    }
  }
  for (const actorId of [...totals.keys()]) {
    if (selected.size > 0 && !selected.has(actorId)) totals.delete(actorId);
  }
  for (const total of totals.values()) {
    total.count = Number(total.count.toFixed(2));
    total.value = Number(total.value.toFixed(2));
  }
  return totals;
}

function finalizeMetrics(metrics) {
  metrics.confirmation_rate = metrics.assigned_count > 0
    ? metrics.confirmed_assigned_count / metrics.assigned_count
    : null;
  metrics.cancellation_rate = metrics.assigned_count > 0
    ? metrics.cancelled_assigned_count / metrics.assigned_count
    : null;
  metrics.average_order_value = metrics.confirmed_count > 0
    ? metrics.confirmed_value / metrics.confirmed_count
    : null;
  metrics.delivered_rate = metrics.confirmed_count > 0
    ? metrics.delivered_count / metrics.confirmed_count
    : null;
  return metrics;
}

function normalizeProductName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeSizeLabel(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

// Storefront lines can arrive as "Product (size)" with no product/variant id;
// split the size back out so the line maps to the catalog variant.
function resolveSizeSuffixedItem(itemName, productsByName, variantsByProductId) {
  const match = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(String(itemName ?? ""));
  if (!match) return null;
  const product = productsByName.get(normalizeProductName(match[1]));
  if (!product) return null;
  const label = normalizeSizeLabel(match[2]);
  const variant = (variantsByProductId.get(product.id) || []).find((candidate) =>
    Object.values(candidate?.attributes || {}).some((value) => normalizeSizeLabel(value) === label)) || null;
  return { product, variant };
}

export function addProductDetails(
  productRows,
  items,
  productsById,
  productsByName,
  missingWeightProducts,
  variantsById,
  { orderWeightKg = null, variantsByProductId = new Map() } = {},
) {
  const lines = [];
  for (const item of Array.isArray(items) ? items : []) {
    const packs = toValidQuantity(item?.quantity);
    if (!packs) continue;

    const itemName = item?.product_name ?? item?.product;
    let variant = (variantsById && item?.variant_id) ? variantsById.get(item.variant_id) : null;
    let product = productsById.get(item?.product_id)
      || (variant?.product_id ? productsById.get(variant.product_id) : null)
      || productsByName.get(normalizeProductName(itemName));
    if (!product) {
      const resolved = resolveSizeSuffixedItem(itemName, productsByName, variantsByProductId);
      if (resolved) ({ product, variant } = resolved);
    }
    const resolvedWeight = variant?.weight_kg ?? product?.weight_kg ?? null;
    lines.push({ product, itemName, packs, kg: resolvedWeight === null ? null : packs * toNumber(resolvedWeight) });
  }

  // A single line whose size is unknown takes whatever order weight the
  // resolved lines don't account for.
  const unresolved = lines.filter((line) => line.kg === null);
  const orderKg = toNumber(orderWeightKg);
  if (unresolved.length === 1 && orderKg > 0) {
    const resolvedKg = lines.reduce((sum, line) => sum + (line.kg ?? 0), 0);
    unresolved[0].kg = Math.max(0, orderKg - resolvedKg);
  }

  for (const line of lines) {
    const { product } = line;
    const productId = product?.id || null;
    const productName = product?.name || line.itemName || "Unknown product";
    const key = productId || `name:${normalizeProductName(productName)}`;
    const detail = productRows.get(key) || {
      product_id: productId,
      product_name: productName,
      packs: 0,
      kg: 0,
    };
    detail.packs += line.packs;
    detail.kg += line.kg ?? 0;
    const hasCatalogWeight = product?.weight_kg != null
      || (variantsByProductId.get(product?.id) || []).some((candidate) => candidate?.weight_kg != null);
    if (product?.id && !hasCatalogWeight) {
      missingWeightProducts.set(product.id, { id: product.id, name: product.name });
    }
    productRows.set(key, detail);
  }
}

const PRODUCT_OUTCOMES = ["delivered", "returned", "cancelled"];

// Confirmed packs/kg keep their meaning; outcome columns come from their own
// maps, so a product that was only cancelled still appears with zero packs.
function mergeProductOutcomes(confirmedRows, outcomeRows = {}) {
  const merged = new Map();
  const ensure = (key, detail) => {
    if (!merged.has(key)) {
      merged.set(key, {
        product_id: detail.product_id,
        product_name: detail.product_name,
        packs: 0,
        kg: 0,
        delivered_packs: 0,
        delivered_kg: 0,
        returned_packs: 0,
        returned_kg: 0,
        cancelled_packs: 0,
        cancelled_kg: 0,
      });
    }
    return merged.get(key);
  };
  for (const [key, detail] of confirmedRows || new Map()) {
    const row = ensure(key, detail);
    row.packs = detail.packs;
    row.kg = detail.kg;
  }
  for (const outcome of PRODUCT_OUTCOMES) {
    for (const [key, detail] of outcomeRows[outcome] || new Map()) {
      const row = ensure(key, detail);
      row[`${outcome}_packs`] = detail.packs;
      row[`${outcome}_kg`] = detail.kg;
    }
  }
  return [...merged.values()].sort((a, b) => (
    (b.packs + b.cancelled_packs) - (a.packs + a.cancelled_packs)
    || a.product_name.localeCompare(b.product_name)
  ));
}

function currentAttributionActivities(orders, action) {
  const actorField = action === "confirmed" ? "confirmed_by" : "cancelled_by";
  const timestampField = action === "confirmed" ? "confirmed_at" : "cancelled_at";
  return (orders || []).map((order) => ({
    action,
    actor_id: order?.[actorField],
    occurred_at: order?.[timestampField],
    order,
  }));
}

function activityOrder(activity) {
  return activity?.order || activity || {};
}

function activityOrderId(activity, order) {
  return activity?.order_id || order?.id || null;
}

function activityActorId(activity, action, order) {
  const actorField = action === "confirmed" ? "confirmed_by" : "cancelled_by";
  return activity?.actor_id || order?.[actorField] || null;
}

function activityTimestamp(activity, action, order) {
  const timestampField = action === "confirmed" ? "confirmed_at" : "cancelled_at";
  return activity?.occurred_at || order?.[timestampField] || null;
}

function selectActivities(activities, orders, action) {
  if (!Array.isArray(activities)) return currentAttributionActivities(orders, action);
  return activities.filter((activity) => activity?.action === action);
}

// An order approved more than once in range (moved back and re-approved, even by
// another member) counts once, credited to its latest approval by a listed member.
// Approvals with no order id cannot be matched, so each still counts.
function countedConfirmations(activities, rowsByUserId, since, until) {
  const latestByOrder = new Map();
  for (const activity of activities) {
    const order = activityOrder(activity);
    const orderId = activityOrderId(activity, order);
    const occurredAt = activityTimestamp(activity, "confirmed", order);
    if (!orderId || !rowsByUserId.has(activityActorId(activity, "confirmed", order)) || !isInInterval(occurredAt, since, until)) continue;
    const at = new Date(occurredAt).getTime();
    const previous = latestByOrder.get(orderId);
    if (!previous || at >= previous.at) latestByOrder.set(orderId, { activity, at });
  }
  const counted = new Set([...latestByOrder.values()].map((entry) => entry.activity));
  return (activity) => !activityOrderId(activity, activityOrder(activity)) || counted.has(activity);
}

export function createProductLookups(products, variants) {
  const variantsById = new Map((variants || []).filter((variant) => variant?.id).map((variant) => [variant.id, variant]));
  const productsById = new Map((products || []).filter((product) => product?.id).map((product) => [product.id, product]));
  const productsByName = new Map();
  const ambiguousProductNames = new Set();
  for (const product of products || []) {
    const name = normalizeProductName(product?.name);
    if (!name || ambiguousProductNames.has(name)) continue;
    if (productsByName.has(name)) {
      productsByName.delete(name);
      ambiguousProductNames.add(name);
      continue;
    }
    productsByName.set(name, product);
  }
  const variantsByProductId = new Map();
  for (const variant of variants || []) {
    if (!variant?.product_id) continue;
    const list = variantsByProductId.get(variant.product_id) || [];
    list.push(variant);
    variantsByProductId.set(variant.product_id, list);
  }
  return { productsById, productsByName, variantsById, variantsByProductId };
}

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const dayLabelFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function dhakaDayHour(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const shifted = new Date(timestamp + DHAKA_OFFSET_MS);
  return { day: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
}

function hourLabel(hour) {
  return `${hour % 12 || 12}${hour < 12 ? "a" : "p"}`;
}

function dayLabel(day) {
  return dayLabelFormatter.format(new Date(`${day}T00:00:00Z`));
}

const SERIES_FIELDS = [
  "confirmed_count",
  "confirmed_value",
  "handled_count",
  "handled_confirmed_count",
  "handled_delivered_count",
  "extra_value",
];

function createSeriesBucket(key, label) {
  const bucket = { key, label };
  for (const field of SERIES_FIELDS) bucket[field] = 0;
  return bucket;
}

// Each point is { day, hour, ...increments } where increments add to SERIES_FIELDS.
function buildConfirmationSeries(points, range) {
  const byDay = new Map();
  const byDayHour = new Map();
  const addTo = (bucket, point) => {
    for (const field of SERIES_FIELDS) bucket[field] += point[field] || 0;
  };
  for (const point of points) {
    const day = byDay.get(point.day) || createSeriesBucket(point.day, dayLabel(point.day));
    addTo(day, point);
    byDay.set(point.day, day);
    const key = `${point.day}-${point.hour}`;
    const hour = byDayHour.get(key) || createSeriesBucket(key, hourLabel(point.hour));
    addTo(hour, point);
    byDayHour.set(key, hour);
  }
  if (range?.from && range?.to && range.from === range.to) {
    return {
      granularity: "hour",
      buckets: Array.from({ length: 24 }, (_, hour) => byDayHour.get(`${range.from}-${hour}`) || createSeriesBucket(`${range.from}-${hour}`, hourLabel(hour))),
    };
  }
  if (range?.from && range?.to) {
    const start = new Date(`${range.from}T00:00:00Z`).getTime();
    const end = new Date(`${range.to}T00:00:00Z`).getTime();
    const buckets = [];
    for (let time = start; time <= end; time += MS_PER_DAY) {
      const day = new Date(time).toISOString().slice(0, 10);
      buckets.push(byDay.get(day) || createSeriesBucket(day, dayLabel(day)));
    }
    return { granularity: "day", buckets };
  }
  return {
    granularity: "day",
    buckets: [...byDay.keys()].sort().slice(-30).map((day) => byDay.get(day)),
  };
}

export function buildStaffReport(
  orders,
  inboxOrders,
  orderItems,
  products,
  staff,
  { since = null, until = null, range = null, regularActivities, socialActivities, abandonedActivities, upsellActivities, variants = null } = {},
  variantsArg = null,
) {
  const variantsList = Array.isArray(variantsArg) ? variantsArg : (Array.isArray(variants) ? variants : []);
  const { productsById, productsByName, variantsById, variantsByProductId } = createProductLookups(products, variantsList);

  const itemsByOrderId = new Map();
  for (const item of orderItems || []) {
    if (!item?.order_id) continue;
    const items = itemsByOrderId.get(item.order_id) || [];
    items.push(item);
    itemsByOrderId.set(item.order_id, items);
  }

  const rows = (staff || []).filter((member) => member?.user_id).map((member) => ({
    user_id: member.user_id,
    display_name: member.display_name || "Unnamed member",
    is_active: !member.deleted_at,
    orders: emptyMetrics(),
    social_inbox_orders: emptyMetrics(),
    abandoned_checkouts: emptyAbandonedMetrics(),
  }));
  const rowsByUserId = new Map(rows.map((row) => [row.user_id, row]));
  const seriesPoints = [];
  const addSeriesPoint = (occurredAt, increments) => {
    const parts = dhakaDayHour(occurredAt);
    if (parts) seriesPoints.push({ ...parts, ...increments });
  };
  const retainedUpsells = calculateRetainedUpsells(upsellActivities || [], {
    selectedActorIds: rows.map((row) => row.user_id),
    since,
    until,
    onRetainedLot: (lot) => addSeriesPoint(lot.occurredAt, { extra_value: lot.value }),
  });
  for (const row of rows) {
    const retained = retainedUpsells.get(row.user_id);
    row.orders.retained_upsell_count = retained?.count || 0;
    row.orders.retained_upsell_value = retained?.value || 0;
  }
  const missingWeightProducts = new Map();
  const productRowsByMetrics = new Map();
  const confirmedAssignedOrderKeys = new Set();
  const cancelledAssignedOrderKeys = new Set();

  const outcomeProductRowsByMetrics = new Map();
  // Per actor: each regular order they confirmed or cancelled in range, keyed
  // by order and classified by their latest action on it. Activities with no
  // order id cannot be matched, so each gets its own key.
  const lastActionByActor = new Map();
  let unknownOrderSeq = 0;

  const productsForMetrics = (metrics) => {
    if (!productRowsByMetrics.has(metrics)) productRowsByMetrics.set(metrics, new Map());
    return productRowsByMetrics.get(metrics);
  };
  const outcomeProductsForMetrics = (metrics, outcome) => {
    if (!outcomeProductRowsByMetrics.has(metrics)) outcomeProductRowsByMetrics.set(metrics, {});
    const byOutcome = outcomeProductRowsByMetrics.get(metrics);
    if (!byOutcome[outcome]) byOutcome[outcome] = new Map();
    return byOutcome[outcome];
  };
  const recordHandled = (actorId, action, orderId, order, occurredAt) => {
    if (!lastActionByActor.has(actorId)) lastActionByActor.set(actorId, new Map());
    const entries = lastActionByActor.get(actorId);
    const key = orderId || `unknown:${unknownOrderSeq++}`;
    const at = new Date(occurredAt).getTime();
    const previous = entries.get(key);
    // A confirm and cancel at the same instant means the order ended cancelled.
    if (!previous || at > previous.at || (at === previous.at && action === "cancelled")) {
      entries.set(key, { action, at, order, orderId });
    }
  };

  for (const order of orders || []) {
    const assignedRow = rowsByUserId.get(order?.assigned_to);
    if (assignedRow && isInInterval(order.created_at, since, until)) {
      assignedRow.orders.assigned_count += 1;
    }
  }

  for (const activity of selectActivities(regularActivities, orders, "cancelled")) {
    const order = activityOrder(activity);
    const actorId = activityActorId(activity, "cancelled", order);
    const occurredAt = activityTimestamp(activity, "cancelled", order);
    const cancelledRow = rowsByUserId.get(actorId);
    if (!cancelledRow || !isInInterval(occurredAt, since, until)) continue;

    const metrics = cancelledRow.orders;
    metrics.cancelled_count += 1;
    metrics.cancelled_value += toNumber(order.price);
    const orderId = activityOrderId(activity, order);
    recordHandled(actorId, "cancelled", orderId, order, occurredAt);
    const assignedKey = `${actorId}:${orderId || "unknown"}`;
    if (
      order.assigned_to === actorId &&
      isInInterval(order.created_at, since, until) &&
      !cancelledAssignedOrderKeys.has(assignedKey)
    ) {
      cancelledAssignedOrderKeys.add(assignedKey);
      metrics.cancelled_assigned_count += 1;
    }
  }

  const regularConfirmations = selectActivities(regularActivities, orders, "confirmed");
  const isCountedRegularConfirmation = countedConfirmations(regularConfirmations, rowsByUserId, since, until);
  for (const activity of regularConfirmations) {
    const order = activityOrder(activity);
    const actorId = activityActorId(activity, "confirmed", order);
    const occurredAt = activityTimestamp(activity, "confirmed", order);
    const confirmedRow = rowsByUserId.get(actorId);
    if (!confirmedRow || !isInInterval(occurredAt, since, until)) continue;
    if (!isCountedRegularConfirmation(activity)) {
      // A superseded approval still shows the member handled the order.
      recordHandled(actorId, "confirmed", activityOrderId(activity, order), order, occurredAt);
      continue;
    }

    const metrics = confirmedRow.orders;
    const value = toNumber(order.price);
    const weightKg = toNumber(order.weight_kg);
    metrics.confirmed_count += 1;
    metrics.confirmed_value += value;
    metrics.confirmed_kg += weightKg;
    const isTelesales = String(order.source || "").trim().toLowerCase() === "telesales";
    addSeriesPoint(occurredAt, { confirmed_count: 1, confirmed_value: value, extra_value: isTelesales ? value : 0 });
    const orderId = activityOrderId(activity, order);
    recordHandled(actorId, "confirmed", orderId, order, occurredAt);
    const assignedKey = `${actorId}:${orderId || "unknown"}`;
    const outcome = classifyCourierOutcome(order);
    if (
      order.assigned_to === actorId &&
      isInInterval(order.created_at, since, until) &&
      !confirmedAssignedOrderKeys.has(assignedKey)
    ) {
      confirmedAssignedOrderKeys.add(assignedKey);
      metrics.confirmed_assigned_count += 1;
      if (outcome === "delivered") metrics.confirmed_assigned_delivered_count += 1;
      if (outcome === "returned") metrics.confirmed_assigned_returned_count += 1;
    }
    if (outcome === "delivered") {
      metrics.delivered_count += 1;
      metrics.delivered_value += value;
    }
    if (outcome === "returned") {
      metrics.returned_count += 1;
      metrics.returned_value += value;
    }
    if (isTelesales) {
      metrics.telesales_confirmed_count += 1;
      metrics.telesales_confirmed_value += value;
      metrics.telesales_confirmed_kg += weightKg;
    }
  }

  // Handled basis and product outcomes: one entry per (member, order), so a
  // re-confirmed or twice-cancelled order is never counted twice.
  for (const [actorId, entries] of lastActionByActor) {
    const handledRow = rowsByUserId.get(actorId);
    if (!handledRow) continue;
    const metrics = handledRow.orders;
    // Handled orders split by order source, using the order form's source vocabulary.
    const bySource = new Map();
    for (const { action, at, order, orderId } of entries.values()) {
      const value = toNumber(order.price);
      const source = detectCustomerOrderSource(order, "order");
      if (!bySource.has(source)) {
        bySource.set(source, { source, handled_count: 0, confirmed_count: 0, confirmed_value: 0, cancelled_count: 0, delivered_count: 0, returned_count: 0 });
      }
      const sourceRow = bySource.get(source);
      sourceRow.handled_count += 1;
      const addItems = (productRows) => addProductDetails(
        productRows,
        orderId ? itemsByOrderId.get(orderId) : undefined,
        productsById,
        productsByName,
        missingWeightProducts,
        variantsById,
        { orderWeightKg: order.weight_kg, variantsByProductId },
      );
      metrics.handled_count += 1;
      const outcome = action === "cancelled" ? null : classifyCourierOutcome(order);
      addSeriesPoint(at, {
        handled_count: 1,
        handled_confirmed_count: action === "cancelled" ? 0 : 1,
        handled_delivered_count: outcome === "delivered" ? 1 : 0,
      });
      if (action === "cancelled") {
        metrics.handled_cancelled_count += 1;
        metrics.handled_cancelled_value += value;
        sourceRow.cancelled_count += 1;
        addItems(outcomeProductsForMetrics(metrics, "cancelled"));
        continue;
      }
      metrics.handled_confirmed_count += 1;
      metrics.handled_confirmed_value += value;
      sourceRow.confirmed_count += 1;
      sourceRow.confirmed_value += value;
      metrics.handled_confirmed_kg += toNumber(order.weight_kg);
      addItems(productsForMetrics(metrics));
      if (outcome === "delivered" || outcome === "returned") {
        metrics[`handled_${outcome}_count`] += 1;
        metrics[`handled_${outcome}_value`] += value;
        sourceRow[`${outcome}_count`] += 1;
        addItems(outcomeProductsForMetrics(metrics, outcome));
      }
    }
    metrics.sources = [...bySource.values()].sort((a, b) => b.handled_count - a.handled_count || b.confirmed_value - a.confirmed_value);
  }

  for (const assignedKey of cancelledAssignedOrderKeys) {
    if (!confirmedAssignedOrderKeys.has(assignedKey)) continue;
    const actorId = assignedKey.slice(0, assignedKey.indexOf(":"));
    const overlapRow = rowsByUserId.get(actorId);
    if (overlapRow) overlapRow.orders.confirmed_assigned_cancelled_count += 1;
  }

  for (const activity of selectActivities(socialActivities, inboxOrders, "cancelled")) {
    const order = activityOrder(activity);
    const actorId = activityActorId(activity, "cancelled", order);
    const occurredAt = activityTimestamp(activity, "cancelled", order);
    const cancelledRow = rowsByUserId.get(actorId);
    if (!cancelledRow || !isInInterval(occurredAt, since, until)) continue;

    const metrics = cancelledRow.social_inbox_orders;
    metrics.cancelled_count += 1;
    metrics.cancelled_value += toNumber(order.total_price);
  }

  const socialConfirmations = selectActivities(socialActivities, inboxOrders, "confirmed");
  const isCountedSocialConfirmation = countedConfirmations(socialConfirmations, rowsByUserId, since, until);
  for (const activity of socialConfirmations) {
    const order = activityOrder(activity);
    const actorId = activityActorId(activity, "confirmed", order);
    const occurredAt = activityTimestamp(activity, "confirmed", order);
    const confirmedRow = rowsByUserId.get(actorId);
    if (!confirmedRow || !isInInterval(occurredAt, since, until) || !isCountedSocialConfirmation(activity)) continue;

    const metrics = confirmedRow.social_inbox_orders;
    const value = toNumber(order.total_price);
    metrics.confirmed_count += 1;
    metrics.confirmed_value += value;
    metrics.confirmed_kg += toNumber(order.weight_kg);
    const outcome = classifyCourierOutcome(order);
    if (outcome === "delivered") {
      metrics.delivered_count += 1;
      metrics.delivered_value += value;
    }
    if (outcome === "returned") {
      metrics.returned_count += 1;
      metrics.returned_value += value;
    }
    addProductDetails(
      productsForMetrics(metrics),
      order.items,
      productsById,
      productsByName,
      missingWeightProducts,
      variantsById,
      { orderWeightKg: order.weight_kg, variantsByProductId },
    );
  }

  for (const activity of abandonedActivities || []) {
    const row = rowsByUserId.get(activity?.actor_id);
    if (!row || !isInInterval(activity?.occurred_at, since, until)) continue;

    const metrics = row.abandoned_checkouts;
    if (activity.action === "contacted") metrics.contacted_count += 1;
    else if (activity.action === "dismissed") metrics.dismissed_count += 1;
    else if (activity.action === "reopened") metrics.reopened_count += 1;
    else if (activity.action === "converted") {
      metrics.converted_count += 1;
      metrics.converted_value += toNumber(activity.value);
      addSeriesPoint(activity.occurred_at, { extra_value: toNumber(activity.value) });
    }
  }

  for (const row of rows) {
    row.orders.products = mergeProductOutcomes(
      productRowsByMetrics.get(row.orders),
      outcomeProductRowsByMetrics.get(row.orders),
    );
    row.social_inbox_orders.products = mergeProductOutcomes(productRowsByMetrics.get(row.social_inbox_orders));
    finalizeMetrics(row.orders);
    finalizeMetrics(row.social_inbox_orders);
  }

  return {
    rows,
    series: buildConfirmationSeries(seriesPoints, range),
    missing_weight_products: [...missingWeightProducts.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
