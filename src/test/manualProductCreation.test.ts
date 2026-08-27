import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("manual product creation", () => {
  const productsSource = readFileSync(resolve(process.cwd(), "src/pages/Products.tsx"), "utf8");
  // Add Product now lives on a dedicated full page (/products/new) instead of a popup drawer.
  const addProductSource = readFileSync(resolve(process.cwd(), "src/pages/ProductNew.tsx"), "utf8");
  const serverSource = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

  it("shows an Add Product action that navigates to the dedicated create page", () => {
    expect(productsSource).toContain("Add Product");
    expect(productsSource).toContain("data-testid=\"button-add-product\"");
    expect(productsSource).toContain("navigate(\"/products/new\")");
    // The manual create page carries its own header + compare-at-price field.
    expect(addProductSource).toContain("Add Product");
    expect(addProductSource).toContain("data-testid=\"input-manual-product-compare-at-price\"");
    expect(addProductSource).toContain("data-testid=\"button-add-option\"");
  });

  it("keeps the manual product form focused on uploads and labels variant numeric fields", () => {
    expect(addProductSource).not.toContain("data-testid=\"input-manual-product-image\"");
    expect(addProductSource).not.toContain("data-testid=\"input-manual-product-url\"");
    expect(addProductSource).not.toContain("placeholder=\"Image URL\"");
    expect(addProductSource).not.toContain("placeholder=\"Product URL\"");
    expect(addProductSource).toContain(">Stock</span>");
    expect(addProductSource).toContain(">COG (৳)</span>");
    expect(addProductSource).toContain(">Price (৳)</span>");
    expect(addProductSource).toContain("onUploadComplete={addImageFile}");
  });

  it("saves manual product stock, publish fields, compare price, and variant inventory", () => {
    expect(serverSource).toContain("compare_at_price: p.compare_at_price != null ? parseFloat(p.compare_at_price) : null");
    expect(serverSource).toContain("published: p.published === true");
    expect(serverSource).toContain("saveProductStock(orgId, savedProduct.id, sourceProduct.stock_quantity)");
    expect(serverSource).toContain("cog: v.cog != null ? parseFloat(v.cog) : 0");
    expect(serverSource).toContain("stock_quantity: Math.max(0, parseInt(v.stock_quantity, 10) || 0)");
  });
});
