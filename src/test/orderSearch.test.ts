import { describe, expect, it } from "vitest";
import { matchesOrderSearch, type OrderSearchRecord } from "@/lib/orderSearch";

const order: OrderSearchRecord = {
  order_number: "ML-150000",
  customer_name: "Rahim Uddin",
  phone: "01712345678",
  consignment_id: 987654,
  tracking_code: "stead-abc",
};

describe("matchesOrderSearch", () => {
  it("matches customer name, phone, order number, consignment ID, and tracking code", () => {
    expect(matchesOrderSearch(order, "rahim")).toBe(true);
    expect(matchesOrderSearch(order, "01712")).toBe(true);
    expect(matchesOrderSearch(order, "ML-150000")).toBe(true);
    expect(matchesOrderSearch(order, "987654")).toBe(true);
    expect(matchesOrderSearch(order, "stead-abc")).toBe(true);
  });

  it("matches courier identifiers without case sensitivity or exact formatting", () => {
    expect(matchesOrderSearch(order, " STEAD-ABC ")).toBe(true);
    expect(matchesOrderSearch(order, "15000")).toBe(true);
  });

  it("returns false for a missing value and handles absent courier identifiers", () => {
    expect(matchesOrderSearch(order, "missing")).toBe(false);
    expect(
      matchesOrderSearch({ ...order, consignment_id: null, tracking_code: null }, "987654"),
    ).toBe(false);
  });

  it("matches every order when the query is empty", () => {
    expect(matchesOrderSearch(order, "")).toBe(true);
    expect(matchesOrderSearch(order, "   ")).toBe(true);
  });
});
