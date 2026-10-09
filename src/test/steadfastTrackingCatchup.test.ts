import { describe, expect, it, vi } from "vitest";
import { database, orgId, uuid } from "./campaignHandlerHarness";
import { parseTrackingCatchupArguments, runSteadfastTrackingCatchup } from "../../scripts/steadfast-tracking-catchup.mjs";

const keys = [
  { key: `${orgId}:steadfast_api_key`, value: "api" },
  { key: `${orgId}:steadfast_secret_key`, value: "secret" },
];
const order = (n: number, courier_status: string | null, extra: Record<string, unknown> = {}) =>
  ({ id: uuid(n), org_id: orgId, order_number: `ML-${n}`, sent_to_courier: true, consignment_id: String(1000 + n), courier_name: "steadfast", courier_status, status: "processing", ...extra });
const step = (text: string, created_at: string) => ({ text, created_at });
const steadfast = (histories: Record<string, unknown>) => vi.fn(async (url: string) => {
  const answer = histories[decodeURIComponent(url.split("/").pop()!)];
  if (typeof answer === "number") return new Response("{}", { status: answer });
  return new Response(JSON.stringify({ status: 200, tracking: answer ?? [] }), { status: 200 });
});
const quiet = { sleep: async () => {}, log: () => {} };
const created = step("Consignment created by Sender(API).", "2026-10-01T08:00:00.000000Z");

describe("Steadfast one-time tracking catch-up", () => {
  it("requires a workspace and previews unless --apply is passed", () => {
    expect(() => parseTrackingCatchupArguments([])).toThrow(/--org-id/);
    expect(parseTrackingCatchupArguments([`--org-id=${orgId}`, "--apply"])).toEqual({ orgId, apply: true });
  });

  it("marks a parcel that is really moving In transit, dated by its first movement", async () => {
    const db = database({ app_settings: keys, orders: [order(1, "pending"), order(2, "in_review")] });
    const fetchImpl = steadfast({
      "ORD-ML-1": [created, step("Consignment sent to SAVAR WAREHOUSE.  Dispatch ID: 1", "2026-10-03T18:14:04.000000Z"), step("Assigned to rider.", "2026-10-05T09:00:00.000000Z")],
      "ORD-ML-2": [created, step("Consignment status has been updated as Pending", "2026-10-02T08:00:00.000000Z")],
    });
    const result = await runSteadfastTrackingCatchup({ supabase: db, orgId, apply: true, fetchImpl, ...quiet });
    expect(result).toMatchObject({ checked: 2, moving: 1, problems: 0, stopped: null });
    expect(db.tables.orders[0]).toMatchObject({ courier_status: "in_transit", courier_status_at: "2026-10-03T18:14:04.000000Z", status: "processing" });
    // Booked but not picked up yet: left alone.
    expect(db.tables.orders[1].courier_status).toBe("in_review");
  });

  it("records the latest delivery problem the rider reported", async () => {
    const db = database({ app_settings: keys, orders: [order(1, "in_transit")] });
    const fetchImpl = steadfast({ "ORD-ML-1": [created,
      step('Rider Note: "Phone richip kore na customer"', "2026-10-06T10:00:00.000000Z"),
      step('Delivery attempt failed: the receiver does not want the parcel. Rider note: "নেব না"', "2026-10-07T11:00:00.000000Z"),
      step("Consignment has been received at SAVAR WAREHOUSE.", "2026-10-08T09:00:00.000000Z")] });
    const result = await runSteadfastTrackingCatchup({ supabase: db, orgId, apply: true, fetchImpl, ...quiet });
    expect(result).toMatchObject({ moving: 0, problems: 1 });
    expect(db.tables.orders[0]).toMatchObject({
      courier_problem: 'Delivery attempt failed: the receiver does not want the parcel. Rider note: "নেব না"',
      courier_problem_at: "2026-10-07T11:00:00.000000Z", courier_status: "in_transit",
    });
  });

  it("leaves parcels on their way back, finished parcels and Pathao parcels alone, and previews without writing", async () => {
    const db = database({ app_settings: keys, orders: [
      order(1, "pending"), order(2, "delivered"), order(3, "pending", { courier_name: "pathao" }), order(4, "pending"),
    ] });
    const fetchImpl = steadfast({
      "ORD-ML-1": [created, step("Consignment sent to SAVAR WAREHOUSE.", "2026-10-03T18:14:04.000000Z"), step("Consignment has been listed for reversed back.", "2026-10-06T08:00:00.000000Z")],
      "ORD-ML-4": [created, step("Assigned to rider.", "2026-10-05T09:00:00.000000Z")],
    });
    const result = await runSteadfastTrackingCatchup({ supabase: db, orgId, apply: false, fetchImpl, ...quiet });
    expect(fetchImpl.mock.calls.map(([url]) => decodeURIComponent(String(url).split("/").pop()!))).toEqual(["ORD-ML-1", "ORD-ML-4"]);
    expect(result).toMatchObject({ checked: 2, moving: 1, applied: 0 });
    expect(db.tables.orders.map((row) => row.courier_status)).toEqual(["pending", "delivered", "pending", "pending"]);
  });

  it("stops at the first refused lookup so Steadfast does not lock the keys out", async () => {
    const db = database({ app_settings: keys, orders: [order(1, "pending"), order(2, "pending"), order(3, "pending")] });
    const fetchImpl = steadfast({ "ORD-ML-1": [created], "ORD-ML-2": 401 });
    const result = await runSteadfastTrackingCatchup({ supabase: db, orgId, apply: true, fetchImpl, ...quiet });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ checked: 1, stopped: "Steadfast answered 401" });
  });
});
