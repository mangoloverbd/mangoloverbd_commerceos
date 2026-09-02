import sharp from "sharp";

export const PRODUCT_IMAGE_VARIANT_WIDTHS = [320, 640, 960];
export const PRODUCT_IMAGE_CACHE_SECONDS = 31_536_000;
export const PRODUCT_IMAGE_MAX_PIXELS = 40_000_000;

export function createProductImageAssetPaths({ orgId, productId, assetId }) {
  const prefix = `${orgId}/${productId}/${assetId}`;

  return {
    sourcePath: `${prefix}/source`,
    variantPaths: Object.fromEntries(
      PRODUCT_IMAGE_VARIANT_WIDTHS.map((width) => [String(width), `${prefix}/${width}.webp`]),
    ),
  };
}

export function isVariantAssetSourcePath(storagePath) {
  return typeof storagePath === "string" && storagePath.endsWith("/source");
}

export function getProductImageVariantPaths(storagePath) {
  if (!isVariantAssetSourcePath(storagePath)) return null;

  const prefix = storagePath.slice(0, -"/source".length);
  return Object.fromEntries(
    PRODUCT_IMAGE_VARIANT_WIDTHS.map((width) => [String(width), `${prefix}/${width}.webp`]),
  );
}

export function getProductImagePathsForCleanup(storagePath) {
  if (typeof storagePath !== "string" || !storagePath) return [];

  const variantPaths = getProductImageVariantPaths(storagePath);
  return variantPaths ? [storagePath, ...Object.values(variantPaths)] : [storagePath];
}

export async function buildProductImageBuffers(buffer, { mimeType }) {
  const image = sharp(buffer, { limitInputPixels: PRODUCT_IMAGE_MAX_PIXELS }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Image dimensions are unavailable");
  }

  const entries = await Promise.all(
    PRODUCT_IMAGE_VARIANT_WIDTHS.map(async (width) => {
      const { data, info } = await image
        .clone()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });

      return [String(width), { buffer: data, width: info.width, height: info.height }];
    }),
  );

  return {
    source: { buffer, mimeType },
    variants: Object.fromEntries(entries),
  };
}
