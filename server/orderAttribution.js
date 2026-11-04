// Staff attribution rules for order status transitions.
//
// This module is intentionally free of Express, Supabase, and clock access.
// Route handlers supply the actor, workspace, and timestamp so the business
// rules can be tested independently from I/O.

export const ORDER_TABLES = Object.freeze(["orders", "social_inbox_orders", "abandoned_checkouts"]);

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

// Print is a fulfillment step after approval. Moving an order from Print back
// to Approved undoes that step; the order was already approved, so it is not
// a new approval and must not re-credit or double-count the approver.
const POST_APPROVAL_STATES = new Set(["print"]);

export function isApprovalTransition(fromStatus, toStatus) {
  if (!isApprovedStatus(toStatus)) return false;
  if (fromStatus === null || fromStatus === undefined) return true;
  const from = normalizeAttributionStatus(fromStatus);
  return !APPROVED_STATES.has(from) && !POST_APPROVAL_STATES.has(from);
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
//
// Approval credit is earned once per order: pass the order's current
// confirmed_by, and a re-approval (from any status) keeps the first approver.
export function buildAttributionPatch({ fromStatus, toStatus, actorId, actorKind, now, confirmedBy = null }) {
  if (actorKind !== "user" || !actorId) return {};

  const from = businessState(fromStatus);
  const to = businessState(toStatus);
  if (!to || from === to) return {};

  if (to === "approved") {
    const patch = {};
    if (isApprovalTransition(fromStatus, toStatus) && !confirmedBy) {
      patch.confirmed_by = actorId;
      patch.confirmed_at = now;
    }
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

// Each order's first approval status event (earliest created_at, then id),
// keyed by order id. Later re-approvals and Print → Approved returns are not
// in the map, so only the first approver earns credit.
export function firstApprovalByOrder(events) {
  const first = new Map();
  for (const event of events || []) {
    if (!event?.order_id || !event?.created_at) continue;
    if (!isApprovalTransition(event.from_status, event.to_status)) continue;
    const at = new Date(event.created_at).getTime();
    if (!Number.isFinite(at)) continue;
    const current = first.get(event.order_id);
    const currentAt = current ? new Date(current.created_at).getTime() : Infinity;
    if (at < currentAt || (at === currentAt && String(event.id) < String(current.id))) first.set(event.order_id, event);
  }
  return first;
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
