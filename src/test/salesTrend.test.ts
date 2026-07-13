import { describe, expect, it } from "vitest";
import { buildSalesTrend } from "../../server/salesTrend.js";

describe("buildSalesTrend", () => {
  it("groups revenue by day and classifies repeat customers as existing", () => {
    const result = buildSalesTrend(
      [
        { created_at: "2026-06-01T09:00:00.000Z", phone: "01711111111", customer_name: "Ayesha", price: "1000" },
        { created_at: "2026-06-01T13:00:00.000Z", phone: "01722222222", customer_name: "Bashir", price: "500" },
        { created_at: "2026-06-02T10:00:00.000Z", phone: "01711111111", customer_name: "Ayesha", price: "700" },
        { created_at: "2026-06-02T15:00:00.000Z", phone: "01722222222", customer_name: "Bashir", price: "300" },
      ],
      { now: new Date("2026-06-03T00:00:00.000Z"), days: 3 }
    );

    expect(result.totalRevenue).toBe(2500);
    expect(result.days).toEqual([
      {
        date: "2026-06-01",
        totalRevenue: 1500,
        newCustomerRevenue: 1500,
        existingCustomerRevenue: 0,
        totalOrders: 2,
        newCustomerOrders: 2,
        existingCustomerOrders: 0,
        intensity: 4,
      },
      {
        date: "2026-06-02",
        totalRevenue: 1000,
        newCustomerRevenue: 0,
        existingCustomerRevenue: 1000,
        totalOrders: 2,
        newCustomerOrders: 0,
        existingCustomerOrders: 2,
        intensity: 3,
      },
      {
        date: "2026-06-03",
        totalRevenue: 0,
        newCustomerRevenue: 0,
        existingCustomerRevenue: 0,
        totalOrders: 0,
        newCustomerOrders: 0,
        existingCustomerOrders: 0,
        intensity: 0,
      },
    ]);
  });

  it("uses older orders as customer history for the visible trend window", () => {
    const result = buildSalesTrend(
      [
        { created_at: "2026-05-15T09:00:00.000Z", phone: "01733333333", customer_name: "Chaya", price: "900" },
        { created_at: "2026-06-02T10:00:00.000Z", phone: "01733333333", customer_name: "Chaya", price: "600" },
      ],
      { now: new Date("2026-06-03T00:00:00.000Z"), days: 3 }
    );

    expect(result.days[1]).toMatchObject({
      date: "2026-06-02",
      newCustomerRevenue: 0,
      existingCustomerRevenue: 600,
      newCustomerOrders: 0,
      existingCustomerOrders: 1,
    });
  });

  it("does not classify same-name customers with different phones as existing", () => {
    const result = buildSalesTrend(
      [
        { created_at: "2026-06-01T09:00:00.000Z", phone: "01711111111", customer_name: "Rahim", price: "1000" },
        { created_at: "2026-06-02T09:00:00.000Z", phone: "01722222222", customer_name: "Rahim", price: "800" },
      ],
      { now: new Date("2026-06-02T00:00:00.000Z"), days: 2 }
    );

    expect(result.days[1]).toMatchObject({
      date: "2026-06-02",
      newCustomerRevenue: 800,
      existingCustomerRevenue: 0,
      newCustomerOrders: 1,
      existingCustomerOrders: 0,
    });
  });

  it("normalizes Bangladeshi phones before classifying repeat customers", () => {
    const result = buildSalesTrend(
      [
        { created_at: "2026-06-01T09:00:00.000Z", phone: "+880 1712-345678", customer_name: "Nadia", price: "1000" },
        { created_at: "2026-06-02T09:00:00.000Z", phone: "01712-345678", customer_name: "Nadia R.", price: "800" },
      ],
      { now: new Date("2026-06-02T00:00:00.000Z"), days: 2 }
    );

    expect(result.days[1]).toMatchObject({
      date: "2026-06-02",
      newCustomerRevenue: 0,
      existingCustomerRevenue: 800,
      newCustomerOrders: 0,
      existingCustomerOrders: 1,
    });
  });
});
