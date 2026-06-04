import { describe, it, expect } from "vitest";
import {
  parseLineItems,
  buildCogLookup,
  computeOrderCogs,
} from "../../server/cog.js";

describe("parseLineItems", () => {
  it("parses a single line item", () => {
    expect(parseLineItems("1x T-Shirt")).toEqual([{ qty: 1, name: "T-Shirt" }]);
  });

  it("parses multiple comma-separated line items", () => {
    expect(parseLineItems("2x Mug, 1x Hat")).toEqual([
      { qty: 2, name: "Mug" },
      { qty: 1, name: "Hat" },
    ]);
  });

  it("trims whitespace around quantity, marker, and name", () => {
    expect(parseLineItems("  3x   T-Shirt Red  ")).toEqual([
      { qty: 3, name: "T-Shirt Red" },
    ]);
  });

  it("returns an empty list for null", () => {
    expect(parseLineItems(null)).toEqual([]);
  });

  it("returns an empty list for empty string", () => {
    expect(parseLineItems("")).toEqual([]);
  });

  it("returns an empty list for a string with no quantity marker", () => {
    expect(parseLineItems("plain text")).toEqual([]);
  });

  it("returns an empty list when the quantity is missing a name", () => {
    expect(parseLineItems("3x")).toEqual([]);
  });
});

describe("buildCogLookup", () => {
  it("builds a lookup keyed by trimmed lowercase product name", () => {
    const lookup = buildCogLookup([
      { name: "  T-Shirt ", cog: 200, selling_price: 1000 },
      { name: "Mug", cog: 50, selling_price: 250 },
    ]);
    expect(lookup.get("t-shirt")).toEqual({ cog: 200, selling_price: 1000 });
    expect(lookup.get("mug")).toEqual({ cog: 50, selling_price: 250 });
  });

  it("prefers the priced entry when two products share a name", () => {
    const lookup = buildCogLookup([
      { name: "T-Shirt", cog: 0, selling_price: 1000 },
      { name: "T-Shirt", cog: 250, selling_price: 1000 },
    ]);
    expect(lookup.get("t-shirt").cog).toBe(250);
  });

  it("returns an empty map for an empty product list", () => {
    expect(buildCogLookup([]).size).toBe(0);
  });

  it("skips products with no name", () => {
    const lookup = buildCogLookup([
      { name: "", cog: 100, selling_price: 500 },
      { name: null, cog: 100, selling_price: 500 },
      { name: "Hat", cog: 30, selling_price: 150 },
    ]);
    expect(lookup.size).toBe(1);
    expect(lookup.get("hat").cog).toBe(30);
  });
});

describe("computeOrderCogs", () => {
  const products = [
    { name: "T-Shirt", cog: 200, selling_price: 1000 },
    { name: "Mug", cog: 50, selling_price: 250 },
    { name: "Hat", cog: 0, selling_price: 400 },
  ];

  it("sums quantity times cog for each matched line item", () => {
    const result = computeOrderCogs(
      [{ id: "o1", product: "1x T-Shirt" }],
      products,
    );
    expect(result.totalCog).toBe(200);
    expect(result.coverage).toEqual({ set: 1, total: 1 });
    expect(result.cogByOrderId.get("o1")).toBe(200);
  });

  it("handles multiple line items within a single order", () => {
    const result = computeOrderCogs(
      [{ id: "o1", product: "2x T-Shirt, 1x Mug" }],
      products,
    );
    expect(result.totalCog).toBe(2 * 200 + 1 * 50);
    expect(result.coverage).toEqual({ set: 2, total: 2 });
    expect(result.cogByOrderId.get("o1")).toBe(2 * 200 + 1 * 50);
  });

  it("contributes 0 for an order whose product is not in the catalog", () => {
    const result = computeOrderCogs(
      [{ id: "o1", product: "1x Unknown Gadget" }],
      products,
    );
    expect(result.totalCog).toBe(0);
    expect(result.coverage).toEqual({ set: 0, total: 1 });
    expect(result.cogByOrderId.get("o1")).toBe(0);
  });

  it("contributes 0 for a product in the catalog with cog set to 0", () => {
    const result = computeOrderCogs(
      [{ id: "o1", product: "1x Hat" }],
      products,
    );
    expect(result.totalCog).toBe(0);
    expect(result.coverage).toEqual({ set: 0, total: 1 });
  });

  it("mixes priced and unpriced line items across orders", () => {
    const result = computeOrderCogs(
      [
        { id: "o1", product: "1x T-Shirt" },
        { id: "o2", product: "1x Hat" },
        { id: "o3", product: "1x Unknown" },
        { id: "o4", product: "2x Mug, 1x Unknown" },
      ],
      products,
    );
    expect(result.totalCog).toBe(200 + 0 + 0 + 2 * 50);
    expect(result.coverage).toEqual({ set: 2, total: 5 });
    expect(result.cogByOrderId.get("o1")).toBe(200);
    expect(result.cogByOrderId.get("o2")).toBe(0);
    expect(result.cogByOrderId.get("o3")).toBe(0);
    expect(result.cogByOrderId.get("o4")).toBe(100);
  });

  it("treats an order with no product string as zero COG and no coverage", () => {
    const result = computeOrderCogs(
      [{ id: "o1", product: null }, { id: "o2", product: "" }],
      products,
    );
    expect(result.totalCog).toBe(0);
    expect(result.coverage).toEqual({ set: 0, total: 0 });
    expect(result.cogByOrderId.get("o1")).toBe(0);
    expect(result.cogByOrderId.get("o2")).toBe(0);
  });

  it("matches product names case-insensitively", () => {
    const result = computeOrderCogs(
      [{ id: "o1", product: "1x t-shirt" }],
      products,
    );
    expect(result.totalCog).toBe(200);
    expect(result.coverage).toEqual({ set: 1, total: 1 });
  });

  it("returns zero totals for an empty order list", () => {
    const result = computeOrderCogs([], products);
    expect(result.totalCog).toBe(0);
    expect(result.coverage).toEqual({ set: 0, total: 0 });
    expect(result.cogByOrderId.size).toBe(0);
  });
});
