// Staff Activity Log — reads the order_status_events audit trail (written by
// server/orderAttribution.js call sites) and turns it into a human-readable
// feed: who confirmed, cancelled, contacted, or dismissed which order.
//
// This module is intentionally free of Express and Supabase access so the
// classification and filter-parsing rules stay unit-testable without a
// database.

import { isApprovedStatus, isCancelledStatus } from "./orderAttribution.js";

export const ACTIVITY_ORDER_TABLES = Object.freeze(["orders", "social_inbox_orders", "abandoned_checkouts"]);

export const ACTIVITY_ACTIONS = Object.freeze([
  "created",
  "confirmed",
  "cancelled",
  "status_changed",
  "contacted",
  "reopened",
  "dismissed",
  "converted",
  "expired",
]);

export const ACTIVITY_LOG_PAGE_SIZE = 50;

function invalidActivityRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

// Maps a raw order_status_events row to one of ACTIVITY_ACTIONS. Regular
// orders and social inbox orders share the confirm/cancel vocabulary already
// used by buildAttributionPatch; abandoned checkouts use their own status
// machine (open/contacted/dismissed/recovered/expired).
export function classifyActivityEvent(event) {
  const table = event?.order_table;
  const toStatus = event?.to_status;
  const isCreation = event?.from_status === null || event?.from_status === undefined;

  if (table === "abandoned_checkouts") {
    if (toStatus === "contacted") return "contacted";
    if (toStatus === "dismissed") return "dismissed";
    if (toStatus === "open") return "reopened";
    if (toStatus === "recovered") return "converted";
    if (toStatus === "expired") return "expired";
    return "status_changed";
  }

  if (isCreation) return "created";
  if (isApprovedStatus(toStatus)) return "confirmed";
  if (isCancelledStatus(toStatus)) return "cancelled";
  return "status_changed";
}

export function resolveActivityTableFilter(value) {
  if (value === undefined || value === null || value === "" || value === "all") return "all";
  if (typeof value !== "string" || !ACTIVITY_ORDER_TABLES.includes(value)) {
    throw invalidActivityRequest("Invalid table filter");
  }
  return value;
}

export function resolveActivityActionFilter(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw invalidActivityRequest("Invalid action filter");
  const actions = [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];
  if (actions.length === 0) return null;
  if (actions.some((action) => !ACTIVITY_ACTIONS.includes(action))) {
    throw invalidActivityRequest("Invalid action filter");
  }
  return actions;
}

export function resolveActivityPage(value) {
  const page = Number.parseInt(value, 10);
  return Number.isInteger(page) && page > 0 ? page : 0;
}

export function orderReferenceKey(orderTable, orderId) {
  return `${orderTable}:${orderId}`;
}

// Turns the per-table order rows fetched by the route into a single lookup
// keyed by "<order_table>:<order_id>", so buildActivityLogEntry can stay
// table-agnostic.
export function buildOrderLookup({ orders, socialInboxOrders, abandonedCheckouts }) {
  const lookup = new Map();
  for (const order of orders || []) {
    if (!order?.id) continue;
    lookup.set(orderReferenceKey("orders", order.id), {
      label: order.order_number ? `Order #${order.order_number}` : (order.customer_name || "Order"),
      value: order.price ?? null,
    });
  }
  for (const order of socialInboxOrders || []) {
    if (!order?.id) continue;
    lookup.set(orderReferenceKey("social_inbox_orders", order.id), {
      label: order.contact_name || "Inbox order",
      value: order.total_price ?? null,
    });
  }
  for (const checkout of abandonedCheckouts || []) {
    if (!checkout?.id) continue;
    lookup.set(orderReferenceKey("abandoned_checkouts", checkout.id), {
      label: checkout.customer_name || "Abandoned cart",
      value: checkout.total ?? null,
    });
  }
  return lookup;
}

// Pure formatter: one order_status_events row + the lookups the route
// assembled -> one feed entry ready for the client.
export function buildActivityLogEntry(event, { orderLookup, staffById }) {
  const reference = orderLookup?.get(orderReferenceKey(event.order_table, event.order_id)) || null;
  return {
    id: event.id,
    occurred_at: event.created_at,
    action: event.action || classifyActivityEvent(event),
    order_table: event.order_table,
    order_id: event.order_id,
    order_label: reference?.label || null,
    order_value: reference?.value ?? null,
    actor_id: event.actor_id || null,
    actor_display_name: (event.actor_id && staffById?.get(event.actor_id)) || "Unknown",
  };
}
