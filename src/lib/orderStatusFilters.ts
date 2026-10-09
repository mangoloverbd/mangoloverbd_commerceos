import { classifyOrderStatus as classifyOrderStatusShared, stuckReason as stuckReasonShared } from "../../shared/orderStatus.js";

export const ORDER_STATUS_FILTERS = [
  "all",
  "pending",
  "on_hold",
  "approved",
  "print",
  "processing",
  "ready_to_ship",
  "in_transit",
  "stuck",
  "delivered",
  "cancelled",
] as const;

export type OrderStatusFilter = (typeof ORDER_STATUS_FILTERS)[number];
export type OperationalOrderStatus = Exclude<OrderStatusFilter, "all">;

export interface StatusFilterOrder {
  status?: string | null;
  fulfillment_status?: string | null;
  courier_status?: string | null;
  courier_name?: string | null;
  courier_message?: string | null;
  sent_to_courier?: boolean | null;
  processing_at?: string | null;
  courier_status_at?: string | null;
  fraud_checked?: boolean | null;
  fraud_data?: {
    total_parcels?: number | null;
    total_delivered?: number | null;
    total_cancel?: number | null;
  } | null;
}

export function classifyOrderStatus(order: StatusFilterOrder, now: number = Date.now()): OperationalOrderStatus {
  return classifyOrderStatusShared(order, now) as OperationalOrderStatus;
}

export function stuckReason(order: StatusFilterOrder, now: number = Date.now()): string | null {
  return stuckReasonShared(order, now);
}

export function filterOrdersByStatus<T extends StatusFilterOrder>(orders: T[], filter: OrderStatusFilter): T[] {
  if (filter === "all") return orders;
  return orders.filter((order) => classifyOrderStatus(order) === filter);
}

/**
 * Queue tabs where the consignment copy affordance stays hidden — the
 * parcel is past the point where the team needs to grab the tracking ID.
 */
const CONSIGNMENT_COPY_HIDDEN_TABS: ReadonlySet<OperationalOrderStatus> = new Set([
  "in_transit",
  "delivered",
  "stuck",
  "cancelled",
]);

export function canShowConsignmentCopy(order: StatusFilterOrder): boolean {
  return !CONSIGNMENT_COPY_HIDDEN_TABS.has(classifyOrderStatus(order));
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
    stuck: 0,
    cancelled: 0,
  };

  for (const order of orders) {
    counts[classifyOrderStatus(order)] += 1;
  }

  return counts;
}
