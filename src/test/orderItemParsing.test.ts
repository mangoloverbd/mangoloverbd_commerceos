import { describe, expect, it } from "vitest";
import {
  buildLegacyOrderItems,
  mergeResolvedOrderItems,
  parseLegacyProductLines,
} from "../../server/orderItemParsing.js";

describe("parseLegacyProductLines", () => {
  it("keeps each comma-separated storefront product as its own cart line", () => {
    expect(parseLegacyProductLines("Premium Mango x1, Honey Jar (500g) x2")).toEqual([
      { productName: "Premium Mango", quantity: 1 },
      { productName: "Honey Jar (500g)", quantity: 2 },
    ]);
  });

  it("keeps plus-separated storefront cart lines as separate items", () => {
    expect(parseLegacyProductLines("Cart Checkout - 1x Pure Ghee + 1x Sundarbans Honey")).toEqual([
      { productName: "Pure Ghee", quantity: 1 },
      { productName: "Sundarbans Honey", quantity: 1 },
    ]);
  });

  it("preserves the legacy quantity field for a single product without an inline suffix", () => {
    expect(parseLegacyProductLines("Premium Mango", 3)).toEqual([
      { productName: "Premium Mango", quantity: 3 },
    ]);
  });

  it("does not split commas inside variant attributes", () => {
    expect(parseLegacyProductLines("Honey Jar (500g, Glass) x2, Premium Mango x1")).toEqual([
      { productName: "Honey Jar (500g, Glass)", quantity: 2 },
      { productName: "Premium Mango", quantity: 1 },
    ]);
  });

  it("supports legacy leading quantities", () => {
    expect(parseLegacyProductLines("2x Mango, 1x Honey")).toEqual([
      { productName: "Mango", quantity: 2 },
      { productName: "Honey", quantity: 1 },
    ]);
  });

  it("allocates discounted legacy order totals across separate fallback lines", () => {
    const items = buildLegacyOrderItems({
      orderId: "order-1",
      productText: "Premium Mango x1, Honey Jar x1",
      fallbackQuantity: 2,
      price: 450,
      discount: 50,
    });

    expect(items.map((item) => item.unit_price)).toEqual([250, 250]);
    expect(items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)).toBe(500);
  });

  it("caps quantities at the database integer limit", () => {
    expect(parseLegacyProductLines("999999999999999999999999x Mango")).toEqual([
      { productName: "Mango", quantity: 2_147_483_647 },
    ]);
  });

  it("merges duplicate catalog lines before persistence", () => {
    expect(mergeResolvedOrderItems([
      { productId: "product-1", variantId: null, quantity: 1 },
      { productId: "product-1", variantId: null, quantity: 1 },
      { productId: "product-1", variantId: "variant-1", quantity: 2 },
    ])).toEqual([
      { productId: "product-1", variantId: null, quantity: 2 },
      { productId: "product-1", variantId: "variant-1", quantity: 2 },
    ]);
  });

});
