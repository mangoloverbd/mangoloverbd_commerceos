# Free Delivery for Black Seed Flower Honey — Design

> Status: approved by merchant 2026-09-17
> Scope: one-product promo, hardcoded allowlist, no schema change

## Problem

Product `কালোজিরা ফুলের মধু | Black Seed Flower Honey`
(`id 814979aa-8446-429b-917f-e6d94cf6b334`, `slug black-seed-flower-honey`, ৳700)
must have delivery charge ৳0. All other products keep current behavior
(৳100 standard, free at/above ৳2600).

Confirmed rule: free delivery when the cart **contains** this honey,
even mixed with other products.

## Findings

- Merchant-Suite backend (`server/shippingCalculation.js` +
  `handlePublicHandleOrderSubmit` in `server/index.js`) is authoritative for
  `delivery_rate` / `total`. No `shippingZoneId` is sent by the generic
  product checkout, so it falls back to ৳100 / 2600-threshold.
- Storefront (`mangoloverbd_storefront`, `order-dialog.tsx`) hardcodes the
  ৳100 display + 2600-threshold Free UI. Backend-only fix would show ৳100
  then charge ৳0 — must fix display too.
- Review-approve path (`approveHeldProtectionReview`) recalculates shipping
  and needs the same override.

## Decision

Approach 1 (approved): hardcoded allowlist constant in both repos.
Rejected: per-product DB flag (heavier: migration, PostgREST cache, public
API zod-strict change, dashboard UI — overkill for one promo) and
backend-only (UX mismatch).

## Changes

### Merchant-Suite (`mangoloverbd_commerceos`)

- `server/shippingCalculation.js`: add `FREE_DELIVERY_PRODUCT_IDS` /
  `FREE_DELIVERY_PRODUCT_SLUGS` constants + `cartQualifiesForFreeProductDelivery(orderItems)`
  helper (matches on productId or product slug/name, case-insensitive).
- `server/index.js` `handlePublicHandleOrderSubmit`: after building
  `orderItems` (which already has `productId`/`productName`), if helper
  matches → `shipping = 0`, skip zone/threshold calc.
- `server/index.js` `approveHeldProtectionReview`: same override after
  subtotal (fetch product names already available via `productMap`).
- Tests: extend `src/test/shippingCalculation.test.ts` (helper + override
  cases: only-honey, mixed cart, non-honey unchanged).

### Storefront (`mangoloverbd_storefront`)

- `client/src/components/order-dialog.tsx`: add same allowlist; extend
  `OrderDialogBundle` with optional `productSlug`/`productId`; treat
  `isFreeProductDelivery` same as `qualifiesForFreeDelivery` (show Free UI,
  default `deliveryCharge` 0).
- `client/src/pages/product.tsx`: pass slug/id into `orderBundle`.
- Tests: extend order tests for free-display case.

## Data flow

Checkout bundle (with product id/slug) → storefront shows ৳0 Free →
POST `/api/orders` (`deliveryCharge: 0`, `items: [{productId, variantId}]`)
→ storefront server forwards items to
`POST /api/public/v1/:handle/orders` → backend re-validates variants,
overrides shipping to 0 when honey present, stores `delivery_rate: 0`.

## Error handling / guards

- Stock, phone, address, protection (review/block) unchanged.
- Non-honey carts: behavior identical (৳100, 2600 threshold, zone pricing).
- `org_id` guard preserved; no client-supplied org/tenant.
- No secrets touched.

## Testing

- `npm test shippingCalculation` + new cases in Merchant-Suite.
- Storefront order/order-dialog tests.
- Manual: test order with only honey (expect ৳0), honey + other (expect ৳0),
  other-only (expect ৳100). Verify `delivery_rate` in dashboard orders.
