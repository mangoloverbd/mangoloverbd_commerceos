import { describe, expect, it } from "vitest";
import {
  classifyOrderStatus,
  canShowConsignmentCopy,
  countOrdersByStatus,
  filterOrdersByStatus,
  stuckReason,
} from "@/lib/orderStatusFilters";

type TestOrder = {
  id: string;
  status: string;
  fulfillment_status?: string | null;
  courier_status?: string | null;
  courier_name?: string | null;
  sent_to_courier?: boolean | null;
  processing_at?: string | null;
  courier_status_at?: string | null;
  fraud_checked?: boolean | null;
  fraud_data?: {
    total_parcels: number;
    total_delivered: number;
    total_cancel: number;
  } | null;
};

function order(id: string, overrides: Partial<TestOrder> = {}): TestOrder {
  return {
    id,
    status: "pending",
    fulfillment_status: null,
    courier_status: null,
    courier_name: null,
    sent_to_courier: false,
    fraud_checked: false,
    fraud_data: null,
    ...overrides,
  };
}

describe("order status filters", () => {
  it.each([
    [order("cancelled", { status: "cancelled" }), "cancelled"],
    [order("returned", { status: "confirmed", courier_status: "Returned" }), "cancelled"],
    [order("delivered", { status: "confirmed", courier_status: "partial-delivered" }), "delivered"],
    [order("transit", { status: "confirmed", courier_status: "assigned to rider" }), "in_transit"],
    [order("hold", { status: "confirmed", courier_status: "hold" }), "on_hold"],
    [order("print", { status: "print" }), "print"],
    [order("print-sticky", { status: "print", fulfillment_status: "fulfilled" }), "print"],
    [order("print-cancelled", { status: "print", courier_status: "cancelled" }), "cancelled"],
    [order("print-delivered", { status: "print", courier_status: "delivered", sent_to_courier: true }), "delivered"],
    [order("print-risky", {
      status: "print",
      fraud_checked: true,
      fraud_data: { total_parcels: 10, total_delivered: 4, total_cancel: 6 },
    }), "print"],
    [order("processing", { status: "confirmed", sent_to_courier: true, courier_status: "Pickup Requested" }), "processing"],
    [order("steadfast-pending", { status: "print", sent_to_courier: true, courier_name: "steadfast", courier_status: "Pending" }), "print"],
    [order("steadfast-in-review", { status: "print", sent_to_courier: true, courier_name: "steadfast", courier_status: "In Review" }), "print"],
    [order("steadfast-pickup-requested", { status: "print", sent_to_courier: true, courier_name: "steadfast", courier_status: "Pickup Requested" }), "print"],
    [order("steadfast-warehouse-movement", { status: "print", sent_to_courier: true, courier_name: "steadfast", courier_status: "Consignment received at CHITTAGONG WAREHOUSE" }), "print"],
    [order("steadfast-destination-dispatch", { status: "print", sent_to_courier: true, courier_name: "steadfast", courier_status: "Consignment sent to HATHAZARI. Dispatch ID: 17332372" }), "print"],
    [order("steadfast-destination-received", { status: "print", sent_to_courier: true, courier_name: "steadfast", courier_status: "Consignment has been received at HATHAZARI" }), "print"],
    [order("steadfast-picked-up", { status: "print", sent_to_courier: true, courier_name: "steadfast", courier_status: "Picked Up" }), "print"],
    [order("steadfast-fraud", { status: "print", sent_to_courier: true, courier_name: "steadfast", courier_status: "Pending", fraud_checked: true, fraud_data: { total_parcels: 10, total_delivered: 4, total_cancel: 6 } }), "print"],
    [order("steadfast-exception", { status: "print", sent_to_courier: true, courier_name: "steadfast", courier_status: "Unknown Approval Pending" }), "print"],
    [order("legacy-steadfast-transit", { status: "print", sent_to_courier: true, courier_message: "Sent to Steadfast successfully", courier_status: "In Transit" }), "in_transit"],
    [order("ready", { status: "confirmed", fulfillment_status: "fulfilled" }), "ready_to_ship"],
    [order("explicit-ready", { status: "ready-to-ship" }), "ready_to_ship"],
    // A risky customer keeps its High Risk badge in its normal tab.
    [order("risky-customer", {
      fraud_checked: true,
      fraud_data: { total_parcels: 10, total_delivered: 4, total_cancel: 6 },
    }), "pending"],
    [order("approved", { status: "confirmed" }), "approved"],
    [order("pending"), "pending"],
  ] as const)("classifies $id into %s", (input, expected) => {
    expect(classifyOrderStatus(input)).toBe(expected);
  });

  it("lets a terminal courier state override an earlier business state", () => {
    expect(classifyOrderStatus(order("terminal", {
      status: "approved",
      fulfillment_status: "fulfilled",
      courier_status: "delivered",
      sent_to_courier: true,
    }))).toBe("delivered");
  });

  it("keeps a moving parcel In transit even for a risky customer", () => {
    expect(classifyOrderStatus(order("steadfast-transit-fraud", {
      status: "processing",
      sent_to_courier: true,
      courier_name: "steadfast",
      courier_status: "in_transit",
      fraud_checked: true,
      fraud_data: { total_parcels: 10, total_delivered: 4, total_cancel: 6 },
    }))).toBe("in_transit");
  });

  it("keeps Print until manual handoff, except for terminal courier outcomes", () => {
    expect(classifyOrderStatus(order("delivered", {
      status: "print",
      sent_to_courier: true,
      courier_name: "steadfast",
      courier_status: "Delivered",
    }))).toBe("delivered");

    expect(classifyOrderStatus(order("cancelled", {
      status: "print",
      sent_to_courier: true,
      courier_name: "steadfast",
      courier_status: "Cancelled",
    }))).toBe("cancelled");

    expect(classifyOrderStatus(order("returned", {
      status: "print",
      sent_to_courier: true,
      courier_name: "steadfast",
      courier_status: "Returned",
    }))).toBe("cancelled");

    expect(classifyOrderStatus(order("manual-processing", {
      status: "processing",
      sent_to_courier: true,
      courier_name: "steadfast",
      courier_status: "Pending",
    }))).toBe("processing");

    expect(classifyOrderStatus(order("manual-transit", {
      status: "processing",
      sent_to_courier: true,
      courier_name: "steadfast",
      courier_status: "Picked Up",
    }))).toBe("in_transit");

    expect(classifyOrderStatus(order("courier-unclear", {
      status: "processing",
      sent_to_courier: true,
      courier_name: "steadfast",
      courier_status: "Unknown Approval Pending",
    }))).toBe("stuck");
  });

  it("keeps non-Steadfast processing behavior unchanged", () => {
    expect(classifyOrderStatus(order("pathao-pending", { status: "print", sent_to_courier: true, courier_name: "pathao", courier_status: "Pending", fraud_checked: true, fraud_data: { total_parcels: 10, total_delivered: 4, total_cancel: 6 } }))).toBe("print");
  });

  it("counts every order once and keeps all equal to the bucket sum", () => {
    const orders = [
      order("1"),
      order("2", { status: "confirmed" }),
      order("3", { courier_status: "in_transit", sent_to_courier: true }),
      order("4", { status: "cancelled" }),
      order("5", { status: "confirmed", fulfillment_status: "fulfilled" }),
    ];

    expect(countOrdersByStatus(orders)).toEqual({
      all: 5,
      pending: 1,
      on_hold: 0,
      approved: 1,
      print: 0,
      processing: 0,
      ready_to_ship: 1,
      in_transit: 1,
      delivered: 0,
      stuck: 0,
      cancelled: 1,
    });
  });

  it("returns all orders for All Orders and only the selected bucket otherwise", () => {
    const orders = [
      order("pending"),
      order("delivered", { courier_status: "delivered", sent_to_courier: true }),
    ];

    expect(filterOrdersByStatus(orders, "all").map(({ id }) => id)).toEqual(["pending", "delivered"]);
    expect(filterOrdersByStatus(orders, "delivered").map(({ id }) => id)).toEqual(["delivered"]);
  });

  it("hides the extra consignment copy button in the Stuck tab", () => {
    expect(canShowConsignmentCopy(order("stuck", { status: "processing", sent_to_courier: true, courier_name: "steadfast", courier_status: "unknown" }))).toBe(false);
  });

  describe("stuck parcels", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");
    const daysAgo = (days: number) => new Date(now - days * 86400000).toISOString();
    const steadfast = (overrides: Partial<TestOrder>) =>
      order("parcel", { status: "processing", sent_to_courier: true, courier_name: "steadfast", courier_status: "in_review", ...overrides });

    it("is stuck after more than 4 days in Processing without moving", () => {
      expect(classifyOrderStatus(steadfast({ processing_at: daysAgo(4.1) }), now)).toBe("stuck");
      expect(classifyOrderStatus(steadfast({ processing_at: daysAgo(3.9) }), now)).toBe("processing");
      // Orders whose Processing date is unknown are never guessed stuck.
      expect(classifyOrderStatus(steadfast({ processing_at: null }), now)).toBe("processing");
      // Any courier, not only Steadfast.
      expect(classifyOrderStatus(order("pathao", { status: "processing", sent_to_courier: true, courier_name: "pathao", courier_status: "Pending", processing_at: daysAgo(5) }), now)).toBe("stuck");
    });

    it("is stuck after more than 5 days in transit without delivery", () => {
      expect(classifyOrderStatus(steadfast({ courier_status: "in_transit", processing_at: daysAgo(9), courier_status_at: daysAgo(5.1) }), now)).toBe("stuck");
      // Moving recently: not stuck, however long ago it entered Processing.
      expect(classifyOrderStatus(steadfast({ courier_status: "in_transit", processing_at: daysAgo(9), courier_status_at: daysAgo(4) }), now)).toBe("in_transit");
      expect(classifyOrderStatus(steadfast({ courier_status: "in_transit", courier_status_at: null }), now)).toBe("in_transit");
    });

    it("never marks delivered, cancelled, print or approved orders stuck", () => {
      expect(classifyOrderStatus(steadfast({ courier_status: "delivered", courier_status_at: daysAgo(30) }), now)).toBe("delivered");
      expect(classifyOrderStatus(steadfast({ status: "cancelled", processing_at: daysAgo(30) }), now)).toBe("cancelled");
      expect(classifyOrderStatus(steadfast({ status: "print", processing_at: daysAgo(30) }), now)).toBe("print");
      expect(classifyOrderStatus(order("approved", { status: "confirmed", processing_at: daysAgo(30) }), now)).toBe("approved");
    });

    it("says why a parcel is stuck", () => {
      expect(stuckReason(steadfast({ processing_at: daysAgo(4.5) }), now)).toBe("No movement for 4 days");
      expect(stuckReason(steadfast({ courier_status: "in_transit", courier_status_at: daysAgo(6) }), now)).toBe("In transit for 6 days");
      expect(stuckReason(steadfast({ courier_status: "Unknown Approval Pending" }), now)).toBe("Steadfast doesn't know: ask Steadfast support");
      expect(stuckReason(steadfast({ processing_at: daysAgo(3) }), now)).toBeNull();
    });
  });
});
