import { describe, expect, it } from "vitest";
import {
  buildAttributionPatch,
  buildStatusEvent,
  isApprovedStatus,
  isCancelledStatus,
  normalizeAttributionStatus,
} from "../../server/orderAttribution.js";

const ACTOR = "11111111-1111-1111-1111-111111111111";
const NOW = "2026-09-18T10:00:00.000Z";

describe("normalizeAttributionStatus", () => {
  it("lowercases, trims, and collapses separators", () => {
    expect(normalizeAttributionStatus("  Partial Delivered ")).toBe("partial_delivered");
    expect(normalizeAttributionStatus("READY-TO-SHIP")).toBe("ready_to_ship");
  });

  it("maps null and undefined to an empty string", () => {
    expect(normalizeAttributionStatus(null)).toBe("");
    expect(normalizeAttributionStatus(undefined)).toBe("");
  });
});

describe("attribution status predicates", () => {
  it("treats approved and confirmed as the same business state", () => {
    expect(isApprovedStatus("approved")).toBe(true);
    expect(isApprovedStatus("confirmed")).toBe(true);
    expect(isApprovedStatus("pending")).toBe(false);
  });

  it("treats cancelled, canceled, and rejected as cancellation", () => {
    expect(isCancelledStatus("cancelled")).toBe(true);
    expect(isCancelledStatus("canceled")).toBe(true);
    expect(isCancelledStatus("rejected")).toBe(true);
    expect(isCancelledStatus("returned")).toBe(false);
  });
});

describe("buildAttributionPatch", () => {
  it("stamps the confirmer when a user approves a pending order", () => {
    expect(
      buildAttributionPatch({
        fromStatus: "pending",
        toStatus: "approved",
        actorId: ACTOR,
        actorKind: "user",
        now: NOW,
      }),
    ).toEqual({ confirmed_by: ACTOR, confirmed_at: NOW });
  });

  it("stamps the canceller and leaves the confirmer intact", () => {
    expect(
      buildAttributionPatch({
        fromStatus: "approved",
        toStatus: "cancelled",
        actorId: ACTOR,
        actorKind: "user",
        now: NOW,
      }),
    ).toEqual({ cancelled_by: ACTOR, cancelled_at: NOW });
  });

  it("clears the cancellation when a cancelled order is re-approved", () => {
    expect(
      buildAttributionPatch({
        fromStatus: "cancelled",
        toStatus: "approved",
        actorId: ACTOR,
        actorKind: "user",
        now: NOW,
      }),
    ).toEqual({
      confirmed_by: ACTOR,
      confirmed_at: NOW,
      cancelled_by: null,
      cancelled_at: null,
    });
  });

  it("does not restamp semantic aliases of the same status", () => {
    expect(
      buildAttributionPatch({
        fromStatus: "approved",
        toStatus: "confirmed",
        actorId: ACTOR,
        actorKind: "user",
        now: NOW,
      }),
    ).toEqual({});
    expect(
      buildAttributionPatch({
        fromStatus: "cancelled",
        toStatus: "rejected",
        actorId: ACTOR,
        actorKind: "user",
        now: NOW,
      }),
    ).toEqual({});
  });

  it("never attributes courier or system transitions", () => {
    for (const actorKind of ["courier_webhook", "system"]) {
      expect(
        buildAttributionPatch({
          fromStatus: "processing",
          toStatus: "confirmed",
          actorId: null,
          actorKind,
          now: NOW,
        }),
      ).toEqual({});
    }
  });

  it("refuses to stamp a user transition with no actor id", () => {
    expect(
      buildAttributionPatch({
        fromStatus: "pending",
        toStatus: "approved",
        actorId: null,
        actorKind: "user",
        now: NOW,
      }),
    ).toEqual({});
  });
});

describe("buildStatusEvent", () => {
  it("builds a workspace-scoped event row", () => {
    expect(
      buildStatusEvent({
        orgId: "org-1",
        orderId: "order-1",
        orderTable: "orders",
        fromStatus: "pending",
        toStatus: "approved",
        actorId: ACTOR,
        actorKind: "user",
      }),
    ).toEqual({
      org_id: "org-1",
      order_id: "order-1",
      order_table: "orders",
      from_status: "pending",
      to_status: "approved",
      actor_id: ACTOR,
      actor_kind: "user",
    });
  });

  it("logs courier transitions with a null actor", () => {
    expect(
      buildStatusEvent({
        orgId: "org-1",
        orderId: "order-1",
        orderTable: "orders",
        fromStatus: "processing",
        toStatus: "delivered",
        actorId: null,
        actorKind: "courier_webhook",
      }),
    ).toMatchObject({ actor_id: null, actor_kind: "courier_webhook" });
  });

  it("skips status aliases that do not change the business state", () => {
    expect(
      buildStatusEvent({
        orgId: "org-1",
        orderId: "order-1",
        orderTable: "orders",
        fromStatus: "approved",
        toStatus: "Confirmed",
        actorId: ACTOR,
        actorKind: "user",
      }),
    ).toBeNull();
  });

  it("rejects malformed event rows before they can reach the database", () => {
    expect(
      buildStatusEvent({
        orgId: "org-1",
        orderId: "order-1",
        orderTable: "invoices",
        fromStatus: "pending",
        toStatus: "approved",
        actorId: ACTOR,
        actorKind: "user",
      }),
    ).toBeNull();
    expect(
      buildStatusEvent({
        orgId: "org-1",
        orderId: "order-1",
        orderTable: "orders",
        fromStatus: "pending",
        toStatus: "approved",
        actorId: null,
        actorKind: "user",
      }),
    ).toBeNull();
  });

  it("records order creation with a null from_status", () => {
    expect(
      buildStatusEvent({
        orgId: "org-1",
        orderId: "order-1",
        orderTable: "orders",
        fromStatus: null,
        toStatus: "confirmed",
        actorId: ACTOR,
        actorKind: "user",
      }),
    ).toMatchObject({ from_status: null, to_status: "confirmed" });
  });
});
