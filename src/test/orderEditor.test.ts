import { describe, expect, it } from "vitest";
import {
  calculateCartTotals,
  calculateUnitDiscount,
  matchesCatalogSearch,
  upsertCartItem,
  type CatalogProduct,
  type OrderEditorItem,
} from "@/lib/orderEditor";

const mango: CatalogProduct = {
  id: "product-1",
  name: "Premium Mango",
  slug: "premium-mango",
  selling_price: 480,
  stock_quantity: 8,
  weight_kg: 1,
  image_url: "https://cdn.example/mango.jpg",
  images: [],
  variants: [
    {
      id: "variant-1",
      product_id: "product-1",
      attributes: { size: "Family Box" },
      price_adjustment: 20,
      stock_quantity: 3,
      weight_kg: 1.5,
    },
  ],
};

const item: OrderEditorItem = {
  id: "item-1",
  product_id: "product-1",
  variant_id: null,
  product_name: "Premium Mango",
  variant_name: null,
  product_slug: "premium-mango",
  image_url: null,
  weight_kg: 1,
  available_stock: 8,
  unit_price: 480,
  discount_type: "fixed",
  discount_value: 30,
  unit_discount: 30,
  quantity: 2,
};

describe("order editor math", () => {
  it("calculates fixed and percentage unit discounts with taka rounding", () => {
    expect(calculateUnitDiscount(480, "fixed", 30)).toBe(30);
    expect(calculateUnitDiscount(480, "percentage", 10)).toBe(48);
    expect(calculateUnitDiscount(99.99, "percentage", 12.5)).toBe(12.5);
  });

  it("clamps invalid discount values to a valid non-negative unit discount", () => {
    expect(calculateUnitDiscount(100, "fixed", 125)).toBe(100);
    expect(calculateUnitDiscount(100, "percentage", 150)).toBe(100);
    expect(calculateUnitDiscount(100, "fixed", -5)).toBe(0);
    expect(calculateUnitDiscount(100, "percentage", Number.NaN)).toBe(0);
    expect(calculateUnitDiscount(-100, "fixed", 5)).toBe(0);
    expect(calculateUnitDiscount(100, null, 50)).toBe(0);
  });

  it("calculates quantity, item discounts, legacy remainder, delivery, and final total", () => {
    expect(calculateCartTotals([item], 80, 25)).toEqual({
      quantity: 2,
      grossSubtotal: 960,
      itemDiscount: 60,
      legacyDiscount: 25,
      aggregateDiscount: 85,
      netMerchandiseTotal: 875,
      deliveryFee: 80,
      finalTotal: 955,
    });
  });
});

describe("order editor catalog helpers", () => {
  it("matches product names, slugs, and variant attributes", () => {
    expect(matchesCatalogSearch(mango, "premium")).toBe(true);
    expect(matchesCatalogSearch(mango, "premium-mango")).toBe(true);
    expect(matchesCatalogSearch(mango, "family box")).toBe(true);
    expect(matchesCatalogSearch(mango, "lychee")).toBe(false);
    expect(matchesCatalogSearch(mango, "  ")).toBe(true);
  });

  it("adds product and variant lines with catalog metadata", () => {
    const productItems = upsertCartItem([], mango);
    expect(productItems[0]).toMatchObject({
      product_id: "product-1",
      variant_id: null,
      unit_price: 480,
      quantity: 1,
      available_stock: 8,
      discount_type: null,
    });

    const variantItems = upsertCartItem([], mango, mango.variants[0]);
    expect(variantItems[0]).toMatchObject({
      product_id: "product-1",
      variant_id: "variant-1",
      variant_name: "Family Box",
      unit_price: 500,
      weight_kg: 1.5,
      available_stock: 3,
    });
  });

  it("increments duplicate lines without mutating the existing cart", () => {
    const existing = upsertCartItem([], mango, mango.variants[0]);
    const updated = upsertCartItem(existing, mango, mango.variants[0]);

    expect(updated).not.toBe(existing);
    expect(updated[0]).not.toBe(existing[0]);
    expect(existing[0].quantity).toBe(1);
    expect(updated[0].quantity).toBe(2);
  });

  it("does not increment a duplicate beyond its editable availability", () => {
    const first = upsertCartItem([], mango, mango.variants[0]);
    const second = upsertCartItem(first, mango, mango.variants[0]);
    const third = upsertCartItem(second, mango, mango.variants[0]);
    const fourth = upsertCartItem(third, mango, mango.variants[0]);

    expect(third[0].quantity).toBe(3);
    expect(fourth[0].quantity).toBe(3);
  });
});
