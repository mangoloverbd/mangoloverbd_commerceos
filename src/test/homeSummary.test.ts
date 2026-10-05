import { describe, expect, it } from "vitest";
import {
  buildHomeMetrics,
  homeWindows,
  orderRevenue,
  percentChange,
  rankAttentionCards,
  shortProductName,
  topProducts,
} from "../../server/homeSummary.js";

// 2026-10-06 10:30 in Dhaka (UTC+6).
const now = new Date("2026-10-06T04:30:00.000Z");

describe("home time windows", () => {
  it("compares today so far with yesterday up to the same time, in Dhaka", () => {
    expect(homeWindows(now)).toEqual({
      today: { since: "2026-10-05T18:00:00.000Z", until: "2026-10-06T04:30:00.000Z" },
      yesterday: { since: "2026-10-04T18:00:00.000Z", until: "2026-10-05T04:30:00.000Z" },
      hour: 10,
    });
  });
});

describe("home metrics", () => {
  it("counts revenue like Business Analytics: price plus delivery", () => {
    expect(orderRevenue({ price: "1450", delivery_rate: "80" })).toBe(1530);
    expect(orderRevenue({ price: null, delivery_rate: undefined })).toBe(0);
  });

  it("reports change against a positive baseline only", () => {
    expect(percentChange(118, 100)).toBe(18);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });

  it("builds sales, orders, sessions and conversion with hourly sparklines", () => {
    const windows = homeWindows(now);
    const orders = [
      { created_at: "2026-10-05T19:10:00.000Z", price: "1000", delivery_rate: "80" }, // today 01:10
      { created_at: "2026-10-06T03:59:00.000Z", price: "500", delivery_rate: "0" },   // today 09:59
      { created_at: "2026-10-04T20:00:00.000Z", price: "2000", delivery_rate: "100" }, // yesterday 02:00
      { created_at: "2026-10-05T05:00:00.000Z", price: "9999", delivery_rate: "0" },  // yesterday 11:00, after the cut-off
    ];
    const metrics = buildHomeMetrics({
      orders,
      windows,
      website: {
        today: { totals: { sessions: 200, ordered_sessions: 4 }, hourly: [{ hour: 1, sessions: 50 }, { hour: 9, sessions: 150 }] },
        yesterday: { totals: { sessions: 100, ordered_sessions: 4 }, hourly: [] },
      },
    });
    expect(metrics.sales).toMatchObject({ value: 1580, previous: 2100 });
    expect(metrics.orders).toMatchObject({ value: 2, previous: 1, change: 100 });
    expect(metrics.sessions).toMatchObject({ value: 200, previous: 100, change: 100 });
    expect(metrics.conversion_rate).toMatchObject({ value: 2, previous: 4, change: -50 });
    expect(metrics.sales.series).toHaveLength(11);
    expect(metrics.sales.series[1]).toBe(1080);
    expect(metrics.sessions.series[9]).toBe(150);
  });

  it("leaves website metrics empty when the report is unavailable", () => {
    const metrics = buildHomeMetrics({ orders: [], windows: homeWindows(now), website: null });
    expect(metrics.sessions).toBeNull();
    expect(metrics.conversion_rate).toBeNull();
    expect(metrics.orders).toMatchObject({ value: 0, change: null });
  });
});

describe("attention cards", () => {
  const signals = {
    flagged: { count: 2, rows: [] },
    protectionHolds: { count: 1 },
    readyForCourier: { count: 24, rows: [] },
    inboxUnread: { count: 0, rows: [] },
    toConfirm: { count: 6, rows: [] },
    inboxOrders: { count: 0 },
    abandoned: { count: 3, rows: [] },
    returnsPending: { count: 0 },
    topVarieties: [{ label: "Himsagar", value: 40 }],
    liveCities: [{ city: "Dhaka", count: 3 }],
  };

  it("shows the three most urgent cards that have something to do", () => {
    expect(rankAttentionCards(signals, { isAdmin: true }).map((card) => card.kind))
      .toEqual(["fraud_flags", "protection_holds", "ready_for_courier"]);
  });

  it("hides admin-only cards from team members", () => {
    expect(rankAttentionCards(signals, { isAdmin: false }).map((card) => card.kind))
      .toEqual(["fraud_flags", "ready_for_courier", "to_confirm"]);
  });

  it("fills quiet days with insights, then an all-clear card", () => {
    const quiet = { ...signals, flagged: { count: 0, rows: [] }, protectionHolds: { count: 0 }, readyForCourier: { count: 0, rows: [] }, toConfirm: { count: 0, rows: [] }, abandoned: { count: 0, rows: [] } };
    expect(rankAttentionCards(quiet, { isAdmin: true }).map((card) => card.kind))
      .toEqual(["top_varieties", "live_now", "all_clear"]);
    expect(rankAttentionCards({ ...quiet, topVarieties: [], liveCities: [] }, { isAdmin: true }).map((card) => card.kind))
      .toEqual(["all_clear"]);
  });

  it("links each card to the page that resolves it", () => {
    const [fraud, , courier] = rankAttentionCards(signals, { isAdmin: true });
    expect(fraud.cta).toEqual({ label: "Review flagged", to: "/orders", state: { fulfillmentTab: "flagged" } });
    expect(courier.cta).toEqual({ label: "Dispatch batch", to: "/orders", state: { fulfillmentTab: "approved" } });
    expect(courier.title).toBe("24 orders are ready for dispatch");
  });
});

describe("top products", () => {
  it("uses the English name and ranks by units sold", () => {
    expect(shortProductName("হোমমেড কুমড়ো বড়ি | Homemade Pumpkin Bori")).toBe("Homemade Pumpkin Bori");
    expect(shortProductName("Himsagar")).toBe("Himsagar");
    expect(topProducts([
      { product_name: "আম | Himsagar", quantity: 2 },
      { product_name: "Langra", quantity: 5 },
      { product_name: "Himsagar", quantity: 4 },
      { product_name: "", quantity: 9 },
    ])).toEqual([{ label: "Himsagar", value: 6 }, { label: "Langra", value: 5 }]);
  });
});
