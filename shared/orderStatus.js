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

// Steadfast reports a failed delivery as "Delivery attempt failed: …" or a
// free-text "Rider Note: …" (Bangla or Banglish); riders only write notes when
// something went wrong, so either one is a delivery problem.
export function isDeliveryProblemNote(note) {
  return typeof note === "string" && /^(delivery attempt failed|rider note)\b/i.test(note.trim());
}

// The rider's own words when present, otherwise Steadfast's reason.
function problemText(note) {
  const text = String(note || "").trim();
  const rider = text.match(/rider note:\s*"?([^"]*)"?\s*$/i);
  if (rider && rider[1].trim()) return rider[1].trim();
  return text.replace(/^delivery attempt failed:\s*/i, "").replace(/\.$/, "");
}

const ACTIVE_STAGES = new Set(["processing", "in_transit"]);
// After someone follows up, the parcel leaves Follow up for this long.
export const FOLLOW_UP_SNOOZE_DAYS = 2;

// Why a parcel needs a follow-up, ignoring whether someone already followed up:
// a delivery problem the rider reported (until Steadfast confirms the outcome),
// in Processing too long without moving, in transit too long without delivery,
// or a status Steadfast itself does not know. processing_at and
// courier_status_at are stamped by the database; when unknown, never stuck.
function followUpNeed(order, stage, now) {
  if (ACTIVE_STAGES.has(stage) && order.courier_problem_at) {
    return { key: "delivery_problem", label: `Delivery problem: ${problemText(order.courier_problem)}`, since: order.courier_problem_at };
  }
  // Steadfast's guide: "unknown" means it does not know either; ask its support.
  if (stage === "stuck") {
    return { key: "courier_unknown", label: "Steadfast doesn't know: ask Steadfast support", since: order.courier_status_at || order.processing_at || null };
  }
  const days = daysSince(stage === "processing" ? order.processing_at : stage === "in_transit" ? order.courier_status_at : null, now);
  if (stage === "processing" && days > STUCK_PROCESSING_DAYS) {
    return { key: "no_movement", label: `No movement for ${Math.floor(days)} days`, since: order.processing_at };
  }
  if (stage === "in_transit" && days > STUCK_TRANSIT_DAYS) {
    return { key: "in_transit_long", label: `In transit for ${Math.floor(days)} days`, since: order.courier_status_at };
  }
  return null;
}

// Followed up recently, and the rider has reported nothing new since.
function followedUpRecently(order, now) {
  const days = daysSince(order.followed_up_at, now);
  if (days === null || days > FOLLOW_UP_SNOOZE_DAYS) return false;
  return !(order.courier_problem_at && Date.parse(order.courier_problem_at) > Date.parse(order.followed_up_at));
}

// The Follow up tab's reason, group and waiting time, or null when the parcel
// does not need a follow-up now.
export function followUpDetails(order, now = Date.now()) {
  const need = followUpNeed(order, classifyStage(order), now);
  return need && !followedUpRecently(order, now) ? need : null;
}

export function classifyOrderStatus(order, now = Date.now()) {
  const stage = classifyStage(order);
  const need = followUpNeed(order, stage, now);
  if (need && !followedUpRecently(order, now)) return "stuck";
  // A followed-up "unknown" parcel waits in Processing until it comes back.
  return stage === "stuck" ? "processing" : stage;
}

export function stuckReason(order, now = Date.now()) {
  return followUpDetails(order, now)?.label ?? null;
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
