import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  storefrontVisibleVariants,
  toPublicInventoryEntry,
  toPublicProduct,
} from "../../server/publicCatalog.js";

const server = readFileSync(resolve(__dirname, "../../server/index.js"), "utf8");

function functionBody(name: string) {
  const start = server.indexOf(`async function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = server.indexOf("\nasync function ", start + 1);
  return server.slice(start, next === -1 ? undefined : next);
}

const variants = [
  { id: "v-1kg", product_id: "p1", attributes: { size: "১ কেজি" }, price_adjustment: 300, stock_quantity: 518, storefront_visible: true },
  { id: "v-500g", product_id: "p1", attributes: { size: "৫০০ গ্রাম" }, price_adjustment: 0, stock_quantity: 500, storefront_visible: false },
  { id: "v-legacy", product_id: "p1", attributes: { size: "২ কেজি" }, price_adjustment: 1000, stock_quantity: 499 },
];

describe("Merchant-Suite-only variants", () => {
  it("drops variants hidden from the storefront and keeps legacy rows visible", () => {
    expect(storefrontVisibleVariants(variants).map((v) => v.id)).toEqual(["v-1kg", "v-legacy"]);
    expect(storefrontVisibleVariants(null as unknown as [])).toEqual([]);
  });

  it("keeps hidden variants and their stock out of the public catalog and inventory", () => {
    const visible = storefrontVisibleVariants(variants);
    const product = toPublicProduct({ id: "p1", name: "Bori", slug: "bori", selling_price: 400 }, visible, []);
    expect(product.variants.map((v) => v.id)).toEqual(["v-1kg", "v-legacy"]);

    const inventory = toPublicInventoryEntry({ stockQuantity: 0, variants: visible });
    expect(Object.keys(inventory.variants)).toEqual(["v-1kg", "v-legacy"]);
    expect(inventory.stock_quantity).toBe(1017);
  });

  it("filters every public catalog loader and public checkout", () => {
    for (const name of ["loadPublicProducts", "loadPublicProductBySlug", "loadPublicInventory", "handlePublicHandleOrderSubmit"]) {
      const body = functionBody(name);
      expect(body, name).toContain("storefront_visible");
      expect(body, name).toContain("storefrontVisibleVariants(");
    }
  });

  it("lets the merchant set visibility when creating or editing a variant", () => {
    const create = server.slice(server.indexOf('app.post("/api/products/:id/variants"'), server.indexOf('app.patch("/api/products/:id/variants/:variantId"'));
    expect(create).toContain("storefront_visible: storefront_visible !== false");
    const update = server.slice(server.indexOf('app.patch("/api/products/:id/variants/:variantId"'), server.indexOf('app.delete("/api/products/:id/variants/:variantId"'));
    expect(update).toContain("patch.storefront_visible = req.body.storefront_visible");
    expect(update).toContain('"storefront_visible"]');
  });
});
