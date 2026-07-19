import { describe, expect, it } from "vitest";
import { PublicProductSchema, toPublicProduct } from "../../server/publicCatalog.js";

const LEAKY_FIELDS = [
  "cog",
  "cost_price",
  "internal_sku",
  "org_id",
  "source_url",
  "supplier_id",
  "supplier_name",
  "supplier_url",
  "storage_path",
  "created_at",
  "updated_at",
  "published_at",
];

const ALLOWED_PRODUCT_KEYS = new Set([
  "id",
  "name",
  "slug",
  "description",
  "url",
  "image_url",
  "images",
  "image_urls",
  "price",
  "compare_at_price",
  "available",
  "stock_quantity",
  "variants",
]);

const ALLOWED_VARIANT_KEYS = new Set(["id", "attributes", "price", "available", "stock_quantity"]);
const ALLOWED_IMAGE_KEYS = new Set(["id", "url", "alt_text", "sort_order", "is_primary"]);

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
      images: [
        {
          id: null,
          url: "https://merchant.test/linen.jpg",
          alt_text: "Linen Shirt",
          sort_order: 0,
          is_primary: true,
        },
      ],
      image_urls: ["https://merchant.test/linen.jpg"],
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

  it("uses every safe gallery image as public product images", () => {
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
        {
          id: "img-2",
          image_url: "https://cdn.test/bag-2.webp",
          storage_path: "org/p3/internal-2.webp",
          alt_text: "Canvas bag detail",
          sort_order: 1,
          is_primary: false,
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
      {
        id: "img-2",
        url: "https://cdn.test/bag-2.webp",
        alt_text: "Canvas bag detail",
        sort_order: 1,
        is_primary: false,
      },
    ]);
    expect(product.image_urls).toEqual(["https://cdn.test/bag-1.webp", "https://cdn.test/bag-2.webp"]);
    expect(product.images[0]).not.toHaveProperty("storage_path");
    expect(product.images[1]).not.toHaveProperty("storage_path");
  });

  it("uses base stock when a product has no variants", () => {
    expect(toPublicProduct({ id: "p2", name: "Hat", selling_price: 300 }, [], 0)).toMatchObject({
      available: false,
      stock_quantity: 0,
      variants: [],
    });
  });

  it("strips every known internal field from the payload", () => {
    const noise = LEAKY_FIELDS.reduce((acc, key) => ({ ...acc, [key]: `leak-${key}` }), {});
    const result = toPublicProduct(
      {
        id: "p-leak",
        name: "Sensitive",
        slug: "sensitive",
        selling_price: 100,
        ...noise,
      },
      [{ id: "v-leak", attributes: { size: "M" }, stock_quantity: 5, price_adjustment: 0, ...noise }],
      5,
      [{ id: "i-leak", url: "https://cdn.test/x.webp", alt_text: null, sort_order: 0, is_primary: true, ...noise }],
    );

    for (const key of LEAKY_FIELDS) {
      expect(result, `product must not expose ${key}`).not.toHaveProperty(key);
      expect(result.variants[0], `variant must not expose ${key}`).not.toHaveProperty(key);
      expect(result.images[0], `image must not expose ${key}`).not.toHaveProperty(key);
    }
  });

  it("emits only allowlisted keys at every level", () => {
    const result = toPublicProduct(
      {
        id: "p-shape",
        name: "Shape",
        slug: "shape",
        description: "d",
        url: "https://merchant.test/p",
        image_url: "https://cdn.test/a.webp",
        selling_price: 200,
        compare_at_price: 250,
      },
      [{ id: "v-shape", attributes: { size: "S" }, stock_quantity: 2, price_adjustment: 10 }],
      2,
    );

    for (const key of Object.keys(result)) {
      expect(ALLOWED_PRODUCT_KEYS.has(key), `unexpected product key: ${key}`).toBe(true);
    }
    for (const variant of result.variants) {
      for (const key of Object.keys(variant)) {
        expect(ALLOWED_VARIANT_KEYS.has(key), `unexpected variant key: ${key}`).toBe(true);
      }
    }
    for (const image of result.images) {
      for (const key of Object.keys(image)) {
        expect(ALLOWED_IMAGE_KEYS.has(key), `unexpected image key: ${key}`).toBe(true);
      }
    }
  });

  it("throws when the serializer output contains an unexpected field", () => {
    const bad = { id: "x", name: "x", slug: "x" } as unknown as Parameters<typeof PublicProductSchema.parse>[0];
    expect(() => PublicProductSchema.parse({ ...bad, leaked_field: 1 })).toThrow();
  });

  it("exports a strict Zod schema that matches the runtime shape", () => {
    const result = toPublicProduct({ id: "p-schema", name: "S", slug: "s", selling_price: 100 }, [], 0);
    // toPublicProduct already runs .parse() internally; re-validating must pass.
    expect(() => PublicProductSchema.parse(result)).not.toThrow();
  });
});
