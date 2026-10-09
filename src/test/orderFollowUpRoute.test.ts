import { describe, expect, it, vi } from "vitest";
import { database, foreignOrg, handlers, http, orgId, uuid } from "./campaignHandlerHarness";
import { buildDetailedActivityEvent } from "../../server/orderActivity.js";

// The real POST /api/orders/follow-up handler, run against the in-memory database.
function fixture() {
  const db = database({ orders: [
    { id: uuid(1), org_id: orgId, status: "processing" },
    { id: uuid(2), org_id: orgId, status: "processing" },
    { id: uuid(3), org_id: foreignOrg, status: "processing" },
  ] });
  const activity = vi.fn(async (_supabase: unknown, _event: Record<string, unknown>) => ({ recorded: true }));
  const harness = handlers(db, {
    recordOrderActivity: activity, buildDetailedActivityEvent,
    sendError: (res: { status: (code: number) => { json: (body: unknown) => unknown } }, e: Error) => res.status(500).json({ error: e.message }),
  });
  harness.load(["FOLLOW_UP_NOTE_MAX", "FOLLOW_UP_BATCH_MAX", "ORDER_ID_RE"], ['app.post("/api/orders/follow-up"']);
  return { ...harness, db, activity };
}

describe("mark orders followed up", () => {
  it("records who followed up, when and the note, only for this workspace's orders", async () => {
    const { app, db, activity } = fixture();
    const result = await http(app, "POST", "/api/orders/follow-up", { order_ids: [uuid(1), uuid(3)], note: "  Customer will receive tomorrow  " });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ updated: 1 });
    expect(db.tables.orders[0]).toMatchObject({ followed_up_by: uuid(1), follow_up_note: "Customer will receive tomorrow" });
    expect(typeof db.tables.orders[0].followed_up_at).toBe("string");
    expect(db.tables.orders[1]).not.toHaveProperty("followed_up_at");
    expect(db.tables.orders[2]).not.toHaveProperty("followed_up_at");
    expect(activity).toHaveBeenCalledOnce();
    expect(activity.mock.calls[0][1]).toMatchObject({ order_id: uuid(1), event_type: "order.followed_up", summary: "Followed up: Customer will receive tomorrow" });
  });

  it("works without a note", async () => {
    const { app, db, activity } = fixture();
    expect((await http(app, "POST", "/api/orders/follow-up", { order_ids: [uuid(2)] })).status).toBe(200);
    expect(db.tables.orders[1]).toMatchObject({ follow_up_note: null });
    expect(activity.mock.calls[0][1]).toMatchObject({ summary: "Followed up" });
  });

  it("rejects signed-out requests and bad input", async () => {
    const { app } = fixture();
    expect((await http(app, "POST", "/api/orders/follow-up", { order_ids: [uuid(1)] }, {})).status).toBe(401);
    for (const body of [{}, { order_ids: [] }, { order_ids: ["not-an-id"] }, { order_ids: [uuid(1)], note: "x".repeat(301) }]) {
      expect((await http(app, "POST", "/api/orders/follow-up", body)).status).toBe(400);
    }
  });
});
