import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { planSteadfastDeliveryUpdate, planSteadfastStatusSync, verifySteadfastRequest } from "../../server/steadfastWebhook.js";

const delivery = (status: string, extra: Record<string, unknown> = {}) =>
  ({ notification_type: "delivery_status", consignment_id: 12345, status, tracking_message: "Delivered.", ...extra });

// Steadfast only moves an order to In transit, Delivered or Cancelled. The team's
// manual statuses (approved, print, processing) are never touched.
describe("Steadfast webhook: only in transit, delivered and cancelled", () => {
  it("marks a moving parcel in transit from a tracking update", () => {
    const tracking = { notification_type: "tracking_update", consignment_id: 12345, tracking_message: "Picked up" };
    expect(planSteadfastDeliveryUpdate(tracking, "in_review")).toEqual({ action: "update", patch: { courier_status: "in_transit" } });
    expect(planSteadfastDeliveryUpdate(tracking, "pending")).toEqual({ action: "update", patch: { courier_status: "in_transit" } });
    expect(planSteadfastDeliveryUpdate(tracking, "in_transit")).toEqual({ action: "ignore", reason: "unchanged" });
    expect(planSteadfastDeliveryUpdate({ ...tracking, consignment_id: undefined }, "pending")).toEqual({ action: "ignore", reason: "no_consignment" });
  });

  it("marks delivery on the courier status only, leaving the team's order status alone", () => {
    expect(planSteadfastDeliveryUpdate(delivery("Delivered"), "in_transit")).toEqual({ action: "update", patch: { courier_status: "delivered" } });
    expect(planSteadfastDeliveryUpdate(delivery("partial_delivered"), "in_review")).toEqual({ action: "update", patch: { courier_status: "partial_delivered" } });
  });

  it("cancels the order like a manual cancel", () => {
    expect(planSteadfastDeliveryUpdate(delivery("cancelled"), "in_transit")).toEqual({ action: "update", patch: { courier_status: "cancelled", status: "cancelled" } });
  });

  it("ignores every other status and event", () => {
    for (const status of ["pending", "unknown", "delivered_approval_pending", ""]) {
      expect(planSteadfastDeliveryUpdate(delivery(status), "in_review")).toEqual({ action: "ignore", reason: "not_tracked_status" });
    }
    for (const type of ["consignment_update", "cancel_request", "return_request", "payment_request", "user_update", "pickup_request", "return_list_accepted", undefined]) {
      expect(planSteadfastDeliveryUpdate({ ...delivery("delivered"), notification_type: type }, "pending")).toEqual({ action: "ignore", reason: "not_parcel_status" });
    }
    expect(planSteadfastDeliveryUpdate({ ...delivery("delivered"), consignment_id: undefined }, "pending")).toEqual({ action: "ignore", reason: "no_consignment" });
    expect(planSteadfastDeliveryUpdate(delivery("delivered"), "Delivered")).toEqual({ action: "ignore", reason: "unchanged" });
  });

  it("never steps back from a delivered, cancelled or returned order", () => {
    const tracking = { notification_type: "tracking_update", consignment_id: 12345 };
    for (const final of ["delivered", "partial_delivered", "cancelled", "returned"]) {
      expect(planSteadfastDeliveryUpdate(tracking, final)).toEqual({ action: "ignore", reason: "already_final" });
    }
    expect(planSteadfastDeliveryUpdate(delivery("cancelled"), "returned")).toEqual({ action: "ignore", reason: "already_final" });
    // A confirmed outcome can still be corrected by another confirmed outcome.
    expect(planSteadfastDeliveryUpdate(delivery("cancelled"), "delivered")).toEqual({ action: "update", patch: { courier_status: "cancelled", status: "cancelled" } });
  });
});

describe("Steadfast one-time catch-up from the status lookup", () => {
  it("applies only delivered and cancelled, by the same rules", () => {
    expect(planSteadfastStatusSync("delivered", "in_review")).toEqual({ action: "update", patch: { courier_status: "delivered" } });
    expect(planSteadfastStatusSync("Cancelled", "in_transit")).toEqual({ action: "update", patch: { courier_status: "cancelled", status: "cancelled" } });
  });

  it("ignores every other lookup answer, including the rider's unconfirmed reports", () => {
    for (const status of ["pending", "in_review", "hold", "exceptional", "unknown", "delivered_approval_pending", "partial_delivered_approval_pending",
      "cancelled_approval_pending", "unknown_approval_pending", "teleported", undefined]) {
      expect(planSteadfastStatusSync(status, "in_review")).toEqual({ action: "ignore", reason: "not_tracked_status" });
    }
    expect(planSteadfastStatusSync("delivered", "delivered")).toEqual({ action: "ignore", reason: "unchanged" });
    expect(planSteadfastStatusSync("cancelled", "returned")).toEqual({ action: "ignore", reason: "already_final" });
  });
});

describe("Steadfast webhook: request verification", () => {
  const secret = "shared-token_123";
  const raw = Buffer.from(JSON.stringify(delivery("delivered")));
  const sign = (body: Buffer, key = secret) => createHmac("sha256", key).update(body).digest("hex");

  it("accepts the shared token with a matching signature", () => {
    expect(verifySteadfastRequest({ secret, authorization: `Bearer ${secret}`, signature: sign(raw), rawBody: raw })).toBe(true);
  });

  it("rejects a wrong or missing token, and a signature that does not match the body", () => {
    expect(verifySteadfastRequest({ secret, authorization: "Bearer nope", signature: sign(raw), rawBody: raw })).toBe(false);
    expect(verifySteadfastRequest({ secret, authorization: undefined, signature: sign(raw), rawBody: raw })).toBe(false);
    expect(verifySteadfastRequest({ secret, authorization: `Bearer ${secret}`, signature: sign(raw, "other"), rawBody: raw })).toBe(false);
    expect(verifySteadfastRequest({ secret, authorization: `Bearer ${secret}`, signature: sign(Buffer.from("{}")), rawBody: raw })).toBe(false);
    expect(verifySteadfastRequest({ secret, authorization: `Bearer ${secret}`, signature: "short", rawBody: raw })).toBe(false);
  });

  it("requires the signature whenever the raw body is available", () => {
    expect(verifySteadfastRequest({ secret, authorization: `Bearer ${secret}`, signature: undefined, rawBody: raw })).toBe(false);
    // Without a raw body the signature cannot be computed; the shared token still has to match.
    expect(verifySteadfastRequest({ secret, authorization: `Bearer ${secret}`, signature: undefined, rawBody: undefined })).toBe(true);
  });

  it("refuses everything when no webhook secret is configured", () => {
    expect(verifySteadfastRequest({ secret: "", authorization: "Bearer ", signature: undefined, rawBody: raw })).toBe(false);
    expect(verifySteadfastRequest({ secret: undefined, authorization: undefined, signature: undefined, rawBody: raw })).toBe(false);
  });
});
