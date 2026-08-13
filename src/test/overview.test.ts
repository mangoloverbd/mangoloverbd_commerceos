import { describe, expect, it } from "vitest";
import { buildOverviewData } from "../../server/overview.js";

describe("buildOverviewData", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");

  const orders = [
    { id: "1", created_at: "2026-08-12T10:00:00.000Z", price: "1000", delivery_rate: "60", product: "1 x Shirt", courier_status: "delivered", courier_name: "steadfast", phone: "01711111111", customer_name: "A" },
    { id: "2", created_at: "2026-08-12T14:00:00.000Z", price: "2000", delivery_rate: "60", product: "1 x Pants", courier_status: "pending", courier_name: "pathao", phone: "01722222222", customer_name: "B" },
    { id: "3", created_at: "2026-08-11T09:00:00.000Z", price: "500", delivery_rate: "60", product: "1 x Shirt", courier_status: "delivered", courier_name: "steadfast", phone: "01711111111", customer_name: "A" },
    { id: "4", created_at: "2026-08-10T11:00:00.000Z", price: "1500", delivery_rate: "60", product: "1 x Shoes", courier_status: "returned", courier_name: "pathao", phone: "01733333333", customer_name: "C" },
  ];

  const products = [
    { id: "p1", name: "Shirt", cog: "300", selling_price: "1000" },
    { id: "p2", name: "Pants", cog: "800", selling_price: "2000" },
    { id: "p3", name: "Shoes", cog: "600", selling_price: "1500" },
  ];

  const socialConversations = [
    { id: "c1", platform: "facebook", unread_count: 3, created_at: "2026-08-12T10:00:00.000Z" },
    { id: "c2", platform: "instagram", unread_count: 0, created_at: "2026-08-12T11:00:00.000Z" },
    { id: "c3", platform: "whatsapp", unread_count: 2, created_at: "2026-08-13T09:00:00.000Z" },
  ];

  it("computes KPIs correctly for a 2-day range", () => {
    const result = buildOverviewData(orders, products, socialConversations, [], {
      since: "2026-08-12",
      until: "2026-08-13",
      prevSince: "2026-08-10",
      prevUntil: "2026-08-11",
      now,
    });

    expect(result.kpis.totalOrders.value).toBe(2);
    expect(result.kpis.totalOrders.previousValue).toBe(2);
    expect(result.kpis.revenue.value).toBe(3120); // (1000+60) + (2000+60)
    expect(result.kpis.unreadMessages.value).toBe(5); // 3 + 0 + 2
  });

  it("computes courier performance grouped by courier name", () => {
    const result = buildOverviewData(orders, products, socialConversations, [], {
      since: "2026-08-10",
      until: "2026-08-13",
      prevSince: "2026-08-06",
      prevUntil: "2026-08-09",
      now,
    });

    expect(result.courierPerformance.steadfast.delivered).toBe(2);
    expect(result.courierPerformance.pathao.delivered).toBe(0);
    expect(result.courierPerformance.pathao.failed).toBe(1);
  });

  it("computes customer retention from repeat phone numbers", () => {
    const result = buildOverviewData(orders, products, socialConversations, [], {
      since: "2026-08-10",
      until: "2026-08-13",
      prevSince: "2026-08-06",
      prevUntil: "2026-08-09",
      now,
    });

    expect(result.customerRetention.totalCustomers).toBe(3);
    expect(result.customerRetention.repeatCustomers).toBe(1); // 01711111111 has 2 orders
    expect(result.customerRetention.repeatRate).toBeCloseTo(33.33, 1);
  });

  it("generates order volume series with current and previous period", () => {
    const result = buildOverviewData(orders, products, socialConversations, [], {
      since: "2026-08-12",
      until: "2026-08-13",
      prevSince: "2026-08-10",
      prevUntil: "2026-08-11",
      now,
    });

    expect(result.orderVolumeSeries.length).toBe(2);
    expect(result.orderVolumeSeries[0].date).toBe("2026-08-12");
    expect(result.orderVolumeSeries[0].current).toBe(2);
    expect(result.orderVolumeSeries[0].previous).toBe(1);
  });

  it("generates revenue series with cog, shipping, profit breakdown", () => {
    const result = buildOverviewData(orders, products, socialConversations, [], {
      since: "2026-08-12",
      until: "2026-08-13",
      prevSince: "2026-08-10",
      prevUntil: "2026-08-11",
      now,
    });

    const day1 = result.revenueSeries.find((d) => d.date === "2026-08-12");
    expect(day1).toBeDefined();
    expect(day1.revenue).toBe(3120);
    expect(day1.shipping).toBe(120);
    expect(day1.cog).toBe(1100); // 300 + 800
    expect(day1.profit).toBe(3120 - 1100 - 120);
  });

  it("computes social inbox stats by channel", () => {
    const result = buildOverviewData(orders, products, socialConversations, [], {
      since: "2026-08-12",
      until: "2026-08-13",
      prevSince: "2026-08-10",
      prevUntil: "2026-08-11",
      now,
    });

    expect(result.socialInbox.unread).toBe(5);
    expect(result.socialInbox.byChannel.facebook).toBe(1);
    expect(result.socialInbox.byChannel.whatsapp).toBe(1);
  });

  it("returns empty series when no orders match", () => {
    const result = buildOverviewData([], products, socialConversations, [], {
      since: "2026-08-12",
      until: "2026-08-13",
      prevSince: "2026-08-10",
      prevUntil: "2026-08-11",
      now,
    });

    expect(result.kpis.totalOrders.value).toBe(0);
    expect(result.orderVolumeSeries.every((d) => d.current === 0)).toBe(true);
  });
});
