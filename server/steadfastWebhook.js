// Steadfast courier rules, shared by the webhook and the one-time catch-up
// script. Pure: callers supply the message and the order's current courier
// status, then apply the plan.
//
// Steadfast only moves an order to In transit, Delivered or Cancelled. The
// Orders page derives those tabs from courier_status (shared/orderStatus.js), so
// the team's manual order statuses (approved, print, processing) are never
// touched; only a cancellation also cancels the order, like a manual cancel.
// A `tracking_update` means the parcel is moving; a `delivery_status` carries
// the outcome. Every other status and event is acknowledged and ignored.
import { createHmac, timingSafeEqual } from "node:crypto";

const OUTCOMES = new Set(["delivered", "partial_delivered", "cancelled"]);
// "returned" is our own label; Steadfast reports those parcels as cancelled.
const FINAL_STATUSES = new Set([...OUTCOMES, "returned"]);

const MAX_NOTE_LENGTH = 500;

// The courier's free-text note on a parcel event, trimmed, or null.
export function steadfastCourierNote(payload) {
  const type = payload?.notification_type;
  if (type !== "delivery_status" && type !== "tracking_update") return null;
  const note = typeof payload.tracking_message === "string" ? payload.tracking_message.replace(/\s+/g, " ").trim() : "";
  return note ? note.slice(0, MAX_NOTE_LENGTH) : null;
}

export const isFinalCourierStatus = (status) => FINAL_STATUSES.has(normalize(status));

export function planSteadfastDeliveryUpdate(payload, currentCourierStatus) {
  const type = payload?.notification_type;
  if (type !== "delivery_status" && type !== "tracking_update") return { action: "ignore", reason: "not_parcel_status" };
  if (payload.consignment_id === undefined || payload.consignment_id === null || String(payload.consignment_id).trim() === "") {
    return { action: "ignore", reason: "no_consignment" };
  }
  return planStatus(type === "tracking_update" ? "in_transit" : payload.status, currentCourierStatus);
}

// The catch-up reads Steadfast's status lookup (status_by_cid), which reports a
// moving parcel as pending, so only its outcomes are applied.
export function planSteadfastStatusSync(status, currentCourierStatus) {
  const next = normalize(status);
  if (!OUTCOMES.has(next)) return { action: "ignore", reason: "not_tracked_status" };
  return planStatus(next, currentCourierStatus);
}

const normalize = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

function planStatus(status, currentCourierStatus) {
  const next = normalize(status);
  if (next !== "in_transit" && !OUTCOMES.has(next)) return { action: "ignore", reason: "not_tracked_status" };
  const current = normalize(currentCourierStatus);
  if (next === current) return { action: "ignore", reason: "unchanged" };
  // Steadfast retries a failed event after 30 seconds and 2 minutes, and a
  // tracking step can follow delivery, so never step back from an outcome.
  if (current === "returned" || (FINAL_STATUSES.has(current) && next === "in_transit")) return { action: "ignore", reason: "already_final" };
  if (next === "cancelled") return { action: "update", patch: { courier_status: next, status: "cancelled" } };
  return { action: "update", patch: { courier_status: next } };
}

const safeEqual = (given, expected) => {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
};

// Steadfast sends the shared token as a Bearer token and signs the raw body
// with it (X-Signature: hex HMAC-SHA256).
export function verifySteadfastRequest({ secret, authorization, signature, rawBody }) {
  if (!secret) return false;
  const header = typeof authorization === "string" ? authorization : "";
  if (!header.startsWith("Bearer ") || !safeEqual(header.slice(7), secret)) return false;
  if (!rawBody) return true;
  if (typeof signature !== "string" || !signature) return false;
  return safeEqual(signature.trim().toLowerCase(), createHmac("sha256", secret).update(rawBody).digest("hex"));
}
