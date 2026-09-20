// ─── Shipping Cost Calculation ────────────────────────────────────────────────
// Pure utility — no DB calls, no side effects. Used by the storefront order
// submission handler and independently testable.

/**
 * Calculate shipping cost for a given subtotal and zone.
 *
 * @param {number} subtotal — order subtotal in ৳
 * @param {string|null|undefined} shippingZoneId — selected zone ID (null/undefined = no shipping)
 * @param {Array<{id: string, name: string, price: number|string, min_order_amount?: number|string, free_above?: number|string, conditions?: any[]}>} zones
 * @returns {{ cost: number, error: string|null }}
 */
export function calculateShippingCost(subtotal, shippingZoneId, zones) {
  // No zone selected → no shipping charge
  if (!shippingZoneId) {
    return { cost: 0, error: null };
  }

  // Find the matching zone
  const zone = (zones || []).find((z) => z.id === shippingZoneId);
  if (!zone) {
    return { cost: 0, error: "Shipping zone not found" };
  }

  const minOrder = parseFloat(zone.min_order_amount) || 0;
  const freeAbove = parseFloat(zone.free_above) || 0;
  const price = parseFloat(zone.price) || 0;

  // Minimum order amount validation
  if (minOrder > 0 && subtotal < minOrder) {
    return { cost: 0, error: "Minimum order amount not met" };
  }

  // Free shipping threshold
  if (freeAbove > 0 && subtotal >= freeAbove) {
    return { cost: 0, error: null };
  }

  return { cost: price, error: null };
}

export const DEFAULT_STOREFRONT_DELIVERY_FEE = 100;
export const DEFAULT_STOREFRONT_FREE_DELIVERY_THRESHOLD = 2600;

/**
 * Calculate shipping for the public storefront order contract.
 *
 * The legacy storefront displays a standard ৳100 delivery option and does not
 * submit a zone ID. Keep that checkout path consistent with the dashboard
 * while still honoring configured zones when a zone is supplied.
 */
export function calculateStorefrontShippingCost(subtotal, shippingZoneId, zones) {
  if (shippingZoneId) return calculateShippingCost(subtotal, shippingZoneId, zones);

  const cost = DEFAULT_STOREFRONT_FREE_DELIVERY_THRESHOLD > 0 && subtotal >= DEFAULT_STOREFRONT_FREE_DELIVERY_THRESHOLD
    ? 0
    : DEFAULT_STOREFRONT_DELIVERY_FEE;
  return { cost, error: null };
}

// ─── Per-product free delivery ──────────────────────────────────────────────
// Product promos: matching honey products always ship free when present in the
// cart, even mixed with other products. Matched on canonical
// product id (authoritative) with a slug/name fallback for item shapes that
// only carry display names.
export const FREE_DELIVERY_PRODUCT_IDS = [
  "814979aa-8446-429b-917f-e6d94cf6b334",
  "11043874-e90d-4160-bce7-38723b703706",
  "e1b38561-e8f4-4384-81b3-0afffa959d5c",
];
export const FREE_DELIVERY_PRODUCT_SLUGS = ["black-seed-flower-honey", "litchi-flower-honey", "kalojira-mixed"];
const FREE_DELIVERY_PRODUCT_NAME_FRAGMENTS = ["কালোজিরা ফুলের মধু", "লিচু ফুলের মধু", "কালোজিরা মিক্সড"];

/**
 * @param {Array<{productId?: unknown, productName?: unknown}> | null | undefined} orderItems
 * @returns {boolean} true when any item is the free-delivery product.
 */
export function cartHasFreeDeliveryProduct(orderItems) {
  if (!Array.isArray(orderItems) || orderItems.length === 0) return false;
  return orderItems.some((item) => {
    if (!item || typeof item !== "object") return false;
    if (item.productId != null && FREE_DELIVERY_PRODUCT_IDS.includes(String(item.productId))) return true;
    const name = String(item.productName ?? "");
    if (!name) return false;
    const lowered = name.toLowerCase();
    if (FREE_DELIVERY_PRODUCT_SLUGS.some((slug) => lowered.includes(slug))) return true;
    return FREE_DELIVERY_PRODUCT_NAME_FRAGMENTS.some((fragment) => name.includes(fragment));
  });
}
