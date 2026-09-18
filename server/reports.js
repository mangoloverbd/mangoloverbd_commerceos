const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalidReportRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function isValidYmd(value) {
  if (typeof value !== "string" || !YMD_RE.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
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
    products: [],
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

function addProductDetails(metrics, items, productsById, productsByName, missingWeightProducts) {
  const productRows = new Map(metrics.products.map((product) => [
    product.product_id || `name:${normalizeProductName(product.product_name)}`,
    product,
  ]));

  for (const item of items || []) {
    const packs = toValidQuantity(item?.quantity);
    if (!packs) continue;

    const itemName = item?.product_name ?? item?.product;
    const product = productsById.get(item?.product_id) || productsByName.get(normalizeProductName(itemName));
    const productId = product?.id || null;
    const productName = product?.name || itemName || "Unknown product";
    const key = productId || `name:${normalizeProductName(productName)}`;
    const detail = productRows.get(key) || {
      product_id: productId,
      product_name: productName,
      packs: 0,
      kg: 0,
    };
    detail.packs += packs;
    detail.kg += packs * toNumber(product?.weight_kg);
    if (product?.id && product.weight_kg === null) {
      missingWeightProducts.set(product.id, { id: product.id, name: product.name });
    }
    productRows.set(key, detail);
  }

  metrics.products = [...productRows.values()];
}

export function buildStaffReport(orders, inboxOrders, orderItems, products, staff, { since = null, until = null } = {}) {
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
  }));
  const rowsByUserId = new Map(rows.map((row) => [row.user_id, row]));
  const missingWeightProducts = new Map();

  for (const order of orders || []) {
    const assignedRow = rowsByUserId.get(order?.assigned_to);
    if (assignedRow && isInInterval(order.created_at, since, until)) {
      assignedRow.orders.assigned_count += 1;
    }

    const cancelledRow = rowsByUserId.get(order?.cancelled_by);
    if (cancelledRow && isInInterval(order.cancelled_at, since, until)) {
      const metrics = cancelledRow.orders;
      metrics.cancelled_count += 1;
      metrics.cancelled_value += toNumber(order.price);
      if (order.assigned_to === order.cancelled_by) metrics.cancelled_assigned_count += 1;
    }

    const confirmedRow = rowsByUserId.get(order?.confirmed_by);
    if (!confirmedRow || !isInInterval(order.confirmed_at, since, until)) continue;

    const metrics = confirmedRow.orders;
    const value = toNumber(order.price);
    const weightKg = toNumber(order.weight_kg);
    metrics.confirmed_count += 1;
    metrics.confirmed_value += value;
    metrics.confirmed_kg += weightKg;
    if (order.assigned_to === order.confirmed_by) metrics.confirmed_assigned_count += 1;
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

    addProductDetails(metrics, itemsByOrderId.get(order.id), productsById, productsByName, missingWeightProducts);
  }

  for (const order of inboxOrders || []) {
    const cancelledRow = rowsByUserId.get(order?.cancelled_by);
    if (cancelledRow && isInInterval(order.cancelled_at, since, until)) {
      const metrics = cancelledRow.social_inbox_orders;
      metrics.cancelled_count += 1;
      metrics.cancelled_value += toNumber(order.total_price);
    }

    const confirmedRow = rowsByUserId.get(order?.confirmed_by);
    if (!confirmedRow || !isInInterval(order.confirmed_at, since, until)) continue;

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
    addProductDetails(metrics, order.items, productsById, productsByName, missingWeightProducts);
  }

  for (const row of rows) {
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
