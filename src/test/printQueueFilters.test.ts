import { describe, expect, it } from "vitest";
import {
  MIXED_KEY,
  UNKNOWN_KEY,
  countPrintFilterOptions,
  filterPrintOrders,
  printProductKey,
  printWeightKey,
} from "@/lib/printQueueFilters";

const BORI = "হোমমেড কুমড়ো বড়ি | Homemade Pumpkin Bori";
const ACHAR = "আমের আচার | Mango Achar";

const order = (id: string, items: { product_name: string; quantity?: number; weight_kg?: number | null }[], product: string | null = null) => ({
  id,
  order_number: `#${id}`,
  product,
  quantity: null,
  items: items.map((item) => ({ variant_name: null, quantity: 1, ...item })),
});

describe("printProductKey", () => {
  it("returns the product when every line is the same product", () => {
    expect(printProductKey(order("1", [{ product_name: BORI, weight_kg: 1 }, { product_name: BORI, weight_kg: 2 }]))).toBe(BORI);
  });

  it("returns mixed when the order has different products", () => {
    expect(printProductKey(order("2", [{ product_name: BORI }, { product_name: ACHAR }]))).toBe(MIXED_KEY);
  });

  it("falls back to the legacy product text", () => {
    expect(printProductKey(order("3", [], "2x Dried Mango"))).toBe("Dried Mango");
  });
});

describe("printWeightKey", () => {
  it("returns the pack weight when every line has the same weight", () => {
    expect(printWeightKey(order("1", [{ product_name: BORI, weight_kg: 1, quantity: 3 }, { product_name: ACHAR, weight_kg: 1 }]))).toBe("1");
  });

  it("returns mixed when the pack weights differ", () => {
    expect(printWeightKey(order("2", [{ product_name: BORI, weight_kg: 1 }, { product_name: BORI, weight_kg: 2 }]))).toBe(MIXED_KEY);
  });

  it("returns unknown when any line has no saved weight", () => {
    expect(printWeightKey(order("3", [{ product_name: BORI, weight_kg: null }]))).toBe(UNKNOWN_KEY);
    expect(printWeightKey(order("4", [{ product_name: BORI, weight_kg: 1 }, { product_name: ACHAR, weight_kg: null }]))).toBe(UNKNOWN_KEY);
  });
});

describe("filterPrintOrders + countPrintFilterOptions", () => {
  const orders = [
    order("a", [{ product_name: BORI, weight_kg: 1 }]),
    order("b", [{ product_name: BORI, weight_kg: 2 }]),
    order("c", [{ product_name: ACHAR, weight_kg: 1 }]),
    order("d", [{ product_name: BORI, weight_kg: 1 }, { product_name: ACHAR, weight_kg: 1 }]),
  ];

  it("keeps everything when both filters are all", () => {
    expect(filterPrintOrders(orders, { product: "all", weight: "all" })).toHaveLength(4);
  });

  it("combines product and weight", () => {
    expect(filterPrintOrders(orders, { product: BORI, weight: "1" }).map((o) => o.id)).toEqual(["a"]);
    expect(filterPrintOrders(orders, { product: MIXED_KEY, weight: "all" }).map((o) => o.id)).toEqual(["d"]);
  });

  it("counts each dropdown against the other dropdown's choice", () => {
    const counts = countPrintFilterOptions(orders, { product: BORI, weight: "all" });
    expect(counts.productTotal).toBe(4);
    expect(counts.products).toEqual([
      { key: BORI, label: BORI, count: 2 },
      { key: ACHAR, label: ACHAR, count: 1 },
      { key: MIXED_KEY, label: "Mixed products", count: 1 },
    ]);
    // Weight counts only look at Bori orders.
    expect(counts.weightTotal).toBe(2);
    expect(counts.weights).toEqual([
      { key: "1", label: "1 kg", count: 1 },
      { key: "2", label: "2 kg", count: 1 },
    ]);
  });

  it("labels grams and puts mixed and unknown last", () => {
    const counts = countPrintFilterOptions(
      [
        order("x", [{ product_name: BORI, weight_kg: 0.5 }]),
        order("y", [{ product_name: BORI, weight_kg: null }]),
        order("z", [{ product_name: BORI, weight_kg: 0.5 }, { product_name: BORI, weight_kg: 1 }]),
      ],
      { product: "all", weight: "all" },
    );
    expect(counts.weights.map((option) => option.label)).toEqual(["500 g", "Mixed weights", "Unknown weight"]);
  });
});
