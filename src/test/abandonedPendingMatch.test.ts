import { describe, expect, it } from "vitest";
import { buildPendingOrdersByPhone, pendingOrdersForPhone } from "@/lib/abandonedPendingMatch";

const pending = (id: string, phone: string | null, order_number: string | null = `#${id}`) => ({
  id,
  order_number,
  phone,
  status: "pending",
  fulfillment_status: null,
});

describe("abandonedPendingMatch", () => {
  it("matches a pending order to a checkout phone in a different format", () => {
    const map = buildPendingOrdersByPhone([pending("o1", "+8801712345678", "1001")]);
    expect(pendingOrdersForPhone(map, "01712345678")).toEqual([{ id: "o1", order_number: "1001" }]);
  });

  it("ignores orders that are not in the Pending tab", () => {
    const map = buildPendingOrdersByPhone([
      { ...pending("a", "01712345678"), status: "approved" },
      { ...pending("h", "01712345678"), status: "on_hold" },
      { ...pending("d", "01712345678"), status: "delivered", fulfillment_status: "fulfilled" },
    ]);
    expect(pendingOrdersForPhone(map, "01712345678")).toEqual([]);
  });

  it("returns nothing for an invalid or missing phone", () => {
    const map = buildPendingOrdersByPhone([pending("o1", "01712345678"), pending("o2", "12345")]);
    expect(pendingOrdersForPhone(map, "12345")).toEqual([]);
    expect(pendingOrdersForPhone(map, null)).toEqual([]);
    expect(pendingOrdersForPhone(map, undefined)).toEqual([]);
  });

  it("returns every pending order for the same phone", () => {
    const map = buildPendingOrdersByPhone([pending("o1", "01712345678", "1001"), pending("o2", "8801712345678", "1002")]);
    expect(pendingOrdersForPhone(map, "01712345678")).toEqual([
      { id: "o1", order_number: "1001" },
      { id: "o2", order_number: "1002" },
    ]);
  });
});
