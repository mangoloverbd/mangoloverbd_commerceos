import { describe, expect, it } from "vitest";
import { productPriceDisplay, productPriceDisplayLines, variantPriceDisplay } from "../pages/products/shared";
import type { Product } from "../pages/products/shared";

const baseProduct: Product = {
  id: "product-1",
  name: "Black Seed Flower Honey",
  slug: null,
  description: null,
  url: null,
  image_url: null,
  selling_price: 1000,
  compare_at_price: null,
  cog: 600,
  stock_quantity: 10,
  source_url: null,
  published: true,
  published_at: null,
  created_at: "2026-08-28T00:00:00.000Z",
  variants: [],
  images: [],
};

describe("product price display", () => {
  it("shows each distinct variant price instead of only the base product price", () => {
    const product: Product = {
      ...baseProduct,
      variants: [
        {
          id: "variant-1",
          product_id: "product-1",
          attributes: { size: "500g" },
          cog: 500,
          stock_quantity: 4,
          price_adjustment: 0,
          org_id: null,
          created_at: "2026-08-28T00:00:00.000Z",
        },
        {
          id: "variant-2",
          product_id: "product-1",
          attributes: { size: "1kg" },
          cog: 900,
          stock_quantity: 3,
          price_adjustment: 500,
          org_id: null,
          created_at: "2026-08-28T00:00:00.000Z",
        },
      ],
    };

    expect(productPriceDisplay(product)).toBe("৳1,000 / ৳1,500");
    expect(productPriceDisplayLines(product)).toEqual(["৳1,000", "৳1,500"]);
  });

  it("keeps the base price display for products without variants", () => {
    expect(productPriceDisplay(baseProduct)).toBe("৳1,000");
  });

  it("formats an individual variant price from the base price and adjustment", () => {
    expect(variantPriceDisplay(baseProduct, { price_adjustment: 400 })).toBe("৳1,400");
  });
});
