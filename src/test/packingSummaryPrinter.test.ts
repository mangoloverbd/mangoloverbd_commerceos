import { describe, expect, it } from "vitest";
import { buildPackingSummary } from "@/utils/packingSummaryPrinter";

describe("buildPackingSummary", () => {
  it("groups by product and pack with order counts and kg totals", () => {
    const summary = buildPackingSummary([
      {
        id: "o1", order_number: "#1", product: null, quantity: null,
        items: [{ product_name: "কাটিমন আম | Katimon Mango", variant_name: "6KG", quantity: 1, weight_kg: 6 }],
      },
      {
        id: "o2", order_number: "#2", product: null, quantity: null,
        items: [
          { product_name: "কাটিমন আম | Katimon Mango", variant_name: "6KG", quantity: 2, weight_kg: 6 },
          { product_name: "হিমসাগর | Himsagar", variant_name: "5KG", quantity: 1, weight_kg: 5 },
        ],
      },
    ]);

    expect(summary.totalOrders).toBe(2);
    const sixKg = summary.rows.find((row) => row.pack === "6KG");
    expect(sixKg).toMatchObject({ orderCount: 2, totalKg: 18 });
    expect(summary.exceptions.map((entry) => entry.orderNumber)).toEqual(["#2"]);
  });

  it("renders unknown weight as null and falls back to legacy product text", () => {
    const summary = buildPackingSummary([
      {
        id: "o3", order_number: "#3", product: "2x Dried Mango", quantity: 2,
        items: [],
      },
    ]);

    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0]).toMatchObject({ product: "Dried Mango", pack: "—", orderCount: 1, totalKg: null });
    expect(summary.hasUnknownWeight).toBe(true);
  });
});
