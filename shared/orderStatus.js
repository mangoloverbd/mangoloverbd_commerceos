// Operational status of an order, shared by the Orders page queues and the Home
// summary so both always count the same orders. Moved from src/lib/orderStatusFilters.ts.

const CANCELLED_STATES = new Set(["cancelled", "canceled", "rejected"]);
const DELIVERED_STATES = new Set(["delivered", "partial_delivered"]);
const TRANSIT_STATES = new Set([
  "in_transit",
  "dispatched",
  "on_the_way",
  "assigned_to_rider",
  "out_for_delivery",
  "ready_for_delivery",
  "on_the_way_to_delivery_hub",
]);
const HOLD_STATES = new Set(["hold", "on_hold"]);
const PROCESSING_STATES = new Set([
  "pending",
  "in_review",
  "pickup_requested",
  "processing",
  "picked_up",
]);
// Courier statuses that need someone to look: the parcel's state is unclear.
const COURIER_UNCLEAR_STATES = new Set([
  "unknown",
  "unknown_approval_pending",
  "cancelled_approval_pending",
  "error",
  "failed",
  "stale",
]);

function normalizeStatus(value) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isCancelledState(value) {
  return CANCELLED_STATES.has(value) || value.includes("return");
}

function isSteadfastOrder(order) {
  return order.sent_to_courier === true && (
    order.courier_name === "steadfast" ||
    (!order.courier_name && (order.courier_message || "").toLowerCase().includes("steadfast"))
  );
}

function isSteadfastTransitStatus(status) {
  return TRANSIT_STATES.has(status) ||
    status === "picked_up" ||
    status.includes("warehouse") ||
    status.includes("dispatch_id") ||
    status.includes("sent_to_") ||
    status.includes("received_at");
}

function isSteadfastProcessingStatus(status) {
  return !status ||
    PROCESSING_STATES.has(status) ||
    status.includes("consignment_created") ||
    status.includes("accepted") ||
    status.includes("received_by_sender");
}

const DAY_MS = 24 * 60 * 60 * 1000;
// A parcel is stuck when it has not moved for longer than this many days.
export const STUCK_PROCESSING_DAYS = 4;
export const STUCK_TRANSIT_DAYS = 5;

function daysSince(value, now) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? (now - time) / DAY_MS : null;
}

// Stuck: in Processing too long without moving, in transit too long without
// delivery, or a courier status nobody can act on. processing_at and
// courier_status_at are stamped by the database; when unknown, never stuck.
export function classifyOrderStatus(order, now = Date.now()) {
  const stage = classifyStage(order);
  if (stage === "processing" && daysSince(order.processing_at, now) > STUCK_PROCESSING_DAYS) return "stuck";
  if (stage === "in_transit" && daysSince(order.courier_status_at, now) > STUCK_TRANSIT_DAYS) return "stuck";
  return stage;
}

export function stuckReason(order, now = Date.now()) {
  const stage = classifyStage(order);
  // Steadfast's guide: "unknown" means it does not know either; ask its support.
  if (stage === "stuck") return "Steadfast doesn't know: ask Steadfast support";
  const days = daysSince(stage === "processing" ? order.processing_at : stage === "in_transit" ? order.courier_status_at : null, now);
  if (stage === "processing" && days > STUCK_PROCESSING_DAYS) return `No movement for ${Math.floor(days)} days`;
  if (stage === "in_transit" && days > STUCK_TRANSIT_DAYS) return `In transit for ${Math.floor(days)} days`;
  return null;
}

function classifyStage(order) {
  const business = normalizeStatus(order.status);
  const fulfillment = normalizeStatus(order.fulfillment_status);
  const courier = normalizeStatus(order.courier_status);
  const isExplicitSteadfastOrder = order.courier_name === "steadfast" && order.sent_to_courier === true;

  if ([business, fulfillment, courier].some(isCancelledState)) return "cancelled";
  if ([business, fulfillment, courier].some((value) => DELIVERED_STATES.has(value))) return "delivered";
  if (isSteadfastOrder(order)) {
    if (isExplicitSteadfastOrder && business === "print") return "print";
    if (COURIER_UNCLEAR_STATES.has(courier)) return "stuck";
    if ([business, fulfillment, courier].some((value) => HOLD_STATES.has(value))) return "on_hold";
    if (isSteadfastTransitStatus(courier)) return "in_transit";
    if (business === "processing" || isSteadfastProcessingStatus(courier)) {
      return "processing";
    }
  }

  if ([business, fulfillment, courier].some((value) => TRANSIT_STATES.has(value))) return "in_transit";
  if ([business, fulfillment, courier].some((value) => HOLD_STATES.has(value))) return "on_hold";

  if (business === "print") return "print";

  if (
    business === "processing" ||
    (order.sent_to_courier === true && (!courier || PROCESSING_STATES.has(courier)))
  ) {
    return "processing";
  }

  if (business === "ready_to_ship" || fulfillment === "ready_to_ship" || fulfillment === "fulfilled") {
    return "ready_to_ship";
  }

  if (business === "approved" || business === "confirmed") return "approved";
  return "pending";
}
