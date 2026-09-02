import { z } from "zod";

function toNumber(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ─── Catalog (cacheable, no stock truth) ─────────────────────────────────────
// `available` here = "sellable at all" (published + has a price). The storefront
// still has to check the inventory endpoint before allowing add-to-cart, but
// this flag lets the merchant render greyed-out cards without a round-trip.

const PublicImageSourcesSchema = z
  .object({
    "320": z.string().min(1),
    "640": z.string().min(1),
    "960": z.string().min(1),
  })
  .strict();

const PublicImageSchema = z
  .object({
    id: z.union([z.string(), z.number(), z.null()]),
    url: z.string().min(1),
    sources: PublicImageSourcesSchema.optional(),
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
    variants: z.array(PublicVariantSchema),
  })
  .strict();

export function toPublicProduct(product, variants = [], images = []) {
  const basePrice = toNumber(product.selling_price, null);
  const safeImages = images
    .map((image) => {
      const hasCompleteSources = ["320", "640", "960"].every(
        (width) => typeof image.sources?.[width] === "string" && image.sources[width],
      );

      return {
        id: image.id ?? null,
        url: image.url || image.image_url,
        ...(hasCompleteSources
          ? {
              sources: {
                "320": image.sources["320"],
                "640": image.sources["640"],
                "960": image.sources["960"],
              },
            }
          : {}),
        alt_text: image.alt_text || null,
        sort_order: image.sort_order || 0,
        is_primary: image.is_primary === true,
      };
    })
    .filter((image) => image.url);
  const galleryImages =
    safeImages.length > 0
      ? safeImages
      : product.image_url
        ? [{ id: null, url: product.image_url, alt_text: product.name || null, sort_order: 0, is_primary: true }]
        : [];

  // Catalog "sellable at all": published + has a price. Explicit unpublished
  // rows never reach this serializer (route filters `published = true`), so
  // the flag is really `price != null` — leaving the shape in place so future
  // states (archived, out-of-region) can plug in without breaking clients.
  const isSellable = basePrice != null;

  const safeVariants = variants.map((variant) => {
    const adjustment = toNumber(variant.price_adjustment, 0) || 0;
    return {
      id: variant.id,
      attributes: variant.attributes || {},
      price: basePrice == null ? null : basePrice + adjustment,
      available: isSellable,
    };
  });

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
    available: isSellable,
    variants: safeVariants,
  };

  return PublicProductSchema.parse(payload);
}

// ─── Inventory (short-TTL, stock truth) ──────────────────────────────────────
// One entry per product id. `available` here = "has stock right now" — the
// only source of truth for the add-to-cart button. Variants are keyed by id
// so the storefront can look up a specific option without scanning.

const PublicInventoryVariantSchema = z
  .object({
    available: z.boolean(),
    stock_quantity: z.number(),
  })
  .strict();

export const PublicInventoryEntrySchema = z
  .object({
    available: z.boolean(),
    stock_quantity: z.number(),
    variants: z.record(PublicInventoryVariantSchema),
  })
  .strict();

export const PublicInventoryResponseSchema = z
  .object({
    inventory: z.record(PublicInventoryEntrySchema),
    as_of: z.string(),
  })
  .strict();

export function toPublicInventoryEntry({ stockQuantity = 0, variants = [] } = {}) {
  const baseStock = Math.max(0, parseInt(stockQuantity || 0, 10) || 0);
  const variantMap = {};
  let variantStockTotal = 0;
  let anyVariantAvailable = false;

  for (const variant of variants) {
    const stock = Math.max(0, parseInt(variant.stock_quantity || 0, 10) || 0);
    variantStockTotal += stock;
    const available = stock > 0;
    if (available) anyVariantAvailable = true;
    variantMap[String(variant.id)] = { available, stock_quantity: stock };
  }

  const hasVariants = variants.length > 0;
  const entry = {
    available: hasVariants ? anyVariantAvailable : baseStock > 0,
    stock_quantity: hasVariants ? variantStockTotal : baseStock,
    variants: variantMap,
  };
  return PublicInventoryEntrySchema.parse(entry);
}
