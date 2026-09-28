import { describe, expect, it } from "vitest";
import type { BusinessReportSource, Metrics, ProductWeight } from "@/components/business-report/types";
import {
  buildProductOutcomeRows,
  buildSourceRows,
  groupSourceMix,
  maxIndex,
  percentChange,
  pointChange,
  rate,
  sortSourceRows,
} from "@/lib/businessReportMetrics";

function metrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    intake_count: 0, order_value: 0, approved_count: 0, approved_value: 0, cancelled_count: 0, cancelled_value: 0,
    returned_count: 0, returned_value: 0, pending_count: 0, pending_value: 0, delivery_charged: 0,
    courier_fees_recorded: 0, net_delivery_position: 0, courier_fee_order_count: 0, order_kg: 0, approved_kg: 0,
    cancelled_kg: 0, returned_kg: 0, pending_kg: 0, weight_order_count: 0, ...overrides,
  };
}

function source(key: string, label: string, overrides: Partial<Metrics>): BusinessReportSource {
  return { source: key, label, products: [], landing_pages: [], ...metrics(overrides) };
}

function product(name: string, overrides: Partial<ProductWeight>): ProductWeight {
  return {
    product_id: name, product_name: name, packs: 0, kg: 0, approved_packs: 0, approved_kg: 0, cancelled_packs: 0,
    cancelled_kg: 0, returned_packs: 0, returned_kg: 0, pending_packs: 0, pending_kg: 0, order_count: 0, ...overrides,
  };
}

const website = source("website", "Website", {
  intake_count: 100, order_value: 100000, approved_count: 85, cancelled_value: 5000, returned_value: 3000,
  approved_value: 88000, pending_value: 4000, order_kg: 250, net_delivery_position: 1500,
});
const facebook = source("facebook", "Facebook", {
  intake_count: 100, order_value: 80000, approved_count: 65, cancelled_value: 12000, returned_value: 6000,
  approved_value: 58000, pending_value: 4000, order_kg: 200, net_delivery_position: -500,
});
const summary = metrics({
  intake_count: 200, order_value: 180000, approved_count: 150, cancelled_value: 17000, returned_value: 9000,
});

describe("rate helpers", () => {
  it("returns 0 for a zero denominator", () => {
    expect(rate(5, 0)).toBe(0);
    expect(rate(1, 4)).toBe(25);
  });

  it("returns null percent change without a positive baseline", () => {
    expect(percentChange(110, 100)).toBeCloseTo(10);
    expect(percentChange(5, 0)).toBeNull();
  });

  it("returns the difference in percentage points", () => {
    expect(pointChange(80, 75)).toBe(5);
  });
});

describe("buildSourceRows", () => {
  it("derives rates and flags sources more than 3 points worse than the average", () => {
    const [web, fb] = buildSourceRows([website, facebook], summary);

    expect(web).toMatchObject({ key: "website", label: "Website", orders: 100, value: 100000, approvalRate: 85, lossRate: 8, aov: 1000, kg: 250, netPerOrder: 15 });
    expect(web.share).toBeCloseTo(55.56, 1);
    expect(web.flags).toEqual({ approval: false, loss: false });
    expect(fb).toMatchObject({ approvalRate: 65, lossRate: 22.5, netPerOrder: -5 });
    expect(fb.flags).toEqual({ approval: true, loss: true });
    expect(fb.mix).toEqual({ approved: 58000, pending: 4000, cancelled: 12000, returned: 6000 });
  });
});

describe("sortSourceRows", () => {
  it("sorts by a numeric key in either direction and by label alphabetically", () => {
    const rows = buildSourceRows([website, facebook], summary);
    expect(sortSourceRows(rows, "lossRate", -1).map((row) => row.key)).toEqual(["facebook", "website"]);
    expect(sortSourceRows(rows, "lossRate", 1).map((row) => row.key)).toEqual(["website", "facebook"]);
    expect(sortSourceRows(rows, "label", 1).map((row) => row.key)).toEqual(["facebook", "website"]);
  });
});

describe("groupSourceMix", () => {
  it("keeps the top slices by value and folds the rest into Other", () => {
    const sources = [
      source("a", "A", { order_value: 50 }), source("b", "B", { order_value: 40 }), source("c", "C", { order_value: 30 }),
      source("d", "D", { order_value: 20 }), source("e", "E", { order_value: 7 }), source("f", "F", { order_value: 3 }),
    ];
    expect(groupSourceMix(sources, 4)).toEqual([
      { label: "A", value: 50 }, { label: "B", value: 40 }, { label: "C", value: 30 }, { label: "D", value: 20 }, { label: "Other", value: 10 },
    ]);
    expect(groupSourceMix(sources.slice(0, 2), 4)).toHaveLength(2);
  });
});

describe("buildProductOutcomeRows", () => {
  it("builds per-product outcome kg with loss rate, a total row and loss flags", () => {
    const table = buildProductOutcomeRows([
      product("Himsagar", { kg: 100, packs: 20, approved_kg: 90, pending_kg: 4, cancelled_kg: 4, returned_kg: 2 }),
      product("Fazli", { kg: 50, packs: 10, approved_kg: 35, pending_kg: 3, cancelled_kg: 8, returned_kg: 4 }),
    ]);

    expect(table.rows.map((row) => [row.name, row.lossRate, row.flagged])).toEqual([
      ["Himsagar", 6, false],
      ["Fazli", 24, true],
    ]);
    expect(table.total).toMatchObject({ name: "All products", kg: 150, packs: 30, approvedKg: 125, cancelledKg: 12, returnedKg: 6, lossRate: 12, flagged: false });
  });

  it("does not flag products with no recorded weight", () => {
    const table = buildProductOutcomeRows([product("Langra", { packs: 3, approved_packs: 3 })]);
    expect(table.rows[0]).toMatchObject({ kg: 0, lossRate: 0, flagged: false, packs: 3 });
  });
});

describe("maxIndex", () => {
  it("returns the index of the largest value, or -1 when all are zero", () => {
    expect(maxIndex([3, 9, 2])).toBe(1);
    expect(maxIndex([0, 0])).toBe(-1);
  });
});
