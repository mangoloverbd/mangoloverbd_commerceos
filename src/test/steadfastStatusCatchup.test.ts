import { describe, expect, it, vi } from "vitest";
import { database, orgId, uuid } from "./campaignHandlerHarness";
import { parseCatchupArguments, runSteadfastStatusCatchup } from "../../scripts/steadfast-status-catchup.mjs";

const keys = [
  { key: `${orgId}:steadfast_api_key`, value: "api" },
  { key: `${orgId}:steadfast_secret_key`, value: "secret" },
];
const order = (n: number, courier_status: string | null, extra: Record<string, unknown> = {}) =>
  ({ id: uuid(n), org_id: orgId, sent_to_courier: true, consignment_id: String(1000 + n), courier_name: "steadfast", courier_status, status: "processing", ...extra });
const steadfast = (answers: Record<string, unknown>) => vi.fn(async (url: string) => {
  const answer = answers[url.split("/").pop()!];
  if (typeof answer === "number") return new Response("{}", { status: answer });
  return new Response(JSON.stringify({ status: 200, delivery_status: answer }), { status: 200 });
});
const quiet = { sleep: async () => {}, log: () => {} };

describe("Steadfast one-time status catch-up", () => {
  it("requires a workspace and previews unless --apply is passed", () => {
    expect(() => parseCatchupArguments([])).toThrow(/--org-id/);
    expect(parseCatchupArguments([`--org-id=${orgId}`])).toEqual({ orgId, apply: false });
    expect(parseCatchupArguments([`--org-id=${orgId}`, "--apply"])).toEqual({ orgId, apply: true });
  });

  it("previews the changes without writing anything", async () => {
    const db = database({ app_settings: keys, orders: [order(1, "in_review"), order(2, "in_review")] });
    const result = await runSteadfastStatusCatchup({ supabase: db, orgId, apply: false, fetchImpl: steadfast({ 1001: "delivered", 1002: "pending" }), ...quiet });
    expect(result).toMatchObject({ checked: 2, changes: { "in_review → delivered": 1 }, applied: 0, stopped: null });
    expect(db.tables.orders.map(row => row.courier_status)).toEqual(["in_review", "in_review"]);
  });

  it("applies only delivered and cancelled, skipping orders that are final or Pathao", async () => {
    const db = database({ app_settings: keys, orders: [
      order(1, "in_review", { status: "print" }), order(2, "delivered"), order(3, "in_transit"), order(4, "in_review", { courier_name: "pathao" }), order(5, "in_review"),
      order(6, "in_review"),
    ] });
    const fetchImpl = steadfast({ 1001: "delivered", 1003: "pending", 1005: "cancelled", 1006: "delivered_approval_pending" });
    const result = await runSteadfastStatusCatchup({ supabase: db, orgId, apply: true, fetchImpl, ...quiet });
    // Final and Pathao orders are never looked up.
    expect(fetchImpl.mock.calls.map(([url]) => String(url).split("/").pop())).toEqual(["1001", "1003", "1005", "1006"]);
    expect(result).toMatchObject({ checked: 4, applied: 2, stopped: null });
    // Delivery never touches the team's manual status; a cancellation cancels the order.
    expect(db.tables.orders.find(row => row.id === uuid(1))).toMatchObject({ courier_status: "delivered", status: "print" });
    expect(db.tables.orders.find(row => row.id === uuid(1))).not.toHaveProperty("fulfillment_status");
    expect(db.tables.orders.find(row => row.id === uuid(3))?.courier_status).toBe("in_transit");
    expect(db.tables.orders.find(row => row.id === uuid(5))).toMatchObject({ courier_status: "cancelled", status: "cancelled" });
    expect(db.tables.orders.find(row => row.id === uuid(6))).toMatchObject({ courier_status: "in_review", status: "processing" });
    expect(db.tables.order_activity_events).toHaveLength(2);
  });

  it("stops at the first refused lookup so Steadfast does not lock the keys out", async () => {
    const db = database({ app_settings: keys, orders: [order(1, "in_review"), order(2, "in_review"), order(3, "in_review")] });
    const fetchImpl = steadfast({ 1001: "delivered", 1002: 401, 1003: "delivered" });
    const result = await runSteadfastStatusCatchup({ supabase: db, orgId, apply: true, fetchImpl, ...quiet });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ checked: 1, applied: 1, stopped: "Steadfast answered 401" });
  });

  it("refuses to run without Steadfast keys", async () => {
    const db = database({ app_settings: [], orders: [order(1, "in_review")] });
    await expect(runSteadfastStatusCatchup({ supabase: db, orgId, apply: false, fetchImpl: steadfast({}), ...quiet })).rejects.toThrow(/Steadfast keys/);
  });
});
