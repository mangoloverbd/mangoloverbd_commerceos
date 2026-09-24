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
  "viewed",
  "edited",
  "assigned",
  "messaged",
  "fraud_checked",
  "courier_updated",
  "printed",
]);

export const ACTIVITY_LOG_PAGE_SIZE = 50;
export const ACTIVITY_LOG_MAX_FETCH = 1000;

export function activityFetchLimit(page) {
  return Math.min(ACTIVITY_LOG_MAX_FETCH, (Math.max(0, page) + 2) * ACTIVITY_LOG_PAGE_SIZE);
}

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
  if (event?.event_type) {
    if (event.event_type === "order.viewed") return "viewed";
    if (event.event_type === "order.edited") return "edited";
    if (event.event_type === "order.assigned") return "assigned";
    if (event.event_type.startsWith("message.")) return "messaged";
    if (event.event_type.startsWith("fraud.")) return "fraud_checked";
    if (event.event_type.startsWith("courier.")) return "courier_updated";
    if (event.event_type === "document.printed") return "printed";
    if (event.event_type === "order.created") return "created";
    if (event.event_type === "order.cancelled") return "cancelled";
    if (event.event_type === "order.reopened") return "reopened";
    if (event.event_type === "order.status_changed" && event.metadata?.to_status) {
      return classifyActivityEvent({
        order_table: event.order_table,
        from_status: event.metadata.from_status,
        to_status: event.metadata.to_status,
      });
    }
  }
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

export function filterLegacyActivityEvents(detailedEvents = [], legacyEvents = []) {
  const linkedLegacyIds = new Set(detailedEvents
    .map((event) => event?.metadata?.legacy_status_event_id)
    .filter(Boolean));
  const compatibilityDetailed = detailedEvents.filter((event) => !event?.metadata?.legacy_status_event_id);
  return legacyEvents.filter((legacyEvent) => {
    if (linkedLegacyIds.has(legacyEvent.id)) return false;
    const legacyAction = classifyActivityEvent(legacyEvent);
    return !compatibilityDetailed.some((detailedEvent) => (
      detailedEvent.order_table === legacyEvent.order_table
      && detailedEvent.order_id === legacyEvent.order_id
      && detailedEvent.actor_id === legacyEvent.actor_id
      && classifyActivityEvent(detailedEvent) === legacyAction
      && Math.abs(new Date(detailedEvent.created_at).getTime() - new Date(legacyEvent.created_at).getTime()) < 2000
    ));
  });
}

export function mergeActivityStreams(detailedEvents = [], legacyEvents = []) {
  return [...detailedEvents, ...filterLegacyActivityEvents(detailedEvents, legacyEvents)]
    .map((event) => ({ ...event, action: classifyActivityEvent(event) }))
    .sort((a, b) => {
      const timeDelta = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return timeDelta || String(b.id || "").localeCompare(String(a.id || ""));
    });
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
  const action = event.action || classifyActivityEvent(event);
  // Legacy status rows carry no summary; name the destination so the feed
  // does not show a bare "Status changed".
  const summary = event.summary || (action === "status_changed" && event.to_status ? `Status changed to ${event.to_status}` : null);
  return {
    id: event.id,
    occurred_at: event.created_at,
    action,
    order_table: event.order_table,
    order_id: event.order_id,
    order_label: reference?.label || null,
    order_value: reference?.value ?? null,
    actor_id: event.actor_id || null,
    actor_display_name: (event.actor_id && staffById?.get(event.actor_id)) || "Unknown",
    ...(summary ? { summary } : {}),
  };
}
