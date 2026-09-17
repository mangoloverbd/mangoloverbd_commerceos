export const ORDER_STATUS_FILTERS = [
  "all",
  "pending",
  "on_hold",
  "approved",
  "print",
  "processing",
  "ready_to_ship",
  "in_transit",
  "delivered",
  "flagged",
  "cancelled",
] as const;

export type OrderStatusFilter = (typeof ORDER_STATUS_FILTERS)[number];
export type OperationalOrderStatus = Exclude<OrderStatusFilter, "all">;

export interface StatusFilterOrder {
  status?: string | null;
  fulfillment_status?: string | null;
  courier_status?: string | null;
  courier_name?: string | null;
  sent_to_courier?: boolean | null;
  fraud_checked?: boolean | null;
  fraud_data?: {
    total_parcels?: number | null;
    total_delivered?: number | null;
    total_cancel?: number | null;
  } | null;
}

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
const STEADFAST_FLAGGED_STATES = new Set([
  "unknown",
  "unknown_approval_pending",
  "cancelled_approval_pending",
  "error",
  "failed",
  "stale",
]);

function normalizeStatus(value?: string | null) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isCancelledState(value: string) {
  return CANCELLED_STATES.has(value) || value.includes("return");
}

function isSteadfastOrder(order: StatusFilterOrder) {
  return order.sent_to_courier === true && (
    order.courier_name === "steadfast" ||
    (!order.courier_name && (order.courier_message || "").toLowerCase().includes("steadfast"))
  );
}

function isSteadfastTransitStatus(status: string) {
  return TRANSIT_STATES.has(status) ||
    status === "picked_up" ||
    status.includes("warehouse") ||
    status.includes("dispatch_id") ||
    status.includes("sent_to_") ||
    status.includes("received_at");
}

function isSteadfastProcessingStatus(status: string) {
  return !status ||
    PROCESSING_STATES.has(status) ||
    status.includes("consignment_created") ||
    status.includes("accepted") ||
    status.includes("received_by_sender");
}

function isFraudFlagged(order: StatusFilterOrder) {
  if (!order.fraud_checked || !order.fraud_data) return false;
  const total = Number(order.fraud_data.total_parcels) || 0;
  const delivered = Number(order.fraud_data.total_delivered) || 0;
  return total > 0 && delivered / total < 0.5;
}

export function classifyOrderStatus(order: StatusFilterOrder): OperationalOrderStatus {
  const business = normalizeStatus(order.status);
  const fulfillment = normalizeStatus(order.fulfillment_status);
  const courier = normalizeStatus(order.courier_status);
  const isExplicitSteadfastOrder = order.courier_name === "steadfast" && order.sent_to_courier === true;

  if ([business, fulfillment, courier].some(isCancelledState)) return "cancelled";
  if ([business, fulfillment, courier].some((value) => DELIVERED_STATES.has(value))) return "delivered";
  if (isSteadfastOrder(order)) {
    if (isExplicitSteadfastOrder && business === "print") return "print";
    if (business === "flagged" || STEADFAST_FLAGGED_STATES.has(courier) || isFraudFlagged(order)) {
      return "flagged";
    }
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

  if (business === "flagged" || isFraudFlagged(order)) return "flagged";
  if (business === "approved" || business === "confirmed") return "approved";
  return "pending";
}

export function filterOrdersByStatus<T extends StatusFilterOrder>(orders: T[], filter: OrderStatusFilter): T[] {
  if (filter === "all") return orders;
  return orders.filter((order) => classifyOrderStatus(order) === filter);
}

export function countOrdersByStatus(orders: StatusFilterOrder[]): Record<OrderStatusFilter, number> {
  const counts: Record<OrderStatusFilter, number> = {
    all: orders.length,
    pending: 0,
    on_hold: 0,
    approved: 0,
    print: 0,
    processing: 0,
    ready_to_ship: 0,
    in_transit: 0,
    delivered: 0,
    flagged: 0,
    cancelled: 0,
  };

  for (const order of orders) {
    counts[classifyOrderStatus(order)] += 1;
  }

  return counts;
}
