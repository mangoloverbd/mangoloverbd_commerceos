# 02 — Storefront Order Submission API

**What to build:** A customer can place an order from a merchant's storefront. After this ticket, `POST https://merchant-suite.online/api/public/v1/:handle/orders` with cart items and customer info creates an order that appears in the merchant's Merchant-Suite dashboard with `source: "storefront"`.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Public endpoint `POST /api/public/v1/:handle/orders` accepts: `{ customerName, phone, address, items: [{ variantId, quantity }], shippingZoneId, notes }`
- [x] Resolves handle → org_id via existing forward mapping in `app_settings`
- [x] Validates all variant IDs belong to the merchant's `org_id` (rejects cross-tenant variant IDs)
- [x] Checks stock for each variant via existing `product_variants` table — rejects with clear error if any variant has insufficient stock
- [x] Calculates subtotal from variant prices (base `selling_price` + `price_adjustment` per existing schema)
- [x] Looks up shipping zone price from `storefront_settings.shipping_zones` JSONB (graceful fallback if `storefront_settings` doesn't exist yet — use a hardcoded default or return shipping as 0)
- [x] Applies free shipping if subtotal exceeds the zone's `free_above` threshold
- [x] Inserts order into `orders` table with `source: "storefront"`, customer details, line items, and total
- [x] Decrements `stock_quantity` for each variant (optimistic — same transaction as order creation)
- [x] Returns: `{ success: true, orderId, total, shipping, message }`
- [x] Runs phone number through `normalizeBdPhone()` before storing
- [x] Route uses the existing `rateLimitPublicRead` middleware
- [x] All queries scoped by `org_id`

## Resolution

### Changes made to `server/index.js`

**1. Migration — `source` column on orders** (line ~9859)
- Added `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source TEXT` to the storefront settings migration
- Enables `source: "storefront"` to distinguish storefront orders from Shopify and custom store orders

**2. Order submission handler** — `handlePublicHandleOrderSubmit()` (line ~8482)
- Validates: customer name (required), phone (normalized via `normalizeBdPhone()`), address (required), items array (non-empty)
- Fetches variants + parent products in two queries, validates all belong to merchant's `org_id`
- Stock check per variant — rejects with clear error including product name and attributes
- Pricing: `unitPrice = product.selling_price + variant.price_adjustment`, `subtotal = sum(unitPrice * qty)`
- Shipping: looks up zone from `storefront_settings.shipping_zones`, applies `free_above` threshold
- Order number: `#S<seq>` (S = Storefront) using existing `getNextManualOrderSeq()`
- `shopify_order_id`: large negative random number (existing pattern for non-Shopify orders)
- Product field: summary string like "T-Shirt (Red, M) x2, Jeans (32) x1"
- Stock decrement: updates `product_variants.stock_quantity` for each variant after order insert
- Cache purge: calls `purgeProductCache()` to invalidate inventory cache

**3. Route registration** (line ~8763)
- `POST /api/public/v1/:handle/orders` with `rateLimitPublicRead` middleware

### New public route inventory

```
GET  /api/public/v1/:handle/config     (ticket 01)
GET  /api/public/v1/:handle/products   (existing)
GET  /api/public/v1/:handle/products/:slug  (existing)
GET  /api/public/v1/:handle/inventory  (existing)
GET  /api/public/v1/:handle/products/:slug/inventory  (existing)
POST /api/public/v1/:handle/orders     ← NEW
```
