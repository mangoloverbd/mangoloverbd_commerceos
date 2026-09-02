# Storefront ↔ Merchant Suite Connection — Design

> **Superseded for new work (2026-08-27):** The repository/data boundary remains historical context, but the cache, stock, image, order, and live-synchronization architecture is replaced by `docs/superpowers/specs/2026-08-27-realtime-storefront-sync-design.md`.

Date: 2026-08-14
Status: Approved by user

## Goal

Connect the e-commerce storefront repo (github.com/mangoloverbd/mangoloverbd_storefront, originally forked from `noorkarimmehedi/e-commerce` and deployed at stepprsbangladesh.vercel.app) to this Merchant Suite (Commerce-os, Supabase `alupmlvmrtrfshnmpfig`) as a **single-storefront, single-tenant** pair. No visual/design changes to the storefront. Product pages are created from the suite's catalog.

## Context

- Storefront currently points at the old deployed suite (`suite.arclabtechnology.com`, Supabase `stieyrpctvgpsszntwfh`) via the deprecated `/api/public/storefronts/...` API (sunset 2026-10-17) with org `da1aecbc-…` that does not exist in this DB.
- This Commerce-os DB has one org — `2a155750-b11a-4ff2-a7ff-4e26daac46ef` — and zero products.
- Storefront home page products are hardcoded in `client/src/pages/home.tsx`; every card links to `/product/stepprs-massage-insoles`.
- Product page (`client/src/pages/product.tsx`) already fetches by slug via `fetchStorefrontProduct`.

## Decisions

1. Target backend: **this Commerce-os repo** (canonical `/api/public/v1/` API).
2. Product source of truth: **seed storefront products into the suite** (user-approved).
3. Tenant: org `2a155750-b11a-4ff2-a7ff-4e26daac46ef`; storefront id = org id.
4. Historical order API key was registered in `app_settings` as `2a155750…:custom_store_api_key`. Its plaintext value has been removed; generate and inject a unique key through the environment if this legacy seed flow is ever used again.
5. Defaults: "special" home cards (Top 10 / Accessories / Bottoms) keep current link behavior (not seeded); insoles-specific PDP sections (features, reels, bundles) render unchanged on all PDPs.

## Changes

### Commerce-os (data only — no server code changes)

One-off idempotent seed script `scripts/seed-storefront.mjs` (service-role from `.env`):

- Insert 9 published products under org `2a155750…`:

| slug | price | image |
|---|---|---|
| stepprs-massage-insoles | 499 | hero-insoles.png |
| linen-baggy-trouser-clean-white | 799 | new1.webp |
| linen-baggy-trouser-earthy-olive | 799 | new2.webp |
| linen-baggy-trouser-black | 799 | new3.webp |
| linen-baggy-trouser-cocoa-brown | 799 | new4.webp |
| black-blazer-dress | 1690 | new1.webp |
| black-high-leggings | 990 | new2.webp |
| clean-white-trouser | 799 | new3.webp |
| cocoa-brown-trouser | 799 | new4.webp |

- Images uploaded to `product-images` bucket at `<orgId>/<productId>/<uuid>.<ext>`; product rows get `image_url` + `product_images` rows.
- Size variants in `product_variants` per home-page card data (trousers 5, leggings 4, etc. — S/M/L/XL/XXL, price_adjustment 0). Insoles: no variants (static bundles live in the storefront).
- Stock: sensible default (50) so items are orderable.
- Upsert by `(org_id, slug)`; safe to re-run.

### Storefront (minimal, zero visual change)

- `client/src/lib/storefront-products.ts`: base URL from `import.meta.env.VITE_MERCHANT_SUITE_URL` + `VITE_STOREFRONT_ID`, path `/api/public/v1/storefronts/:id`; fallback = current values.
- `client/src/pages/home.tsx`: per-product card `Link` hrefs → `/product/<slug>`; hero unchanged.
- `client/src/pages/product.tsx`: bundle grid data-driven — variants (sizes) when present; static 1/2/3-pair bundles for `stepprs-massage-insoles`; single "Default" option at product price otherwise. Styling untouched.
- `client/src/lib/generated-storefront-products.ts`: regenerated to seeded catalog (offline fallback).
- `server/order-service.ts`: webhook URL + key from env (`MERCHANT_SUITE_URL`, `CUSTOM_ORDERS_API_KEY`), fallback = current values.
- `.env.example`: document new vars.

## Order flow

Storefront checkout → `POST {MERCHANT_SUITE_URL}/api/custom-orders/webhook` (`x-api-key`) → existing handler resolves org via `app_settings`, inserts into `orders` (`source: custom_store`), sequential order number, confirmation SMS. No backend changes.

## Verification

1. `npm run dev` Commerce-os (port 24678) → `curl /api/public/v1/storefronts/2a155750…/products` returns 9 products.
2. Storefront dev with env pointing at localhost:24678: home cards link per-product; each PDP loads name/price/image/description from suite; size selector shows for fashion items; insoles PDP unchanged with static bundles.
3. Place a test order via OrderDialog → row appears in `orders` with `source=custom_store` and sequential order number.
4. Storefront `npm run check` (tsc) passes.
