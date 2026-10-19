// Bulk status rules for POST /api/orders/bulk-status.
//
// These mirror the status checks in PATCH /api/orders/:id (and the client
// state machine in src/lib/orderTransitions.ts — keep all three in sync). The
// module is free of Express and Supabase so the rules can be tested directly.

import { buildAttributionPatch } from "./orderAttribution.js";
import { getOrderApprovalDetailsError } from "./orderApprovalDetails.js";

export const MAX_BULK_STATUS_ORDERS = 500;

export const BULK_STATUS_TARGETS = Object.freeze([
  "pending",
  "confirmed",
  "approved",
  "print",
  "processing",
  "on_hold",
  "cancelled",
]);

export function normalizeOrderStatus(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const isApproved = (status) => status === "approved" || status === "confirmed";
const isCancelled = (status) => status === "cancelled" || status === "canceled";
const isOnHold = (status) => status === "on_hold" || status === "hold";

export function bulkStatusTransitionError(order, targetStatus) {
  const from = normalizeOrderStatus(order?.status);
  const to = normalizeOrderStatus(targetStatus);
  if (from === to) return "Order already has this status";
  if (to === "print" && !isApproved(from)) return "Only Approved orders can move to Print";
  if (from === "print" && !(to === "processing" || isApproved(to) || isCancelled(to) || isOnHold(to))) {
    return "Print orders can only move to Processing, Approved, On Hold, or Cancelled";
  }
  if (isApproved(to) && !isApproved(from)) {
    const approvalError = getOrderApprovalDetailsError(order);
    if (approvalError) return approvalError.error;
  }
  return null;
}

export function buildBulkStatusPatch({ fromStatus, targetStatus, actorId, now, holdDetails = null, cancellationReason = null }) {
  const from = normalizeOrderStatus(fromStatus);
  const to = normalizeOrderStatus(targetStatus);
  const patch = { status: targetStatus };
  if (isOnHold(to) && holdDetails) Object.assign(patch, holdDetails);
  if (to === "cancelled" && from !== "cancelled") {
    patch.cancellation_reason_code = cancellationReason?.code ?? null;
    patch.cancellation_reason_note = cancellationReason?.note ?? null;
  } else if (from === "cancelled" && to !== "cancelled") {
    patch.cancellation_reason_code = null;
    patch.cancellation_reason_note = null;
  }
  Object.assign(patch, buildAttributionPatch({ fromStatus, toStatus: targetStatus, actorId, actorKind: "user", now }));
  patch.updated_at = now;
  return patch;
}

// Orders that share a stored status get the same patch, so each group becomes
// one UPDATE guarded by that status (a concurrent change makes the row miss).
export function planBulkStatusUpdate({ orders, orderIds, targetStatus, actorId, now, holdDetails = null, cancellationReason = null }) {
  const byId = new Map((orders || []).map((order) => [order.id, order]));
  const failures = [];
  const groups = new Map();
  for (const orderId of orderIds) {
    const order = byId.get(orderId);
    if (!order) {
      failures.push({ orderId, orderNumber: null, reason: "Order not found" });
      continue;
    }
    const reason = bulkStatusTransitionError(order, targetStatus);
    if (reason) {
      failures.push({ orderId, orderNumber: order.order_number || null, reason });
      continue;
    }
    const fromStatus = order.status ?? null;
    let group = groups.get(fromStatus);
    if (!group) {
      group = {
        fromStatus,
        ids: [],
        patch: buildBulkStatusPatch({ fromStatus, targetStatus, actorId, now, holdDetails, cancellationReason }),
      };
      groups.set(fromStatus, group);
    }
    group.ids.push(orderId);
  }
  return { groups: [...groups.values()], failures };
}
