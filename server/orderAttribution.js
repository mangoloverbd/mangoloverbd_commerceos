// Staff attribution rules for order status transitions.
//
// This module is intentionally free of Express, Supabase, and clock access.
// Route handlers supply the actor, workspace, and timestamp so the business
// rules can be tested independently from I/O.

export const ORDER_TABLES = Object.freeze(["orders", "social_inbox_orders"]);

const ACTOR_KINDS = new Set(["user", "courier_webhook", "system"]);
const APPROVED_STATES = new Set(["approved", "confirmed"]);
const CANCELLED_STATES = new Set(["cancelled", "canceled", "rejected"]);

export function normalizeAttributionStatus(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function isApprovedStatus(status) {
  return APPROVED_STATES.has(normalizeAttributionStatus(status));
}

export function isCancelledStatus(status) {
  return CANCELLED_STATES.has(normalizeAttributionStatus(status));
}

function businessState(status) {
  const normalized = normalizeAttributionStatus(status);
  if (APPROVED_STATES.has(normalized)) return "approved";
  if (CANCELLED_STATES.has(normalized)) return "cancelled";
  return normalized;
}

// Returns only the attribution fields a user-owned transition should change.
// Courier and system writes can add audit events, but must never overwrite the
// staff member who actually approved or cancelled an order.
export function buildAttributionPatch({ fromStatus, toStatus, actorId, actorKind, now }) {
  if (actorKind !== "user" || !actorId) return {};

  const from = businessState(fromStatus);
  const to = businessState(toStatus);
  if (!to || from === to) return {};

  if (to === "approved") {
    const patch = { confirmed_by: actorId, confirmed_at: now };
    if (from === "cancelled") {
      patch.cancelled_by = null;
      patch.cancelled_at = null;
    }
    return patch;
  }

  if (to === "cancelled") {
    return { cancelled_by: actorId, cancelled_at: now };
  }

  return {};
}

// Returns an insertable audit row, or null when the supplied transition is not
// meaningful or does not meet the table's data contract.
export function buildStatusEvent({
  orgId,
  orderId,
  orderTable,
  fromStatus,
  toStatus,
  actorId,
  actorKind,
  occurredAt,
  includeEquivalentBusinessState = false,
}) {
  if (!orgId || !orderId || !ORDER_TABLES.includes(orderTable)) return null;
  if (!ACTOR_KINDS.has(actorKind)) return null;
  if (actorKind === "user" && !actorId) return null;

  const to = normalizeAttributionStatus(toStatus);
  if (!to) return null;

  const isCreation = fromStatus === null || fromStatus === undefined;
  const from = isCreation ? null : normalizeAttributionStatus(fromStatus);
  if (!isCreation && !includeEquivalentBusinessState && businessState(from) === businessState(to)) return null;

  const event = {
    org_id: orgId,
    order_id: orderId,
    order_table: orderTable,
    from_status: from,
    to_status: to,
    actor_id: actorId ?? null,
    actor_kind: actorKind,
  };
  if (typeof occurredAt === "string" && Number.isFinite(new Date(occurredAt).getTime())) {
    event.created_at = occurredAt;
  }
  return event;
}
