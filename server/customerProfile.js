import { buildCustomers, customerKeyFor, detectCustomerOrderSource, normalizeCustomerPhone, parseInboxPhone } from "./customers.js";
import { customerOrderOutcome, customerReturnPending } from "./customerOutcomes.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value) => typeof value === "string" ? value.trim() : "";
const dateTime = (value) => value && Number.isFinite(Date.parse(value)) ? value : null;
const time = (value) => dateTime(value) ? Date.parse(value) : 0;
const amount = (value) => value !== null && value !== undefined && String(value).trim() && Number.isFinite(Number(value)) ? Number(value) : null;

export function parseCustomerId(id) {
  if (typeof id !== "string") return null;
  if (/^01\d{9}$/.test(id)) return { phone: id, kind: null, rowId: null };
  const [kind, rowId, extra] = id.split(":");
  return !extra && ["order", "social"].includes(kind) && UUID.test(rowId || "") ? { phone: null, kind, rowId } : null;
}

function inboxAddress(row) {
  return text(row.address) || text(String(row.notes || "").match(/Address:\s*([^\n]+)/i)?.[1]);
}

function productsFor(row, kind, orderItems) {
  const items = kind === "order" ? orderItems : Array.isArray(row.items) ? row.items : [];
  if (items.length) return items.map((item) => ({ name: text(item.product_name || item.product || item.name), quantity: Number(item.quantity) > 0 ? Number(item.quantity) : null })).filter((item) => item.name);
  // Legacy text is not a reliable line-item parser. Keep it as recorded instead
  // of guessing product identities and quantities from commas or x characters.
  const name = text(kind === "order" ? row.product : row.items);
  return name ? [{ name, quantity: Number(row.quantity) > 0 ? Number(row.quantity) : null }] : [];
}

export function buildCustomerProfile({ customerId, orders = [], inboxOrders = [], orderItems = [], now = new Date() } = {}) {
  const matchedOrders = orders.filter((row) => customerKeyFor(row, "order") === customerId);
  const matchedInbox = inboxOrders.filter((row) => customerKeyFor(row, "social") === customerId);
  if (!matchedOrders.length && !matchedInbox.length) return null;
  const itemsByOrder = new Map();
  for (const item of orderItems) {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
    itemsByOrder.get(item.order_id).push(item);
  }
  const history = [...matchedOrders.map((row) => ({ row, kind: "order" })), ...matchedInbox.map((row) => ({ row, kind: "social" }))].map(({ row, kind }) => ({
    id: row.id,
    kind: kind === "order" ? "order" : "social_order",
    name: text(kind === "order" ? row.customer_name : row.contact_name || row.customer_name),
    phone: kind === "order" ? normalizeCustomerPhone(row.phone) : parseInboxPhone(row),
    address: kind === "order" ? text(row.address) : inboxAddress(row),
    orderNumber: text(row.order_number) || null,
    source: detectCustomerOrderSource(row, kind),
    createdAt: dateTime(row.created_at),
    amount: amount(kind === "order" ? row.price : row.total_price),
    status: text(row.status) || "unknown",
    outcome: customerOrderOutcome(row),
    products: productsFor(row, kind, itemsByOrder.get(row.id) || []),
    courierName: text(row.courier_name) || null,
    courierStatus: text(row.courier_status) || null,
    trackingCode: text(row.tracking_code) || null,
    consignmentId: text(row.consignment_id) || null,
    pendingReturn: customerReturnPending(row),
    conversationId: kind === "social" ? row.conversation_id || null : null,
  })).sort((a, b) => time(b.createdAt) - time(a.createdAt) || `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));

  const validDates = history.map((row) => row.createdAt).filter(Boolean);
  const delivered = history.filter((row) => row.outcome === "delivered");
  const deliveredWithDates = delivered.filter((row) => row.createdAt);
  const lastOrderAt = validDates[0] || null;
  const firstOrderAt = validDates.at(-1) || null;
  const sum = (rows) => rows.some((row) => row.amount === null) ? null : Math.round(rows.reduce((total, row) => total + row.amount, 0) * 100) / 100;
  const deliveredValue = sum(delivered);
  const cancelledOrders = history.filter((row) => row.outcome === "cancelled").length;
  const returnedOrders = history.filter((row) => row.outcome === "returned").length;
  const riskLevel = (cancelledOrders + returnedOrders) / history.length > 0.5 && history.length >= 2 ? "high" : cancelledOrders + returnedOrders > 0 ? "medium" : "low";
  const addresses = [];
  for (const row of history) {
    if (!row.address) continue;
    const existing = addresses.find((entry) => entry.address.toLowerCase() === row.address.toLowerCase());
    if (existing) existing.orders += 1;
    else addresses.push({ address: row.address, lastUsedAt: row.createdAt, orders: 1 });
  }
  const byProduct = new Map();
  for (const row of delivered) {
    const seen = new Set();
    for (const product of row.products) {
      const key = product.name.toLowerCase();
      const current = byProduct.get(key) || { name: product.name, quantity: 0, orders: 0 };
      current.quantity = product.quantity === null || current.quantity === null ? null : current.quantity + product.quantity;
      if (!seen.has(key)) current.orders += 1;
      seen.add(key);
      byProduct.set(key, current);
    }
  }
  const products = [...byProduct.values()].sort((a, b) => b.orders - a.orders || (b.quantity || 0) - (a.quantity || 0) || a.name.localeCompare(b.name));
  const customer = buildCustomers({ orders: matchedOrders, inboxOrders: matchedInbox, now })[0];
  const summary = {
    totalOrders: history.length,
    deliveredOrders: delivered.length,
    cancelledOrders,
    returnedOrders,
    partialDeliveredOrders: history.filter((row) => row.outcome === "partial_delivered").length,
    activeOrders: history.filter((row) => row.outcome === "active").length,
    pendingReturns: history.filter((row) => row.pendingReturn).length,
    orderValue: sum(history),
    deliveredValue,
    averageDeliveredValue: delivered.length && deliveredValue !== null ? Math.round(deliveredValue / delivered.length * 100) / 100 : null,
    missingAmounts: history.filter((row) => row.amount === null).length,
    daysSinceLastOrder: lastOrderAt ? Math.max(0, Math.floor((new Date(now).getTime() - time(lastOrderAt)) / 86400000)) : null,
    daysSinceLastPurchase: deliveredWithDates[0] ? Math.max(0, Math.floor((new Date(now).getTime() - time(deliveredWithDates[0].createdAt)) / 86400000)) : null,
    averagePurchaseIntervalDays: deliveredWithDates.length >= 2 ? Math.round((time(deliveredWithDates[0].createdAt) - time(deliveredWithDates.at(-1).createdAt)) / 86400000 / (deliveredWithDates.length - 1)) : null,
  };
  return {
    id: customerId, name: history.find((row) => row.name)?.name || "Unknown", phone: history.find((row) => row.phone)?.phone || "",
    latestAddress: addresses[0]?.address || null, addresses, firstOrderAt, lastOrderAt,
    firstPurchaseAt: deliveredWithDates.at(-1)?.createdAt || null, lastPurchaseAt: deliveredWithDates[0]?.createdAt || null,
    sources: customer.sources, primarySource: customer.primarySource, lifecycleStage: customer.lifecycleStage, campaignSegments: customer.campaignSegments,
    summary, riskLevel, riskExplanation: `${cancelledOrders} cancelled and ${returnedOrders} returned out of ${history.length} orders. This is local order history, not a FraudShield score.`,
    products, history,
    suggestion: riskLevel === "high" ? "Review cancellation and return history before dispatching another COD order." : summary.activeOrders ? "Resolve the active order before making another sales follow-up." : products[0] ? `${products[0].name} appears in ${products[0].orders} delivered order(s). Check current availability and the customer's interest before offering a repeat purchase.` : "No fully delivered purchase is recorded yet. Confirm the customer's needs before a sales follow-up.",
  };
}

function invalid(message) {
  const error = new Error(message);
  error.status = 422;
  throw error;
}

function objectWithKeys(body, keys) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !keys.includes(key))) invalid("Unexpected or invalid fields");
}

export function validateCustomerContext(body) {
  objectWithKeys(body, ["tags", "followUpOn", "followUpReason", "expectedVersion"]);
  if (!Array.isArray(body.tags) || body.tags.length > 20 || body.tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.trim().length > 40)) invalid("Use up to 20 tags, each 1–40 characters");
  if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0) invalid("A valid context version is required");
  if (typeof body.followUpReason !== "string" || body.followUpReason.trim().length > 500) invalid("Follow-up reason must be at most 500 characters");
  const followUpOn = body.followUpOn;
  if (followUpOn !== null && (typeof followUpOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(followUpOn) || !Number.isFinite(Date.parse(followUpOn)) || new Date(followUpOn).toISOString().slice(0, 10) !== followUpOn)) invalid("Use a valid follow-up date");
  const followUpReason = body.followUpReason.trim();
  if (Boolean(followUpOn) !== Boolean(followUpReason)) invalid("Set both a follow-up date and reason, or clear both");
  const tags = [...new Map(body.tags.map((tag) => [tag.trim().toLowerCase(), tag.trim()])).values()];
  return { tags, followUpOn, followUpReason, expectedVersion: body.expectedVersion };
}

export function validateCustomerNote(body) {
  objectWithKeys(body, ["id", "body"]);
  if (typeof body.id !== "string" || !UUID.test(body.id)) invalid("A valid note id is required");
  if (typeof body.body !== "string" || !body.body.trim() || body.body.trim().length > 4000) invalid("Write a note between 1 and 4,000 characters");
  return { id: body.id, body: body.body.trim() };
}
