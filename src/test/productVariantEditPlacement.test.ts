import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("product variant edit placement", () => {
  const productsSource = readFileSync(resolve(process.cwd(), "src/pages/Products.tsx"), "utf8");
  const editSource = readFileSync(resolve(process.cwd(), "src/pages/ProductEdit.tsx"), "utf8");

  it("keeps add-variant controls out of the products table", () => {
    expect(productsSource).not.toContain("AddVariantDrawer");
    expect(productsSource).not.toContain("setAddingFor");
    expect(productsSource).not.toContain("/variants/${variant.id}");
    expect(productsSource).not.toContain("role=\"button\"");
  });

  it("shows and manages variants from the product edit page", () => {
    expect(editSource).toContain("Existing variants");
    expect(editSource).toContain("Add variant");
    expect(editSource).toContain("/variants/${variant.id}");
    expect(editSource).toContain("/variants`");
  });

  it("does not expose fallback image URL or product URL fields on the edit page", () => {
    expect(editSource).not.toContain("Fallback image URL");
    expect(editSource).not.toContain("Product URL");
    expect(editSource).not.toContain("image_url: imageUrl");
    expect(editSource).not.toContain("url: productUrl");
  });
});
