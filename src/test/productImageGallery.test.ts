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
    expect(publicCatalogSource).toContain("images: galleryImages");
    expect(publicCatalogSource).toContain("image_urls: galleryImages.map((image) => image.url)");
  });

  it("lets merchants select and upload product images from the Add Product drawer", () => {
    expect(productsSource).toContain("selectedImages");
    expect(productsSource).toContain("data-testid=\"input-manual-product-images\"");
    expect(productsSource).toContain("uploadProductImages");
    expect(productsSource).toContain("/api/products/${productId}/images");
  });

  it("lets merchants edit products and reorder existing images", () => {
    expect(serverSource).toContain("app.patch(\"/api/products/:id/images/reorder\"");
    expect(serverSource).toContain("is_primary: index === 0");
    expect(serverSource).toContain("inserted[0] && inserted[0].is_primary");
    expect(productsSource).toContain("EditProductDrawer");
    expect(productsSource).toContain("ProductBloomPopover");
    expect(productsSource).toContain("product-bloom-backdrop");
    expect(productsSource).toContain("fixed inset-0 z-50 grid place-items-center");
    expect(productsSource).toContain("data-testid={`button-edit-product-${product.id}`}");
    expect(productsSource).toContain("moveImage(image.id, -1)");
    expect(productsSource).toContain("moveImage(image.id, 1)");
    expect(productsSource).toContain("/api/products/${product.id}/images/reorder");
  });
});
