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
