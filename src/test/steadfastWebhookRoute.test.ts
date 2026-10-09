import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { database, handlers, http, orgId, uuid } from "./campaignHandlerHarness";
import { planSteadfastDeliveryUpdate, steadfastCourierNote, verifySteadfastRequest } from "../../server/steadfastWebhook.js";
import { isDeliveryProblemNote } from "../../shared/orderStatus.js";

// The real /api/webhooks/steadfast handler, run against the in-memory database.
const secret = "shared-token_123";
const order = { id: uuid(60), org_id: orgId, consignment_id: "12345", sent_to_courier: true, courier_status: "in_review", status: "processing" };

function fixture(seed: Record<string, unknown> = {}) {
  const db = database({ orders: [{ ...order, ...seed }] });
  const activity = vi.fn(async () => {});
  const harness = handlers(db, {
    getOrgSettings: async () => ({ courier_webhook_secret: secret }),
    labelOrderRiskAttempt: async () => {}, recordStatusEvent: async () => {}, buildStatusEvent: () => ({}),
    recordOrderActivity: activity, buildDetailedActivityEvent: (event: unknown) => event,
    planSteadfastDeliveryUpdate, steadfastCourierNote, verifySteadfastRequest, isDeliveryProblemNote,
  });
  // Production keeps the raw body through express.json's verify hook.
  harness.app.use((req, _res, next) => { (req as typeof req & { rawBody: Buffer }).rawBody = Buffer.from(JSON.stringify(req.body)); next(); });
  harness.load([], ['app.post("/api/webhooks/steadfast"']);
  return { ...harness, db, activity };
}

const send = (app: Parameters<typeof http>[0], body: Record<string, unknown>, token = secret) => {
  const signature = createHmac("sha256", token).update(JSON.stringify(body)).digest("hex");
  return http(app, "POST", "/api/webhooks/steadfast", body, { authorization: `Bearer ${token}`, "x-signature": signature });
};
const event = (type: string, status?: string) => ({ notification_type: type, consignment_id: 12345, invoice: "INV-1", ...(status ? { status } : {}), tracking_message: "Rider is on the way" });

describe("Steadfast webhook route", () => {
  it("marks the parcel delivered without touching the team's order status or the tracking message", async () => {
    const { app, db, activity } = fixture();
    const result = await send(app, event("delivery_status", "delivered"));
    expect(result.status).toBe(200);
    // The team's manual status is left alone; the Orders page shows it as Delivered from the courier status.
    expect(db.tables.orders[0]).toMatchObject({ courier_status: "delivered", status: "processing" });
    expect(db.tables.orders[0]).not.toHaveProperty("fulfillment_status");
    expect(db.tables.orders[0]).not.toHaveProperty("courier_message");
    expect(activity).toHaveBeenCalledOnce();
  });

  it("marks a moving parcel in transit from a tracking update, but never undoes a delivery", async () => {
    const moving = fixture();
    expect((await send(moving.app, event("tracking_update"))).status).toBe(200);
    expect(moving.db.tables.orders[0]).toMatchObject({ courier_status: "in_transit", status: "processing" });
    expect(moving.db.tables.orders[0]).not.toHaveProperty("courier_message");
    const delivered = fixture({ courier_status: "delivered", status: "confirmed" });
    expect((await send(delivered.app, event("tracking_update"))).status).toBe(200);
    expect(delivered.db.tables.orders[0]).toMatchObject({ courier_status: "delivered", status: "confirmed" });
  });

  it("keeps the courier's latest note, even when the status itself does not change", async () => {
    const moving = fixture();
    expect((await send(moving.app, { ...event("tracking_update"), tracking_message: "  Customer not reachable  " })).status).toBe(200);
    expect(moving.db.tables.orders[0]).toMatchObject({ courier_status: "in_transit", courier_note: "Customer not reachable", status: "processing" });
    expect(typeof moving.db.tables.orders[0].courier_note_at).toBe("string");

    // Already delivered: the note is kept, the delivery is not undone, and no status change is logged.
    const delivered = fixture({ courier_status: "delivered", status: "processing" });
    expect((await send(delivered.app, { ...event("tracking_update"), tracking_message: "Rider complained: wrong address" })).status).toBe(200);
    expect(delivered.db.tables.orders[0]).toMatchObject({ courier_status: "delivered", courier_note: "Rider complained: wrong address" });
    expect(delivered.activity).not.toHaveBeenCalled();

    // The same note again changes nothing.
    const repeat = fixture({ courier_status: "in_transit", courier_note: "Customer not reachable" });
    expect((await send(repeat.app, { ...event("tracking_update"), tracking_message: "Customer not reachable" })).status).toBe(200);
    expect(repeat.db.calls.some(call => call.method === "update")).toBe(false);
  });

  it("keeps a rider's delivery problem for Follow up, and a routine step never clears it", async () => {
    const { app, db } = fixture({ courier_status: "in_transit" });
    expect((await send(app, { ...event("tracking_update"), tracking_message: 'Rider Note: "কাস্টমার ফোন রিসিভ করেনি"' })).status).toBe(200);
    expect(db.tables.orders[0]).toMatchObject({ courier_problem: 'Rider Note: "কাস্টমার ফোন রিসিভ করেনি"', courier_status: "in_transit", status: "processing" });
    expect(typeof db.tables.orders[0].courier_problem_at).toBe("string");
    expect((await send(app, { ...event("tracking_update"), tracking_message: "Consignment sent to SAVAR WAREHOUSE." })).status).toBe(200);
    expect(db.tables.orders[0]).toMatchObject({ courier_note: "Consignment sent to SAVAR WAREHOUSE.", courier_problem: 'Rider Note: "কাস্টমার ফোন রিসিভ করেনি"' });
  });

  it("acknowledges and ignores every other event", async () => {
    for (const type of ["consignment_update", "cancel_request", "return_request", "payment_request", "user_update"]) {
      const { app, db } = fixture({ courier_status: "delivered", status: "confirmed" });
      const result = await send(app, event(type, type === "cancel_request" ? "pending" : undefined));
      expect(result.status).toBe(200);
      expect(db.tables.orders[0]).toMatchObject({ courier_status: "delivered", status: "confirmed" });
      expect(db.calls.some(call => call.method === "update")).toBe(false);
    }
  });

  it("rejects a wrong token or a tampered body without changing the order", async () => {
    const { app, db } = fixture();
    expect((await send(app, event("delivery_status", "delivered"), "wrong-token")).status).toBe(401);
    const signature = createHmac("sha256", secret).update(JSON.stringify(event("delivery_status", "pending"))).digest("hex");
    expect((await http(app, "POST", "/api/webhooks/steadfast", event("delivery_status", "delivered"), { authorization: `Bearer ${secret}`, "x-signature": signature })).status).toBe(401);
    expect(db.tables.orders[0].courier_status).toBe("in_review");
  });

  it("does not let a late retry undo a delivery", async () => {
    const { app, db } = fixture({ courier_status: "delivered", status: "confirmed" });
    expect((await send(app, event("delivery_status", "pending"))).status).toBe(200);
    expect(db.tables.orders[0].courier_status).toBe("delivered");
  });

  it("answers 5xx when the database fails so Steadfast retries", async () => {
    const { app, db } = fixture();
    db.failures.orders = { message: "offline" };
    expect((await send(app, event("delivery_status", "delivered"))).status).toBe(500);
  });
});
