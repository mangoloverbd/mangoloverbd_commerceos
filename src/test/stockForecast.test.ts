import { describe, expect, it } from "vitest";
import { addDays, buildStockForecast, displayProductName, forecastOrders, suggestedOrder } from "../../server/stockForecast.js";

const now = new Date("2026-10-03T06:00:00Z"); // Saturday, 12:00 in Dhaka
const today = "2026-10-03";
const at = (day: string, hour = 10) => new Date(Date.parse(`${day}T00:00:00Z`) + (hour - 6) * 3600000).toISOString(); // Dhaka hour
const products = [
  { id: "katimon", name: "কাটিমন আম | Katimon Mango", slug: "katimon-mango", cog: null },
  { id: "honey", name: "Sundarbans Honey", slug: "sundarbans-honey", cog: 260 },
  { id: "kalojira", name: "Kalojira Mixed", slug: "kalojira-mixed", cog: null },
];
let seq = 0;
function order(day: string, items: Array<[string, number, number]>, extra: Record<string, unknown> = {}) {
  return { id: `o${++seq}`, created_at: at(day, 20), status: "pending", price: items.reduce((s, [, q, p]) => s + q * p, 0), courier_fee: 100,
    order_items: items.map(([product_id, quantity, unit_price]) => ({ product_id, quantity, unit_price })), ...extra };
}

describe("stock forecast rules", () => {
  it("shows the English part of bilingual product names", () => {
    expect(displayProductName("কাটিমন আম | Katimon Mango")).toBe("Katimon Mango");
    expect(displayProductName("Pure Ghee")).toBe("Pure Ghee");
  });

  it("forecasts each weekday from the last 8 weeks with a bounded trend", () => {
    const counts = new Map<string, number>();
    for (let i = 1; i <= 56; i++) counts.set(addDays(today, -i), new Date(`${addDays(today, -i)}T00:00:00Z`).getUTCDay() === 5 ? 30 : 10);
    const result = forecastOrders(counts, today);
    expect(result.history).toHaveLength(56);
    expect(result.history.at(-1)?.day).toBe("2026-10-02");
    expect(result.future[0]).toMatchObject({ day: today, orders: 10 });
    expect(result.future.find((row) => row.day === "2026-10-09")?.orders).toBe(30); // Friday
    counts.set("2026-10-02", 400); // one huge Friday
    expect(forecastOrders(counts, today).trend).toBe(1.15);
  });

  it("plans restock from the last 14 days, with lead time and safety stock", () => {
    const orders = [];
    for (let i = 1; i <= 14; i++) orders.push(order(addDays(today, -i), [["katimon", 38, 120]]));
    orders.push(order(addDays(today, -2), [["katimon", 500, 120]], { status: "cancelled" })); // ignored
    const result = buildStockForecast({ orders, products, variants: [{ product_id: "katimon", stock_quantity: 200 }, { product_id: "katimon", stock_quantity: 40 }], now });
    const katimon = result.restock.find((row) => row.product_id === "katimon")!;
    expect(katimon).toMatchObject({ name: "Katimon Mango", stock: 240, sold_per_day: 38, days_left: 6.3, runs_out: "2026-10-09", order_by: "2026-10-07", status: "urgent" });
    expect(suggestedOrder(katimon, 21)).toBe(748);
    expect(result.summary).toMatchObject({ restock_now: 1, first_runs_out: { name: "Katimon Mango", runs_out: "2026-10-09" } });
    expect(result.actions[0]).toMatchObject({ kind: "restock", severity: "urgent", order_qty: 748, order_by: "2026-10-07" });
  });

  it("flags slow stock and values it at cost price only where cost is known", () => {
    const orders = [order(addDays(today, -3), [["honey", 4, 900]]), order(addDays(today, -5), [["honey", 4, 900]])];
    const result = buildStockForecast({ orders, products, variants: [{ product_id: "honey", stock_quantity: 310 }, { product_id: "kalojira", stock_quantity: 140 }], now });
    expect(result.restock.find((row) => row.product_id === "honey")).toMatchObject({ status: "over" });
    expect(result.restock.find((row) => row.product_id === "kalojira")).toMatchObject({ status: "no_sales", days_left: null });
    expect(result.summary).toMatchObject({ slow_products: 2, slow_with_cost: 1, slow_stock_value: 310 * 260, missing_cost_products: 2 });
    expect(result.actions.some((action) => action.kind === "slow" && action.product_id === "honey")).toBe(true);
    expect(result.actions.at(-1)).toMatchObject({ kind: "cost_price", count: 2 });
  });

  it("works out delivered and returned rates, profit and page problems per product", () => {
    const orders = [];
    for (let i = 0; i < 8; i++) orders.push(order(addDays(today, -20), [["honey", 1, 1000]], { status: "delivered", courier_fee: 120 }));
    for (let i = 0; i < 2; i++) orders.push(order(addDays(today, -20), [["honey", 1, 1000]], { status: "returned", courier_fee: 120 }));
    for (let i = 0; i < 5; i++) orders.push(order(addDays(today, -20), [["katimon", 2, 600]], { courier_status: "delivered" }));
    for (let i = 0; i < 5; i++) orders.push(order(addDays(today, -20), [["katimon", 2, 600]], { status: "cancelled" }));
    const productViews = [
      { product_slug: "katimon-mango", views: 2000, sessions: 1500, orders: 15 },
      { product_slug: "sundarbans-honey", views: 600, sessions: 400, orders: 12 },
    ];
    const result = buildStockForecast({ orders, products, variants: [], productViews, now });
    expect(result.health_averages).toMatchObject({ order_rate: 1.4, delivered_rate: 65, returned_rate: 10 });
    expect(result.health.find((row) => row.product_id === "honey")).toMatchObject({ order_rate: 3, delivered_rate: 80, returned_rate: 20, verdict: "star" });
    expect(result.health.find((row) => row.product_id === "katimon")).toMatchObject({ order_rate: 1, delivered_rate: 50, verdict: "check_delivery" });
    // Honey: 8 delivered × ৳1,000, cost 8 × ৳260, courier on delivered and returned parcels (10 × ৳120).
    expect(result.profit.find((row) => row.product_id === "honey")).toMatchObject({ delivered_revenue: 8000, cost: 2080, courier: 1200, profit: 4720 });
    expect(result.profit.find((row) => row.product_id === "katimon")).toMatchObject({ delivered_revenue: 6000, cost: null, profit: null });
    expect(result.actions.some((action) => action.kind === "returns" && action.product_id === "honey")).toBe(true);
  });

  it("asks to fix a product page that many people view but few order", () => {
    const orders = [order(addDays(today, -4), [["kalojira", 1, 500]])];
    const productViews = [
      { product_slug: "kalojira-mixed", views: 2050, sessions: 1800, orders: 18 },
      { product_slug: "katimon-mango", views: 9000, sessions: 7000, orders: 210 },
    ];
    const result = buildStockForecast({ orders, products, variants: [], productViews, now });
    expect(result.health.find((row) => row.product_id === "kalojira")).toMatchObject({ order_rate: 1, verdict: "fix_page" });
    expect(result.actions.find((action) => action.kind === "fix_page")).toMatchObject({ product_id: "kalojira", order_rate: 1, average: 2.6 });
  });

  it("averages orders by Dhaka weekday and time of day over 8 weeks", () => {
    const orders = [
      { ...order("2026-10-02", [["honey", 1, 900]]), created_at: at("2026-10-02", 19) }, // Friday evening
      { ...order("2026-09-25", [["honey", 1, 900]]), created_at: at("2026-09-25", 19) },
      { ...order("2026-10-01", [["honey", 1, 900]]), created_at: at("2026-10-01", 1) }, // Thursday night (after midnight)
      { ...order(today, [["honey", 1, 900]]), created_at: at(today, 9) }, // today is not complete yet
    ];
    const result = buildStockForecast({ orders, products, variants: [], now });
    expect(result.rhythm.slots.map((slot) => slot.id)).toEqual(["morning", "afternoon", "evening", "night"]);
    expect(result.rhythm.values[5][2]).toBe(0.3); // 2 Friday evenings / 8 weeks
    expect(result.rhythm.values[4][3]).toBe(0.1);
    expect(result.rhythm.values[6][0]).toBe(0);
  });

  it("estimates next-30-day delivered money from matured orders only", () => {
    const orders = [];
    for (let i = 15; i < 56; i++) {
      orders.push(order(addDays(today, -i), [["honey", 1, 1000]], { status: i % 4 === 0 ? "returned" : "delivered" }));
    }
    const result = buildStockForecast({ orders, products, variants: [], now });
    // Orders 15+ days old only: the one placed 14.7 days ago is still settling.
    expect(result.summary.delivered_rate).toBe(75);
    expect(result.forecast.value_per_order).toBe(750);
    expect(result.summary.next30_delivered_value).toBeGreaterThan(0);
    expect(result.summary.next30_delivered_low).toBeLessThanOrEqual(result.summary.next30_delivered_value!);
  });
});
