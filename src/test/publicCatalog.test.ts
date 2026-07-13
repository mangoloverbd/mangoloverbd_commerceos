import { describe, expect, it } from "vitest";
import { toPublicProduct } from "../../server/publicCatalog.js";

describe("toPublicProduct", () => {
  it("returns only storefront-safe fields for a published product", () => {
    const product = toPublicProduct(
      {
        id: "product-1",
        name: "Linen Shirt",
        slug: "linen-shirt",
        description: "Soft summer shirt",
        url: "https://merchant.test/products/linen-shirt",
        image_url: "https://merchant.test/linen.jpg",
        selling_price: 1250,
        compare_at_price: 1500,
        cog: 500,
        stock_quantity: 12,
        source_url: "https://internal.test/source",
        published: true,
      },
      [
        {
          id: "variant-1",
          attributes: { color: "Black", size: "M" },
          stock_quantity: 3,
          price_adjustment: 100,
          cog: 450,
          org_id: "org-1",
        },
      ],
      12,
    );

    expect(product).toEqual({
      id: "product-1",
      name: "Linen Shirt",
      slug: "linen-shirt",
      description: "Soft summer shirt",
      url: "https://merchant.test/products/linen-shirt",
      image_url: "https://merchant.test/linen.jpg",
      images: [],
      price: 1250,
      compare_at_price: 1500,
      available: true,
      stock_quantity: 3,
      variants: [
        {
          id: "variant-1",
          attributes: { color: "Black", size: "M" },
          price: 1350,
          available: true,
          stock_quantity: 3,
        },
      ],
    });
    expect(product).not.toHaveProperty("cog");
    expect(product).not.toHaveProperty("source_url");
    expect(product.variants[0]).not.toHaveProperty("cog");
    expect(product.variants[0]).not.toHaveProperty("org_id");
  });

  it("uses safe gallery images as public product images", () => {
    const product = toPublicProduct(
      { id: "p3", name: "Bag", image_url: "https://legacy.test/bag.jpg", selling_price: 900 },
      [],
      4,
      [
        {
          id: "img-1",
          url: "https://cdn.test/bag-1.webp",
          storage_path: "org/p3/internal.webp",
          alt_text: "Canvas bag",
          sort_order: 0,
          is_primary: true,
        },
      ],
    );

    expect(product.image_url).toBe("https://cdn.test/bag-1.webp");
    expect(product.images).toEqual([
      {
        id: "img-1",
        url: "https://cdn.test/bag-1.webp",
        alt_text: "Canvas bag",
        sort_order: 0,
        is_primary: true,
      },
    ]);
    expect(product.images[0]).not.toHaveProperty("storage_path");
  });

  it("uses base stock when a product has no variants", () => {
    expect(toPublicProduct({ id: "p2", name: "Hat", selling_price: 300 }, [], 0)).toMatchObject({
      available: false,
      stock_quantity: 0,
      variants: [],
    });
  });
});
