# Litchi Flower Honey Free Delivery Design

## Goal

Give `লিচু ফুলের মধু | Litchi Flower Honey` free delivery in the storefront and preselect its `২ কেজি` variant, while leaving every other product's delivery and default variant behavior unchanged.

## Design

The canonical product is identified by slug `litchi-flower-honey` and product ID `11043874-e90d-4160-bce7-38723b703706`. The Merchant-Suite public order handler will add this product to the existing product-specific free-delivery allowlist. Shipping is set to zero after validated order items are resolved, so the persisted `orders.delivery_rate` and checkout total cannot disagree with the storefront display. The existing Black Seed Flower Honey rule remains in the same allowlist.

The storefront will extend its existing free-delivery helper with the same Litchi slug, product ID, and Bengali name fallback. The shared generic product page will choose the `২ কেজি` bundle by slug when that option is available, otherwise falling back to the first available bundle. Other slugs continue to use the first bundle.

## Scope and behavior

- A Litchi-only or mixed cart containing Litchi Honey receives `৳0` delivery.
- Orders without Litchi Honey or the existing Black Seed Honey keep normal shipping rules.
- The free-delivery display copy names Litchi Honey for this product-specific promotion.
- The generic product page only changes the initial selection for `litchi-flower-honey`.
- The backend remains the source of truth for the actual saved delivery charge.

## Verification

Add unit tests for the storefront helper and default bundle selection, plus Merchant-Suite shipping tests covering Litchi-only, mixed, and non-target carts. Run both repositories' focused tests, type/build checks, and lint where available.
