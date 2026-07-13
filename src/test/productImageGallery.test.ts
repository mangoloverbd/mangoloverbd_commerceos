import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("product image gallery", () => {
  const productsSource = readFileSync(resolve(process.cwd(), "src/pages/Products.tsx"), "utf8");
  const serverSource = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
  const publicCatalogSource = readFileSync(resolve(process.cwd(), "server/publicCatalog.js"), "utf8");

  it("creates product image storage and metadata infrastructure", () => {
    expect(serverSource).toContain("PRODUCT_IMAGES_BUCKET");
    expect(serverSource).toContain("CREATE TABLE IF NOT EXISTS public.product_images");
    expect(serverSource).toContain("ensureProductImagesBucket");
    expect(serverSource).toContain("app.post(\"/api/products/:id/images\"");
    expect(serverSource).toContain("app.delete(\"/api/products/:id/images/:imageId\"");
  });

  it("returns image galleries from private and public product APIs", () => {
    expect(serverSource).toContain("loadProductImagesMap");
    expect(serverSource).toContain("images: imagesMap[p.id] || []");
    expect(publicCatalogSource).toContain("images: safeImages");
    expect(publicCatalogSource).toContain("image_url: safeImages[0]?.url || product.image_url || null");
  });

  it("lets merchants select and upload product images from the Add Product drawer", () => {
    expect(productsSource).toContain("selectedImages");
    expect(productsSource).toContain("data-testid=\"input-manual-product-images\"");
    expect(productsSource).toContain("uploadProductImages");
    expect(productsSource).toContain("/api/products/${productId}/images");
  });
});
