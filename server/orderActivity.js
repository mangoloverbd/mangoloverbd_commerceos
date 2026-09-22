export const ORDER_ACTIVITY_TABLES = Object.freeze([
  "orders",
  "social_inbox_orders",
  "abandoned_checkouts",
]);

export const ORDER_ACTIVITY_ACTOR_KINDS = Object.freeze([
  "user",
  "customer",
  "integration",
  "courier_webhook",
  "system",
]);

export const ORDER_ACTIVITY_CATEGORIES = Object.freeze([
  "lifecycle",
  "view",
  "edit",
  "status",
  "assignment",
  "communication",
  "fraud",
  "courier",
  "document",
]);

export const ORDER_ACTIVITY_EVENT_TYPES = Object.freeze([
  "history.started",
  "order.created",
  "order.viewed",
  "order.edited",
  "order.assigned",
  "order.status_changed",
  "order.cancelled",
  "order.reopened",
  "order.deleted",
  "fraud.checked",
  "fraud.overridden",
  "message.sent",
  "message.failed",
  "courier.submitted",
  "courier.failed",
  "courier.status_changed",
  "document.printed",
]);

export const ORDER_ACTIVITY_SURFACES = Object.freeze([
  "pending_queue",
  "search",
  "customer_history",
  "activity_log",
  "direct_link",
  "notification",
  "abandoned_queue",
  "inbox_orders",
  "order_editor",
  "system",
]);

export const CANCELLATION_REASON_CODES = Object.freeze([
  "customer_changed_mind",
  "customer_unreachable",
  "duplicate_order",
  "wrong_product_or_quantity",
  "pricing_issue",
  "delivery_charge_objection",
  "delivery_delay",
  "out_of_stock",
  "fraud_or_suspicious",
  "invalid_contact_information",
  "service_area_unavailable",
  "test_or_fake_order",
  "other",
]);

export const ADDITION_REASON_CODES = Object.freeze([
  "upsell",
  "customer_request",
  "correction",
  "replacement",
  "other",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_METADATA_KEYS = new Set([
  "origin_source",
  "origin_order_id",
  "provider",
  "courier",
  "message_type",
  "risk_level",
  "from_status",
  "to_status",
  "view_bucket",
  "upsell_value",
  "integration",
  "failure_reason",
]);

const TRACKED_ORDER_FIELDS = Object.freeze([
  ["customer_name", "Customer name"],
  ["phone", "Phone"],
  ["address", "Address"],
  ["notes", "Notes"],
  ["source", "Order source"],
  ["warehouse_id", "Warehouse"],
  ["discount", "Order discount"],
  ["delivery_rate", "Delivery fee"],
  ["payment_method", "Payment method"],
  ["advanced_payment", "Advanced payment"],
  ["price", "Order total"],
]);

function activityError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function cleanText(value, maxLength = 1000) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function comparable(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return value;
}

export function validateCancellationReason(input) {
  const code = cleanText(input?.code, 80);
  const note = cleanText(input?.note, 1000);
  if (!code) throw activityError("Cancellation reason is required");
  if (!CANCELLATION_REASON_CODES.includes(code)) throw activityError("Invalid cancellation reason");
  if (code === "other" && !note) throw activityError("Cancellation note is required for Other");
  return { code, note };
}

export function normalizeActivityGroupId(value) {
  if (value === undefined || value === null || value === "") return null;
  const groupId = cleanText(value, 36);
  if (!groupId || !UUID_RE.test(groupId)) throw activityError("Invalid activity group id");
  return groupId;
}

export function normalizeSourceSurface(value, fallback = "system") {
  const surface = cleanText(value, 80) || fallback;
  if (!ORDER_ACTIVITY_SURFACES.includes(surface)) throw activityError("Invalid activity source surface");
  return surface;
}

export function meaningfulViewBucket(value = new Date().toISOString()) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) throw activityError("Invalid view timestamp");
  const bucketMs = 30 * 60 * 1000;
  return new Date(Math.floor(timestamp / bucketMs) * bucketMs).toISOString();
}

function itemKey(item) {
  return `${item?.product_id || ""}:${item?.variant_id || ""}`;
}

function itemLabel(item) {
  return [cleanText(item?.product_name, 200) || "Product", cleanText(item?.variant_name, 200)]
    .filter(Boolean)
    .join(" · ");
}

function itemNetUnit(item) {
  return Math.max(0, Number(item?.unit_price || 0) - Number(item?.unit_discount || 0));
}

function additionReasonFor(reasons, key, item) {
  const reason = cleanText(reasons?.[key], 80);
  if (!reason) throw activityError(`Choose why ${cleanText(item?.product_name, 200) || "this product"} was added`);
  if (!ADDITION_REASON_CODES.includes(reason)) throw activityError("Invalid product addition reason");
  return reason;
}

export function buildOrderChanges({
  beforeOrder = {},
  afterOrder = {},
  beforeItems = [],
  afterItems = [],
  additionReasons = {},
} = {}) {
  const changes = [];
  for (const [field, label] of TRACKED_ORDER_FIELDS) {
    const before = comparable(beforeOrder?.[field]);
    const after = comparable(afterOrder?.[field]);
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    changes.push({ type: "field_changed", field, label, before, after });
  }

  const beforeByKey = new Map((beforeItems || []).map((item) => [itemKey(item), item]));
  const afterByKey = new Map((afterItems || []).map((item) => [itemKey(item), item]));

  for (const [key, afterItem] of afterByKey) {
    const beforeItem = beforeByKey.get(key);
    const beforeQuantity = Number(beforeItem?.quantity || 0);
    const afterQuantity = Number(afterItem?.quantity || 0);
    if (!beforeItem || afterQuantity > beforeQuantity) {
      const quantityDelta = afterQuantity - beforeQuantity;
      changes.push({
        type: beforeItem ? "item_quantity_increased" : "item_added",
        item_key: key,
        label: itemLabel(afterItem),
        before: beforeQuantity,
        after: afterQuantity,
        quantity_delta: quantityDelta,
        amount_delta: Number((itemNetUnit(afterItem) * quantityDelta).toFixed(2)),
        addition_reason: additionReasonFor(additionReasons, key, afterItem),
      });
    } else if (afterQuantity < beforeQuantity) {
      const quantityDelta = afterQuantity - beforeQuantity;
      changes.push({
        type: "item_quantity_decreased",
        item_key: key,
        label: itemLabel(afterItem),
        before: beforeQuantity,
        after: afterQuantity,
        quantity_delta: quantityDelta,
        amount_delta: Number((itemNetUnit(beforeItem) * quantityDelta).toFixed(2)),
      });
    }

    if (beforeItem && (
      comparable(beforeItem.discount_type) !== comparable(afterItem.discount_type)
      || Number(beforeItem.unit_discount || 0) !== Number(afterItem.unit_discount || 0)
    )) {
      changes.push({
        type: "item_discount_changed",
        item_key: key,
        label: itemLabel(afterItem),
        before: Number(beforeItem.unit_discount || 0),
        after: Number(afterItem.unit_discount || 0),
      });
    }
  }

  for (const [key, beforeItem] of beforeByKey) {
    if (afterByKey.has(key)) continue;
    const quantity = Number(beforeItem?.quantity || 0);
    changes.push({
      type: "item_removed",
      item_key: key,
      label: itemLabel(beforeItem),
      before: quantity,
      after: 0,
      quantity_delta: -quantity,
      amount_delta: Number((-itemNetUnit(beforeItem) * quantity).toFixed(2)),
    });
  }

  return changes;
}

export function buildDetailedActivityEvent({
  orgId,
  orderId,
  orderTable,
  eventType,
  category,
  actorId = null,
  actorKind,
  groupId = null,
  sourceSurface = "system",
  summary,
  reasonCode = null,
  reasonNote = null,
  changes = [],
  metadata = {},
  requestId = null,
  viewBucket = null,
  occurredAt,
}) {
  if (!orgId || !orderId) throw activityError("Activity event requires workspace and order");
  if (!ORDER_ACTIVITY_TABLES.includes(orderTable)) throw activityError("Invalid activity order table");
  if (!ORDER_ACTIVITY_EVENT_TYPES.includes(eventType)) throw activityError("Invalid activity event type");
  if (!ORDER_ACTIVITY_CATEGORIES.includes(category)) throw activityError("Invalid activity category");
  if (!ORDER_ACTIVITY_ACTOR_KINDS.includes(actorKind)) throw activityError("Invalid activity actor kind");
  if (actorKind === "user" && !actorId) throw activityError("User activity requires an actor");

  const safeMetadata = {};
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    for (const [key, value] of Object.entries(metadata)) {
      if (SAFE_METADATA_KEYS.has(key)) safeMetadata[key] = value;
    }
  }

  const event = {
    org_id: orgId,
    order_id: orderId,
    order_table: orderTable,
    event_type: eventType,
    category,
    actor_id: actorId || null,
    actor_kind: actorKind,
    group_id: normalizeActivityGroupId(groupId),
    source_surface: normalizeSourceSurface(sourceSurface),
    summary: cleanText(summary, 300) || eventType,
    reason_code: cleanText(reasonCode, 80),
    reason_note: cleanText(reasonNote, 1000),
    changes: Array.isArray(changes) ? changes : [],
    metadata: safeMetadata,
  };
  if (requestId) event.request_id = cleanText(requestId, 200);
  if (viewBucket) event.view_bucket = meaningfulViewBucket(viewBucket);
  if (occurredAt && Number.isFinite(new Date(occurredAt).getTime())) event.created_at = new Date(occurredAt).toISOString();
  return event;
}

export function groupActivityEvents(rows = []) {
  const ordered = [...rows].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const groups = new Map();
  for (const row of ordered) {
    const key = row.group_id || row.id;
    if (!groups.has(key)) {
      groups.set(key, {
        ...row,
        id: key,
        changes: Array.isArray(row.changes) ? [...row.changes] : [],
        change_count: Array.isArray(row.changes) ? row.changes.length : 0,
        event_ids: [row.id],
      });
      continue;
    }
    const group = groups.get(key);
    const rowChanges = Array.isArray(row.changes) ? row.changes : [];
    group.changes.push(...rowChanges);
    group.change_count += rowChanges.length;
    group.event_ids.push(row.id);
    group.summary = "Edited order";
    if (!group.reason_code && row.reason_code) group.reason_code = row.reason_code;
    if (!group.reason_note && row.reason_note) group.reason_note = row.reason_note;
  }
  return [...groups.values()];
}
