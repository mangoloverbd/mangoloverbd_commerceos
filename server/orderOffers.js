// ─── Order offers ───────────────────────────────────────────────────────────
// Server-side price rules for checkout add-on offers. The storefront only shows
// the offer; the price is always decided here so a browser cannot set its own.
//
// Bori + mustard oil: an order that contains Homemade Pumpkin Bori gets one
// 1-litre bottle of mustard oil at ৳280 instead of the catalog ৳350. Only a
// single bottle qualifies: a line with quantity above 1 keeps full price (the
// storefront never sends more than one), and only the first qualifying line is
// discounted.
export const BORI_PRODUCT_ID = "db9134d3-4771-4f66-960c-7fac1fb782e1";
export const MUSTARD_OIL_1L_VARIANT_ID = "823862e1-56f9-4594-9191-a50c43a0f75d";
export const BORI_MUSTARD_OIL_OFFER_PRICE = 280;

/**
 * Returns a copy of the priced order items with offer prices applied.
 * `lineTotal` is recalculated only on items that already carry one.
 *
 * @template {{productId?: unknown, variantId?: unknown, quantity: number, unitPrice: number, lineTotal?: number}} T
 * @param {T[] | null | undefined} orderItems
 * @returns {T[]}
 */
export function applyOrderOffers(orderItems) {
  if (!Array.isArray(orderItems)) return [];
  const items = orderItems.map((item) => ({ ...item }));
  const hasBori = items.some((item) => String(item.productId ?? "") === BORI_PRODUCT_ID);
  if (!hasBori) return items;

  const oilLine = items.find((item) => String(item.variantId ?? "") === MUSTARD_OIL_1L_VARIANT_ID
    && item.quantity === 1
    && item.unitPrice > BORI_MUSTARD_OIL_OFFER_PRICE);
  if (oilLine) {
    oilLine.unitPrice = BORI_MUSTARD_OIL_OFFER_PRICE;
    if ("lineTotal" in oilLine) oilLine.lineTotal = BORI_MUSTARD_OIL_OFFER_PRICE * oilLine.quantity;
  }
  return items;
}

/**
 * Public description of the bori + mustard oil offer, built from the live
 * variant and product rows. Returns null when the bottle cannot be sold on the
 * storefront, so the storefront simply hides the offer.
 *
 * @param {{id: string, product_id: string, attributes?: Record<string, unknown> | null, price_adjustment?: unknown, stock_quantity?: unknown, storefront_visible?: boolean} | null | undefined} variant
 * @param {{id: string, name: string, slug: string, selling_price?: unknown, published?: boolean, image_url?: string | null} | null | undefined} product
 */
export function buildBoriMustardOilOffer(variant, product) {
  if (!variant || !product) return null;
  if (variant.id !== MUSTARD_OIL_1L_VARIANT_ID || variant.product_id !== product.id) return null;
  if (variant.storefront_visible === false || product.published !== true) return null;
  const regularPrice = (parseFloat(String(product.selling_price)) || 0) + (parseFloat(String(variant.price_adjustment)) || 0);
  if (!(regularPrice > BORI_MUSTARD_OIL_OFFER_PRICE)) return null;
  const size = variant.attributes?.size;
  return {
    id: "bori-mustard-oil",
    triggerProductId: BORI_PRODUCT_ID,
    productId: product.id,
    productSlug: product.slug,
    productName: product.name,
    imageUrl: product.image_url ?? null,
    variantId: variant.id,
    variantLabel: typeof size === "string" ? size : "",
    regularPrice,
    offerPrice: BORI_MUSTARD_OIL_OFFER_PRICE,
    maxQuantity: 1,
    available: Number(variant.stock_quantity) > 0,
  };
}
