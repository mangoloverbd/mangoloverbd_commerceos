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

export function resolveStaffReportRequest({ from, to, users, role, userId, staff }) {
  const hasFrom = from !== undefined && from !== null;
  const hasTo = to !== undefined && to !== null;
  if (hasFrom !== hasTo) {
    throw invalidReportRequest("Provide both from and to dates");
  }

  const interval = hasFrom ? toDhakaInterval(from, to) : null;
  if (interval && interval.from > interval.to) {
    throw invalidReportRequest("Report start date must not be after the end date");
  }
  const rosterIds = (staff || []).map((member) => member.user_id).filter(Boolean);
  if (role !== "team_member" && users !== undefined && users !== null && typeof users !== "string") {
    throw invalidReportRequest("Invalid users filter");
  }
  const requestedUserIds = [...new Set((role === "team_member" ? "" : users || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean))];
  if (role !== "team_member" && requestedUserIds.some((id) => !UUID_RE.test(id))) {
    throw invalidReportRequest("Invalid users filter");
  }
  if (role !== "team_member" && requestedUserIds.some((id) => !rosterIds.includes(id))) {
    throw invalidReportRequest("Selected staff member is not in this workspace");
  }
  const selectedUserIds = role === "team_member"
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
    confirmed_count: 0,
    confirmed_assigned_count: 0,
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
        lots.push({ actorId: event.actor_id, quantity: quantityDelta, value: Math.max(0, activityNumber(change?.amount_delta)) });
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

export function buildStaffReport(
  orders,
  inboxOrders,
  orderItems,
  products,
  staff,
  { since = null, until = null, regularActivities, socialActivities, abandonedActivities, upsellActivities, variants = null } = {},
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
  const retainedUpsells = calculateRetainedUpsells(upsellActivities || [], {
    selectedActorIds: rows.map((row) => row.user_id),
    since,
    until,
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

  const productsForMetrics = (metrics) => {
    if (!productRowsByMetrics.has(metrics)) productRowsByMetrics.set(metrics, new Map());
    return productRowsByMetrics.get(metrics);
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

  for (const activity of selectActivities(regularActivities, orders, "confirmed")) {
    const order = activityOrder(activity);
    const actorId = activityActorId(activity, "confirmed", order);
    const occurredAt = activityTimestamp(activity, "confirmed", order);
    const confirmedRow = rowsByUserId.get(actorId);
    if (!confirmedRow || !isInInterval(occurredAt, since, until)) continue;

    const metrics = confirmedRow.orders;
    const value = toNumber(order.price);
    const weightKg = toNumber(order.weight_kg);
    metrics.confirmed_count += 1;
    metrics.confirmed_value += value;
    metrics.confirmed_kg += weightKg;
    const orderId = activityOrderId(activity, order);
    const assignedKey = `${actorId}:${orderId || "unknown"}`;
    if (
      order.assigned_to === actorId &&
      isInInterval(order.created_at, since, until) &&
      !confirmedAssignedOrderKeys.has(assignedKey)
    ) {
      confirmedAssignedOrderKeys.add(assignedKey);
      metrics.confirmed_assigned_count += 1;
    }
    const outcome = classifyCourierOutcome(order);
    if (outcome === "delivered") {
      metrics.delivered_count += 1;
      metrics.delivered_value += value;
    }
    if (outcome === "returned") {
      metrics.returned_count += 1;
      metrics.returned_value += value;
    }
    if (String(order.source || "").trim().toLowerCase() === "telesales") {
      metrics.telesales_confirmed_count += 1;
      metrics.telesales_confirmed_value += value;
      metrics.telesales_confirmed_kg += weightKg;
    }

    addProductDetails(
      productsForMetrics(metrics),
      itemsByOrderId.get(orderId),
      productsById,
      productsByName,
      missingWeightProducts,
      variantsById,
      { orderWeightKg: order.weight_kg, variantsByProductId },
    );
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

  for (const activity of selectActivities(socialActivities, inboxOrders, "confirmed")) {
    const order = activityOrder(activity);
    const actorId = activityActorId(activity, "confirmed", order);
    const occurredAt = activityTimestamp(activity, "confirmed", order);
    const confirmedRow = rowsByUserId.get(actorId);
    if (!confirmedRow || !isInInterval(occurredAt, since, until)) continue;

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
    }
  }

  for (const row of rows) {
    row.orders.products = [...(productRowsByMetrics.get(row.orders) || new Map()).values()];
    row.social_inbox_orders.products = [...(productRowsByMetrics.get(row.social_inbox_orders) || new Map()).values()];
    row.orders.products.sort((a, b) => b.packs - a.packs || a.product_name.localeCompare(b.product_name));
    row.social_inbox_orders.products.sort((a, b) => b.packs - a.packs || a.product_name.localeCompare(b.product_name));
    finalizeMetrics(row.orders);
    finalizeMetrics(row.social_inbox_orders);
  }

  return {
    rows,
    missing_weight_products: [...missingWeightProducts.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
