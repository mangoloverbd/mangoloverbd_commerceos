import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPackingSummary, buildPackingSummaryHtml } from "@/utils/packingSummaryPrinter";

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

  it("builds a printable packing sheet with tick boxes and exception ticks", () => {
    const summary = buildPackingSummary([
      {
        id: "o1", order_number: "#1041", product: null, quantity: null,
        items: [
          { product_name: "Katimon Mango", variant_name: "6KG", quantity: 1, weight_kg: 6 },
          { product_name: "Himsagar", variant_name: "5KG", quantity: 1, weight_kg: 5 },
        ],
      },
    ]);
    const html = buildPackingSummaryHtml(summary, "Mango Lover BD", "Sep 17, 2026");

    expect(html).toContain("@page { size: A4 portrait; margin: 0; }");
    expect(html).toContain("PACKING SUMMARY");
    expect(html).toContain("1 orders");
    expect(html).toContain("Katimon Mango");
    expect(html).toContain("6KG");
    expect(html).toContain("Multi-item orders");
    expect(html).toContain("#1041");
    expect(html.match(/class="tick"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("do not pack twice");
  });
});

describe("packing summary action wiring", () => {
  it("renders a Print-only packing summary button that prints the full queue", () => {
    const dashboardSource = readFileSync(resolve(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");

    expect(dashboardSource).toContain('data-testid="button-packing-summary"');
    expect(dashboardSource).toContain('activeOrderStatusFilter === "print"');
    expect(dashboardSource).toContain(
      'const { printPackingSummary } = await import("@/utils/packingSummaryPrinter");',
    );
    expect(dashboardSource).toContain("printPackingSummary(filteredOrders, orgName)");
    expect(dashboardSource).toContain("Failed to prepare packing summary for printing");
  });
});
