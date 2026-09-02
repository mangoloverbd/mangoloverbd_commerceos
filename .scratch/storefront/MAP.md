# Wayfinder Map — Storefront Feature

## Destination

Build a multi-merchant storefront for Merchant-Suite. Each merchant gets a handle-based URL (`merchant-suite.online/api/public/v1/:handle/products`), a customizable storefront (logo, colors, name), auto-synced products with multi-variant support and stock tracking, shipping zone configuration, and a COD checkout flow that creates orders in Merchant-Suite. Built by refactoring the existing e-commerce repo into a multi-tenant template.

## Already implemented

- **Public product API:** `GET /api/public/v1/:handle/products`, `/products/:slug`, `/inventory`, `/products/:slug/inventory` — all working with two-tier caching (catalog 60s SWR 1d, inventory 5s SWR 30s), ETag/304, Cache-Tag purging, warm-token bypass.
- **Product variants:** `product_variants` table exists with `attributes: Record<string, string>`, `price_adjustment` (relative to base price), `stock_quantity`. Variant UI (`VariantChip`) in Products page already built.
- **Storefront handle system:** `POST /api/storefront/handle` (claim), `GET /api/storefront/handle` (read). Forward/reverse mapping in `app_settings`.
- **Rate limiting:** Per-IP+handle via Upstash Redis, warm-token bypass for cache re-warming.
- **Public catalog serializer:** Zod-validated `toPublicProduct()` and `toPublicInventoryEntry()` in `server/publicCatalog.js`.

## Notes

- **Domain:** `merchant-suite.online` (not subdomain-based — handle-based path routing)
- **Dedicated storefront repo:** `github.com/mangoloverbd/mangoloverbd_storefront` (originally forked from `github.com/noorkarimmehedi/e-commerce`) — React + Vite storefront with cart, checkout, Meta Pixel/CAPI. Currently single-tenant for Mango Lover BD.
- **Backend:** Express.js (ESM) in `server/index.js`. Supabase PostgreSQL. Service role client bypasses RLS.
- **Multi-tenancy:** Every query scoped by `org_id`. Storefront resolves merchant from handle → `org_id` via `app_settings` forward mapping.
- **Image pipeline:** Planned — `sharp` → WebP + thumbnails → Supabase Storage `product-images` bucket.
- **Design language:** Luxury minimalist. `bg-[#FAFAF8]`, Phosphor Icons `weight="light"`, Geist Sans font.
- **Stack:** React 18 + Vite + TypeScript, Tailwind CSS, shadcn/ui, TanStack Query v5.

## Tickets

| # | Ticket | Status |
|---|---|---|
| 01 | [Storefront Branding Schema + Config API](issues/01-storefront-branding-schema-config-api.md) | ✅ Resolved |
| 02 | [Storefront Order Submission API](issues/02-storefront-order-submission-api.md) | ✅ Resolved |
| 03 | [Dashboard — Online Store Settings Page](issues/03-dashboard-online-store-settings.md) | ✅ Resolved |
| 04 | [Dashboard — Shipping Zone Builder](issues/04-dashboard-shipping-zone-builder.md) | ✅ Resolved |
| 05 | [Image Pipeline (sharp + WebP)](issues/05-image-pipeline-webp.md) | 🟢 Frontier |
| 06 | [Storefront Template Refactor](issues/06-storefront-template-refactor.md) | ✅ Resolved |
| 07 | [Storefront — Product Listing Page](issues/07-storefront-product-listing.md) | 🟢 Frontier |
| 08 | [Storefront — Product Detail + Variant Picker](issues/08-storefront-product-detail-variant-picker.md) | 🟢 Frontier |
| 09 | [Storefront — Cart + Checkout Flow](issues/09-storefront-cart-checkout.md) | 🟢 Frontier |
| 10 | [Storefront — SEO Metadata](issues/10-storefront-seo-metadata.md) | 🟢 Frontier |
| 11 | [Deployment + Vercel Configuration](issues/11-storefront-deployment.md) | 🔴 Blocked by 07, 09, 10 |

## Blocking Graph

```
01 ──→ 03 ──→ 04 ──→ 09 ──→ 11
01 ──→ 06 ──→ 07 ──→ 11
01 ──→ 06 ──→ 08
01 ──→ 06 ──→ 09
01 ──→ 06 ──→ 10 ──→ 11
02 ──→ 09
05 (independent)
```

## Frontier (Takeable now)

These tickets are unblocked and ready to be worked:

1. ~~**01 — Storefront Branding Schema + Config API**~~ ✅ Resolved
2. ~~**02 — Storefront Order Submission API**~~ ✅ Resolved
3. ~~**03 — Dashboard Online Store Settings Page**~~ ✅ Resolved
4. ~~**04 — Dashboard Shipping Zone Builder**~~ ✅ Resolved
5. ~~**06 — Storefront Template Refactor**~~ ✅ Resolved
6. **05 — Image Pipeline (sharp + WebP)** — independent, can run in parallel with anything
7. **07 — Product Listing Page** — unblocked by 06 ✅
8. **08 — Product Detail + Variant Picker** — unblocked by 06 ✅
9. **09 — Cart + Checkout Flow** — unblocked by 06, 02, 04 ✅
10. **10 — SEO Metadata** — unblocked by 06 ✅

## Recommended implementation order

1. **01** (schema + config API) — start first, unblocks 03, 04, 06
2. **02** (order API) — parallel with 01, unblocks 09
3. **05** (image pipeline) — parallel with 01 and 02
4. **03** (dashboard settings) — after 01
5. **06** (template refactor) — after 01, parallel with 03
6. **04** (shipping zones) — after 01 + 03
7. **07** (listing page) — after 06
8. **08** (product detail) — after 06, parallel with 07
9. **10** (SEO) — after 06, parallel with 07/08
10. **09** (cart + checkout) — after 06, 02, 04
11. **11** (deployment) — last, after 07, 09, 10

## Out of scope

- Payment gateway integration (bKash/Nagad/SSLCOMMERZ) — COD only at launch
- Theme editor (drag & drop) — branding only (logo, colors, name)
- Multi-language support — English only at launch
- Custom domain support — handle-based URLs only for now
- App store / extensions — way too early
- Blog / content pages — not needed at launch
- Real-time stock sync via webhooks — stock managed in dashboard, storefront reads on page load
- Product search/filtering — basic grid at launch
- Product categories/collections — flat product list
- Customer accounts — COD doesn't need accounts
- Order tracking — future feature
