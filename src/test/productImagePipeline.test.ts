import { describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  getBackfillProductImageMimeType,
  parseBackfillArguments,
} from "../../scripts/backfill-product-image-variants.mjs";

import {
  buildProductImageBuffers,
  createProductImageAssetPaths,
  getProductImagePathsForCleanup,
  getProductImageVariantPaths,
  isVariantAssetSourcePath,
} from "../../server/productImages.js";

describe("product image asset paths", () => {
  it("uses an immutable asset directory while preserving legacy cleanup paths", () => {
    const asset = createProductImageAssetPaths({
      orgId: "org",
      productId: "product",
      assetId: "asset",
    });

    expect(asset).toEqual({
      sourcePath: "org/product/asset/source",
      variantPaths: {
        "320": "org/product/asset/320.webp",
        "640": "org/product/asset/640.webp",
        "960": "org/product/asset/960.webp",
      },
    });
    expect(isVariantAssetSourcePath(asset.sourcePath)).toBe(true);
    expect(getProductImageVariantPaths(asset.sourcePath)).toEqual(asset.variantPaths);
    expect(getProductImageVariantPaths("org/product/legacy.webp")).toBeNull();
    expect(getProductImagePathsForCleanup("org/product/legacy.webp")).toEqual(["org/product/legacy.webp"]);
    expect(getProductImagePathsForCleanup(asset.sourcePath)).toEqual([
      asset.sourcePath,
      "org/product/asset/320.webp",
      "org/product/asset/640.webp",
      "org/product/asset/960.webp",
    ]);
  });

  it("does not produce storage cleanup targets for a missing path", () => {
    expect(getProductImagePathsForCleanup(null)).toEqual([]);
  });

  it("creates WebP candidates without enlarging the source", async () => {
    const input = await sharp({
      create: { width: 800, height: 400, channels: 3, background: "#fbbb14" },
    })
      .png()
      .toBuffer();

    const output = await buildProductImageBuffers(input, { mimeType: "image/png" });

    expect(output.source).toEqual({ buffer: input, mimeType: "image/png" });
    await expect(sharp(output.variants["320"].buffer).metadata()).resolves.toMatchObject({ width: 320, height: 160 });
    await expect(sharp(output.variants["640"].buffer).metadata()).resolves.toMatchObject({ width: 640, height: 320 });
    await expect(sharp(output.variants["960"].buffer).metadata()).resolves.toMatchObject({ width: 800, height: 400 });
  });
});

describe("product image variant backfill", () => {
  it("requires a target workspace and defaults to dry-run mode", () => {
    expect(
      parseBackfillArguments(["--org-id=3cd26e57-85ef-4970-94a4-cd99c0f1b554"]),
    ).toEqual({ orgId: "3cd26e57-85ef-4970-94a4-cd99c0f1b554", apply: false });
    expect(
      parseBackfillArguments(["--org-id=3cd26e57-85ef-4970-94a4-cd99c0f1b554", "--apply"]),
    ).toEqual({ orgId: "3cd26e57-85ef-4970-94a4-cd99c0f1b554", apply: true });
    expect(() => parseBackfillArguments([])).toThrow("Pass a valid --org-id=<uuid>");
  });

  it("only accepts source MIME types that the upload route supports", () => {
    expect(getBackfillProductImageMimeType({ type: "image/jpeg" })).toBe("image/jpeg");
    expect(getBackfillProductImageMimeType({ type: "image/png" })).toBe("image/png");
    expect(getBackfillProductImageMimeType({ type: "text/plain" })).toBeNull();
  });
});
