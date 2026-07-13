import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("manual product creation", () => {
  const productsSource = readFileSync(resolve(process.cwd(), "src/pages/Products.tsx"), "utf8");
  const serverSource = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

  it("shows an Add Product action and manual product drawer in the dashboard", () => {
    expect(productsSource).toContain("Add Product");
    expect(productsSource).toContain("AddProductDrawer");
    expect(productsSource).toContain("data-testid=\"button-add-product\"");
    expect(productsSource).toContain("data-testid=\"input-manual-product-compare-at-price\"");
    expect(productsSource).toContain("data-testid=\"button-add-manual-variant\"");
  });

  it("saves manual product stock, publish fields, compare price, and variant inventory", () => {
    expect(serverSource).toContain("compare_at_price: p.compare_at_price != null ? parseFloat(p.compare_at_price) : null");
    expect(serverSource).toContain("published: p.published === true");
    expect(serverSource).toContain("saveProductStock(orgId, savedProduct.id, sourceProduct.stock_quantity)");
    expect(serverSource).toContain("cog: v.cog != null ? parseFloat(v.cog) : 0");
    expect(serverSource).toContain("stock_quantity: Math.max(0, parseInt(v.stock_quantity, 10) || 0)");
  });
});
