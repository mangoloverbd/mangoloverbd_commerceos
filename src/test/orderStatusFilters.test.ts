import { describe, expect, it } from "vitest";
import {
  classifyOrderStatus,
  countOrdersByStatus,
  filterOrdersByStatus,
} from "@/lib/orderStatusFilters";

type TestOrder = {
  id: string;
  status: string;
  fulfillment_status?: string | null;
  courier_status?: string | null;
  sent_to_courier?: boolean | null;
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
    [order("processing", { status: "confirmed", sent_to_courier: true, courier_status: "Pickup Requested" }), "processing"],
    [order("ready", { status: "confirmed", fulfillment_status: "fulfilled" }), "ready_to_ship"],
    [order("explicit-ready", { status: "ready-to-ship" }), "ready_to_ship"],
    [order("flagged", {
      fraud_checked: true,
      fraud_data: { total_parcels: 10, total_delivered: 4, total_cancel: 6 },
    }), "flagged"],
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
      processing: 0,
      ready_to_ship: 1,
      in_transit: 1,
      delivered: 0,
      flagged: 0,
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
});
