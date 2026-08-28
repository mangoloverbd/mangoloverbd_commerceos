import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("product image gallery", () => {
  const productsSource = readFileSync(resolve(process.cwd(), "src/pages/Products.tsx"), "utf8");
  // Create/edit now live on dedicated full pages; the image manager is a shared component.
  const addProductSource = readFileSync(resolve(process.cwd(), "src/pages/ProductNew.tsx"), "utf8");
  const editProductSource = readFileSync(resolve(process.cwd(), "src/pages/ProductEdit.tsx"), "utf8");
  const sharedSource = readFileSync(resolve(process.cwd(), "src/pages/products/shared.tsx"), "utf8");
  const serverSource = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
  const publicCatalogSource = readFileSync(resolve(process.cwd(), "server/publicCatalog.js"), "utf8");
  const baselineSource = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260828000000_canonical_schema_reconciliation.sql"),
    "utf8",
  );

  it("creates product image storage and metadata infrastructure", () => {
    expect(serverSource).toContain("PRODUCT_IMAGES_BUCKET");
    expect(baselineSource).toMatch(
      /create table(?: if not exists)? public\.product_images/i,
    );
    expect(baselineSource).toContain("'product-images'");
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

  it("lets merchants select and upload product images from the Add Product page", () => {
    expect(addProductSource).toContain("selectedImages");
    expect(addProductSource).toContain("onUploadComplete={addImageFile}");
    expect(addProductSource).toContain("uploadProductImages");
    expect(addProductSource).toContain("uploadSelectedProductImages");
    expect(sharedSource).toContain("/api/products/${productId}/images");
  });

  it("lets merchants edit products and reorder existing images", () => {
    expect(serverSource).toContain("app.patch(\"/api/products/:id/images/reorder\"");
    expect(serverSource).toContain("is_primary: index === 0");
    expect(serverSource).toContain("inserted[0] && inserted[0].is_primary");
    // Edit is a dedicated page reached by clicking a product row; the old popup is gone.
    expect(productsSource).not.toContain("ProductBloomPopover");
    expect(productsSource).not.toContain("product-bloom-backdrop");
    expect(productsSource).toContain("navigate(`/products/${id}/edit`)");
    expect(editProductSource).toContain("ProductImageManager");
    expect(sharedSource).toContain("moveImage(image.id, -1)");
    expect(sharedSource).toContain("moveImage(image.id, 1)");
    expect(sharedSource).toContain("/api/products/${product.id}/images/reorder");
  });

  it("uploads edit-product images immediately and shows a clear remove control", () => {
    expect(sharedSource).toContain("uploadImageFile");
    expect(sharedSource).toContain("onUploadComplete={uploadImageFile}");
    expect(sharedSource).not.toContain("Upload ${selectedImages.length}");
    expect(sharedSource).toContain("aria-label={`Remove ${image.alt_text || product.name}`}");
    expect(sharedSource).toContain("Trash2 className=\"h-3 w-3\"");
  });
});
