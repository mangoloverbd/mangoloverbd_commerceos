// Pure warehouse-routing helpers. No database access -- callers pass in lookup
// maps so this module stays unit-testable (same pattern as shippingCalculation.js).

function lookupProduct(item, productsById, productsByName) {
  if (item.productId && productsById[item.productId]) return productsById[item.productId];
  const raw = item.productName ?? item.product;
  const name = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (name && productsByName[name]) return productsByName[name];
  return null;
}

export function parseOptionalWeightKg(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;

  const weight = Number(value);
  if (!Number.isFinite(weight) || weight < 0) {
    const error = new Error("Weight must be a non-negative number");
    error.statusCode = 400;
    throw error;
  }

  return Math.round(weight * 1000) / 1000;
}

// Returns the warehouse for an order: the first resolvable product's warehouse,
// otherwise the org's default warehouse, otherwise null.
export function resolveWarehouseId({ items, productsById, productsByName, defaultWarehouseId }) {
  for (const item of items || []) {
    const product = lookupProduct(item, productsById || {}, productsByName || {});
    if (product?.warehouse_id) return product.warehouse_id;
  }
  return defaultWarehouseId || null;
}

// Returns the order's total weight in kg, or null if ANY item's weight is unknown.
// A partially summed weight would look correct on a courier document, so we
// report nothing instead.
export function computeOrderWeightKg({ items, variantsById, productsById }) {
  const list = items || [];
  if (list.length === 0) return null;

  let total = 0;
  for (const item of list) {
    const variant = item.variantId ? (variantsById || {})[item.variantId] : null;
    const productId = item.productId || variant?.product_id;
    const product = productId ? (productsById || {})[productId] : null;

    const unit = variant?.weight_kg ?? product?.weight_kg ?? null;
    if (unit === null || unit === undefined) return null;

    const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
    total += Number(unit) * quantity;
  }
  return Math.round(total * 1000) / 1000;
}
