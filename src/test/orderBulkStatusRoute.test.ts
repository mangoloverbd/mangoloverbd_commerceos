import { describe, expect, it, vi } from "vitest";
import { database, foreignOrg, handlers, http, orgId, uuid } from "./campaignHandlerHarness";
import {
  BULK_STATUS_TARGETS,
  MAX_BULK_STATUS_ORDERS,
  bulkStatusTransitionError,
  planBulkStatusUpdate,
} from "../../server/orderBulkStatus.js";
import { buildStatusEvent } from "../../server/orderAttribution.js";
import {
  buildDetailedActivityEvent,
  buildOrderChanges,
  normalizeActivityGroupId,
  validateCancellationReason,
} from "../../server/orderActivity.js";
import { validateOrderHoldDetails } from "../../shared/orderHold.js";

const now = "2026-10-19T08:00:00.000Z";
const actorId = uuid(1);
const groupId = "6f1c2b9e-1d4a-4c7b-9a51-3e2f0c8d7b10";

function order(n: number, status: string | null, extra: Record<string, unknown> = {}) {
  return { id: uuid(n), org_id: orgId, order_number: `#${n}`, status, customer_name: "Customer", phone: "01712345678", address: "Dhaka", ...extra };
}

describe("bulk status rules", () => {
  it("mirrors the single-order Print state machine", () => {
    expect(bulkStatusTransitionError(order(1, "confirmed"), "print")).toBeNull();
    expect(bulkStatusTransitionError(order(1, "pending"), "print")).toBe("Only Approved orders can move to Print");
    expect(bulkStatusTransitionError(order(1, "print"), "processing")).toBeNull();
    expect(bulkStatusTransitionError(order(1, "print"), "pending")).toBe("Print orders can only move to Processing, Approved, On Hold, or Cancelled");
    expect(bulkStatusTransitionError(order(1, "print"), "print")).toBe("Order already has this status");
    expect(bulkStatusTransitionError(order(1, "pending", { address: "" }), "confirmed")).toBe("Add the delivery address before approving this order.");
  });

  it("groups orders by stored status so each group is one guarded update", () => {
    const { groups, failures } = planBulkStatusUpdate({
      orders: [order(1, "print"), order(2, "print"), order(3, "Print"), order(4, "processing")],
      orderIds: [uuid(1), uuid(2), uuid(3), uuid(4), uuid(5)],
      targetStatus: "processing",
      actorId,
      now,
    });
    expect(groups).toEqual([
      { fromStatus: "print", ids: [uuid(1), uuid(2)], patch: { status: "processing", updated_at: now } },
      { fromStatus: "Print", ids: [uuid(3)], patch: { status: "processing", updated_at: now } },
    ]);
    expect(failures).toEqual([
      { orderId: uuid(4), orderNumber: "#4", reason: "Order already has this status" },
      { orderId: uuid(5), orderNumber: null, reason: "Order not found" },
    ]);
  });

  it("stamps approval attribution, cancellation reasons and reopening like the single PATCH", () => {
    const approve = planBulkStatusUpdate({ orders: [order(1, "cancelled")], orderIds: [uuid(1)], targetStatus: "confirmed", actorId, now });
    expect(approve.groups[0].patch).toEqual({
      status: "confirmed",
      cancellation_reason_code: null,
      cancellation_reason_note: null,
      confirmed_by: actorId,
      confirmed_at: now,
      cancelled_by: null,
      cancelled_at: null,
      updated_at: now,
    });
    const cancel = planBulkStatusUpdate({
      orders: [order(1, "pending")], orderIds: [uuid(1)], targetStatus: "cancelled", actorId, now,
      cancellationReason: { code: "duplicate_order", note: null },
    });
    expect(cancel.groups[0].patch).toMatchObject({ status: "cancelled", cancellation_reason_code: "duplicate_order", cancelled_by: actorId, cancelled_at: now });
  });
});

function fixture(seedOrders: Record<string, unknown>[]) {
  const db = database({ orders: seedOrders, user_roles: [{ org_id: orgId, user_id: actorId, display_name: "Nadia" }] });
  // Like Supabase, return copies: the in-memory adapter otherwise hands back
  // the stored objects, so a later update would also rewrite the "before" rows.
  const sharedFrom = db.from;
  db.from = ((table: string) => {
    const query = sharedFrom(table);
    const then = query.then;
    query.then = (resolve, reject) => then((result) => resolve(structuredClone(result)), reject);
    return query;
  }) as typeof db.from;
  const labelOrderRiskAttempt = vi.fn(async () => {});
  const harness = handlers(db, {
    BULK_STATUS_TARGETS, MAX_BULK_STATUS_ORDERS, planBulkStatusUpdate,
    buildStatusEvent, buildDetailedActivityEvent, buildOrderChanges, normalizeActivityGroupId, validateCancellationReason,
    validateOrderHoldDetails, labelOrderRiskAttempt,
    getBangladeshDateKey: () => "2026-10-19",
  });
  harness.load([
    "errorMessage", "sendError", "delay", "normalizeBusinessStatus", "chunkIds", "isMissingDetailedActivityTable",
    "MAX_EVENT_INSERT_ATTEMPTS", "prepareStatusEvent", "buildOperationRequestId",
    "recordStatusEvent", "recordOrderActivity", "recordStatusEvents", "recordOrderActivities",
  ], ['app.post("/api/orders/bulk-status"']);
  return { ...harness, db, labelOrderRiskAttempt };
}

const callsOf = (db: ReturnType<typeof database>, table: string, method: string) =>
  db.calls.filter((call) => call.table === table && call.method === method);

describe("POST /api/orders/bulk-status", () => {
  it("moves many Print orders to Processing with one update and one insert per log", async () => {
    const seed = Array.from({ length: 40 }, (_, index) => order(index + 1, "print"));
    const { app, db, labelOrderRiskAttempt } = fixture([...seed, order(99, "print", { org_id: foreignOrg })]);
    const orderIds = [...seed.map((row) => row.id), uuid(99)];

    const result = await http(app, "POST", "/api/orders/bulk-status", { orderIds, status: "processing", activity_group_id: groupId });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ success: false, processed: 40, failed: 1 });
    expect(result.body.failures).toEqual([{ orderId: uuid(99), orderNumber: null, reason: "Order not found" }]);
    expect(result.body.updated).toHaveLength(40);
    expect(db.tables.orders.filter((row) => row.org_id === orgId).every((row) => row.status === "processing")).toBe(true);
    expect(db.tables.orders.find((row) => row.id === uuid(99))?.status).toBe("print");

    expect(callsOf(db, "orders", "update")).toHaveLength(1);
    expect(callsOf(db, "order_status_events", "insert")).toHaveLength(1);
    expect(callsOf(db, "order_activity_events", "insert")).toHaveLength(1);
    expect(callsOf(db, "user_roles", "select")).toHaveLength(1);
    expect(db.tables.order_status_events).toHaveLength(40);
    expect(db.tables.order_status_events[0]).toMatchObject({ org_id: orgId, from_status: "print", to_status: "processing", actor_id: actorId });
    expect(db.tables.order_activity_events).toHaveLength(40);
    expect(db.tables.order_activity_events[0]).toMatchObject({
      event_type: "order.status_changed",
      group_id: groupId,
      actor_display_name: "Nadia",
      summary: "Status changed to processing",
      request_id: `${groupId}:${uuid(1)}:bulk_status`,
    });
    expect(labelOrderRiskAttempt).toHaveBeenCalledTimes(40);
  });

  it("moves Approved orders to Print and reports the ones that cannot move", async () => {
    const { app, db } = fixture([order(1, "confirmed"), order(2, "approved"), order(3, "pending")]);

    const result = await http(app, "POST", "/api/orders/bulk-status", { orderIds: [uuid(1), uuid(2), uuid(3)], status: "print" });

    expect(result.status).toBe(200);
    expect(result.body.updated.map((row: { id: string }) => row.id).sort()).toEqual([uuid(1), uuid(2)]);
    expect(result.body.failures).toEqual([{ orderId: uuid(3), orderNumber: "#3", reason: "Only Approved orders can move to Print" }]);
    expect(db.tables.orders.map((row) => row.status)).toEqual(["print", "print", "pending"]);
    // "confirmed" and "approved" are different stored values, so two guarded updates.
    expect(callsOf(db, "orders", "update")).toHaveLength(2);
  });

  it("reports an order whose status changed after it was read instead of overwriting it", async () => {
    const { app, db } = fixture([order(1, "print"), order(2, "print")]);
    const originalFrom = db.from;
    // Simulate another staff member moving order 2 between the read and the write.
    db.from = ((table: string) => {
      const query = originalFrom(table);
      const update = query.update;
      query.update = (value: Record<string, unknown>) => {
        const row = db.tables.orders.find((candidate) => candidate.id === uuid(2));
        if (row) row.status = "cancelled";
        return update(value);
      };
      return query;
    }) as typeof db.from;

    const result = await http(app, "POST", "/api/orders/bulk-status", { orderIds: [uuid(1), uuid(2)], status: "processing" });

    expect(result.body.processed).toBe(1);
    expect(result.body.failures).toEqual([{ orderId: uuid(2), orderNumber: "#2", reason: "Order changed before it could be saved. Refresh and try again." }]);
    expect(db.tables.orders.find((row) => row.id === uuid(2))?.status).toBe("cancelled");
  });

  it("applies one validated hold reason to every order", async () => {
    const { app, db } = fixture([order(1, "pending"), order(2, "confirmed")]);

    const result = await http(app, "POST", "/api/orders/bulk-status", {
      orderIds: [uuid(1), uuid(2)], status: "on_hold", hold_reason_code: "advance_payment_pending", hold_reason_detail: null, hold_until_date: null,
    });

    expect(result).toMatchObject({ status: 200, body: { processed: 2 } });
    for (const row of db.tables.orders) {
      expect(row).toMatchObject({ status: "on_hold", hold_reason_code: "advance_payment_pending", hold_reason_detail: null, hold_until_date: null });
    }
    expect(db.tables.order_activity_events[0]).toMatchObject({ reason_code: "advance_payment_pending" });
  });

  it("rejects bad requests before touching any order", async () => {
    const { app, db } = fixture([order(1, "print")]);
    expect((await http(app, "POST", "/api/orders/bulk-status", { orderIds: [uuid(1)], status: "print" }, {})).status).toBe(401);
    const badBodies = [
      {},
      { orderIds: [], status: "print" },
      { orderIds: [""], status: "print" },
      { orderIds: [uuid(1)], status: "delivered" },
      { orderIds: Array.from({ length: MAX_BULK_STATUS_ORDERS + 1 }, (_, index) => uuid(index + 1)), status: "print" },
      { orderIds: [uuid(1)], status: "on_hold" },
      { orderIds: [uuid(1)], status: "processing", hold_reason_code: "other" },
      { orderIds: [uuid(1)], status: "cancelled" },
    ];
    for (const body of badBodies) {
      expect((await http(app, "POST", "/api/orders/bulk-status", body)).status).toBe(400);
    }
    expect(callsOf(db, "orders", "update")).toHaveLength(0);
    expect(db.tables.orders[0].status).toBe("print");
  });
});
