import { z } from "zod";

function toNumber(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const PublicImageSchema = z
  .object({
    id: z.union([z.string(), z.number(), z.null()]),
    url: z.string().min(1),
    alt_text: z.string().nullable(),
    sort_order: z.number(),
    is_primary: z.boolean(),
  })
  .strict();

const PublicVariantSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    attributes: z.record(z.any()),
    price: z.number().nullable(),
    available: z.boolean(),
    stock_quantity: z.number(),
  })
  .strict();

export const PublicProductSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    url: z.string().nullable(),
    image_url: z.string().nullable(),
    images: z.array(PublicImageSchema),
    image_urls: z.array(z.string()),
    price: z.number().nullable(),
    compare_at_price: z.number().nullable(),
    available: z.boolean(),
    stock_quantity: z.number(),
    variants: z.array(PublicVariantSchema),
  })
  .strict();

export function toPublicProduct(product, variants = [], stockQuantity = 0, images = []) {
  const basePrice = toNumber(product.selling_price, null);
  const safeImages = images
    .map((image) => ({
      id: image.id ?? null,
      url: image.url || image.image_url,
      alt_text: image.alt_text || null,
      sort_order: image.sort_order || 0,
      is_primary: image.is_primary === true,
    }))
    .filter((image) => image.url);
  const galleryImages =
    safeImages.length > 0
      ? safeImages
      : product.image_url
        ? [{ id: null, url: product.image_url, alt_text: product.name || null, sort_order: 0, is_primary: true }]
        : [];
  const safeVariants = variants.map((variant) => {
    const adjustment = toNumber(variant.price_adjustment, 0) || 0;
    const variantStock = Math.max(0, parseInt(variant.stock_quantity || 0, 10) || 0);
    return {
      id: variant.id,
      attributes: variant.attributes || {},
      price: basePrice == null ? null : basePrice + adjustment,
      available: variantStock > 0,
      stock_quantity: variantStock,
    };
  });

  const baseStock = Math.max(0, parseInt(stockQuantity || 0, 10) || 0);
  const hasVariants = safeVariants.length > 0;

  const payload = {
    id: product.id,
    name: product.name,
    slug: product.slug || product.id,
    description: product.description || null,
    url: product.url || null,
    image_url: galleryImages[0]?.url || null,
    images: galleryImages,
    image_urls: galleryImages.map((image) => image.url),
    price: basePrice,
    compare_at_price: toNumber(product.compare_at_price, null),
    available: hasVariants ? safeVariants.some((variant) => variant.available) : baseStock > 0,
    stock_quantity: hasVariants ? safeVariants.reduce((sum, variant) => sum + variant.stock_quantity, 0) : baseStock,
    variants: safeVariants,
  };

  return PublicProductSchema.parse(payload);
}
