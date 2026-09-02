# Storefront Feature — Spec

> **Status:** ready-for-agent
> **Feature directory:** `.scratch/storefront/`
> **Wayfinder Map:** `.scratch/storefront/MAP.md`
> **Tickets:** `.scratch/storefront/issues/`

---

## Problem Statement

Bangladeshi e-commerce merchants using Merchant-Suite currently sell through Facebook Messenger, WhatsApp, and Instagram DMs. Every order requires a manual back-and-forth conversation — a customer sends a message, the merchant replies with product details, negotiates price, collects a delivery address, and then manually enters the order into Merchant-Suite. This is slow, doesn't scale, and means merchants miss orders outside of business hours.

Merchants want a professional online store where customers can browse products, select variants (size, color), and place orders 24/7 — without the merchant needing to be online. They also want something that looks credible when shared on Facebook and WhatsApp, with proper rich previews (Open Graph tags) instead of plain links.

No existing Shopify-like solution is built for the Bangladeshi market with COD-first checkout, local courier integration (Steadfast, Pathao), and the social commerce workflows these merchants already use.

## Solution

Add a **multi-merchant storefront** to Merchant-Suite. Each merchant gets:

- A handle-based URL: `merchant-suite.online/api/public/v1/:handle/products` (e.g., `/api/public/v1/stepprs/products`)
- A customizable storefront (store name, logo, primary color, background color)
- Products auto-synced from their Merchant-Suite product catalog, with multi-variant support (size, color, etc.) and per-variant stock tracking
- Shipping zone configuration (Inside Dhaka, Outside Dhaka, etc.)
- A COD checkout flow that creates orders directly in the Merchant-Suite dashboard

The storefront is a **separate React app** (`github.com/mangoloverbd/mangoloverbd_storefront`, originally forked from `github.com/noorkarimmehedi/e-commerce`, built for one merchant) deployed on Vercel. It fetches all data from the **public API** on the existing Merchant-Suite Express backend — no direct database access.

**Already built:** The public product API (catalog + inventory endpoints), two-tier caching, rate limiting, storefront handle claiming, product variants table, and variant management UI are all implemented and working.

**Still needed:** Storefront branding configuration (name, colors, logo, shipping zones), order submission endpoint, "Online Store" dashboard settings page, image pipeline (WebP conversion), storefront template refactor, storefront pages, and deployment.

## User Stories

### Merchant (store owner)

1. As a merchant, I want to enable my storefront with a single toggle, so that I can go live when I'm ready.
2. As a merchant, I want my storefront to have a unique subdomain, so that customers can find me at a memorable URL.
3. As a merchant, I want to set my store name and tagline, so that my storefront feels like my brand.
4. As a merchant, I want to upload a logo, so that my storefront is visually branded.
5. As a merchant, I want to set a primary color and background color, so that my storefront matches my brand identity.
6. As a merchant, I want to add a contact phone and email, so that customers can reach me.
7. As a merchant, I want to link my Facebook and Instagram pages, so that social links appear in my storefront footer.
8. As a merchant, I want my products to appear on my storefront automatically when I publish them in the dashboard, so that I don't have to manage two separate catalogs.
9. As a merchant, I want to define product variants (e.g., Color: Red, Blue; Size: S, M, L), so that customers can pick the exact version they want.
10. As a merchant, I want each variant to have its own price, stock count, and optional image, so that I can manage inventory at the variant level.
11. As a merchant, I want to set a compare-at price for variants, so that I can show sale pricing (e.g., ৳1,200 ~~৳1,500~~).
12. As a merchant, I want to bulk-generate variant combinations from option lists (Color × Size), so that I don't have to create each variant manually.
13. As a merchant, I want to configure shipping zones (e.g., "Inside Dhaka" = ৳60, "Outside Dhaka" = ৳120), so that delivery charges are calculated correctly at checkout.
14. As a merchant, I want to set free shipping thresholds (e.g., free above ৳1,000), so that I can incentivize larger orders.
15. As a merchant, I want to preview my storefront before going live, so that I can verify everything looks right.
16. As a merchant, I want orders placed on my storefront to appear in my Merchant-Suite dashboard immediately, so that I can start fulfilling them right away.
17. As a merchant, I want storefront orders to be tagged with `source: "storefront"`, so that I can distinguish them from social inbox orders.
18. As a merchant, I want stock to decrement automatically when an order is placed, so that I don't oversell.
19. As a merchant, I want to disable my storefront without deleting my products, so that I can go offline temporarily.
20. As a merchant, I want my storefront to have auto-generated SEO metadata (title, description, Open Graph tags), so that links look good when shared on Facebook and WhatsApp.

### Customer (storefront visitor)

21. As a customer, I want to land on a merchant's storefront via their subdomain, so that I can browse their products.
22. As a customer, I want to see a product grid with images, names, and prices, so that I can quickly scan what's available.
23. As a customer, I want to see "Out of stock" badges on products that are unavailable, so that I don't waste time on items I can't buy.
24. As a customer, I want to click a product and see a detail page with a large image, description, and variant picker, so that I can make an informed purchase decision.
25. As a customer, I want to select color via swatches and size via buttons, so that choosing variants feels natural.
26. As a customer, I want to see the price update when I select a variant, so that I know exactly what I'm paying.
27. As a customer, I want to see stock availability (e.g., "In stock — 10 left"), so that I know if I should buy now.
28. As a customer, I want to add a product to my cart with a quantity selector, so that I can buy multiple units.
29. As a customer, I want to see my cart with all items, quantities, and prices, so that I can review before checkout.
30. As a customer, I want to update quantities or remove items from my cart, so that I can adjust my order.
31. As a customer, I want to see shipping cost estimated in my cart, so that I know the total before checkout.
32. As a customer, I want to check out with just my name, phone, and address (no account required), so that checkout is fast and frictionless.
33. As a customer, I want to select my delivery zone from a dropdown, so that shipping is calculated correctly.
34. As a customer, I want to pay cash on delivery, so that I don't need a card or mobile banking to order.
35. As a customer, I want to see an order confirmation page with my order number, so that I know my order was placed successfully.
36. As a customer, I want to receive a confirmation SMS after placing an order, so that I have a record of my purchase.
37. As a customer, I want the storefront to load fast on mobile (WebP images, lazy loading), so that I can shop on a slow connection.
38. As a customer, I want to see rich previews when a storefront link is shared on Facebook or WhatsApp, so that I know what I'm clicking on.
39. As a customer, I want to continue shopping after adding to cart, so that I can buy multiple products.
40. As a customer, I want the storefront to be responsive (2 columns on mobile, 4 on desktop), so that it works on any device.

### Merchant-Suite Admin (platform operator)

41. As an admin, I want each merchant's storefront data isolated by `org_id`, so that no merchant can see another's data.
42. As an admin, I want the public API to be rate-limited per merchant, so that one merchant can't degrade performance for others.
43. As an admin, I want image uploads to be auto-converted to WebP, so that storefronts load fast without merchants needing to optimize images.
44. As an admin, I want thumbnail variants generated automatically (small, medium, large), so that the storefront can load appropriate sizes.
45. As an admin, I want storefront orders to go through the same fraud checks as social inbox orders, so that fraud detection is consistent.

## Implementation Decisions

### Seams

The feature is organized around 4 seams. Each seam is a clear boundary where behavior can be tested independently.

1. **Public Storefront API** — already exists under `/api/public/v1/:handle/`. Auth-free (no JWT), rate-limited per IP+handle, with two-tier caching (catalog + inventory) and Cloudflare Cache-Tag purging. The storefront app talks exclusively through this seam. **Still needed:** config endpoint (branding, shipping zones) and order submission endpoint.
2. **Schema** — `product_variants` table already exists (uses `attributes: Record<string, string>` for flexible variant options, `price_adjustment` relative to base price). **Still needed:** `storefront_settings` table for branding and shipping zone configuration.
3. **Image pipeline** — image upload accepts JPEG/PNG/WebP already. **Still needed:** `sharp`-based auto-conversion to WebP + thumbnail generation on upload.
4. **Dashboard storefront config surface** — **still needed:** new "Online Store" route and settings page where admins configure branding, shipping zones, and toggle the storefront. Writes to `storefront_settings`.

### Storefront template

The storefront is a **separate React + Vite + TypeScript app** (`github.com/mangoloverbd/mangoloverbd_storefront`, originally forked from `github.com/noorkarimmehedi/e-commerce` / Stepprs Bangladesh single-tenant storefront). It is not part of the Merchant-Suite monorepo — it lives in its own repo and deploys independently on Vercel.

The refactor strips all hard-coded merchant data and replaces it with runtime config fetched from the public API. The subdomain is read from the `Host` header (production) or a query parameter (local dev).

### Handle-based routing (already implemented)

- **Handle claiming:** Merchants claim a unique handle via `POST /api/storefront/handle` (stored as forward/reverse mapping in `app_settings`).
- **Public URL:** `https://PUBLIC_DOMAIN/api/public/v1/:handle/products` — the handle is the merchant's public storefront identifier.
- **Merchant resolution:** The storefront app reads the handle from its configuration (set at deploy time or via environment variable), then calls the public API to fetch branding and products. If the handle is invalid, the storefront shows a 404.
- **Local development:** Use the handle directly in API calls — no subdomain simulation needed.

### Database schema

**Existing table: `product_variants`** (already implemented)
- Columns: `id`, `org_id`, `product_id` (FK → `products.id`), `attributes` (JSONB — flexible key-value pairs like `{"Color": "Red", "Size": "M"}`), `cog`, `stock_quantity`, `price_adjustment` (relative to product's `selling_price`), `created_at`
- Variant pricing: `base price + price_adjustment` (not absolute per-variant prices)
- Variant UI: `VariantChip` component in Products page with click-to-edit popover — already built

**New table: `storefront_settings`**
- Columns: `id`, `org_id` (UNIQUE), `enabled`, `store_name`, `tagline`, `logo_url`, `favicon_url`, `primary_color`, `background_color`, `font_family`, `contact_phone`, `contact_email`, `social_facebook`, `social_instagram`, `social_tiktok`, `seo_title_template`, `seo_description_template`, `shipping_zones` (JSONB), `created_at`, `updated_at`
- One row per org. `org_id` is UNIQUE.

**`shipping_zones` JSON structure:**
```json
[
  {
    "id": "zone_1",
    "name": "Inside Dhaka",
    "price": 60,
    "min_order_amount": 0,
    "free_above": 1000,
    "conditions": []
  }
]
```

**Backward compatibility migration:** Existing products without variants get a single default variant (price = product's `selling_price`, stock = 999, published = product's `published`). This ensures the existing product catalog works with the new variant-aware API without manual intervention.

### Public API endpoints

All endpoints are unauthenticated (no JWT). Merchant is resolved by the `:handle` URL parameter (claimed via `POST /api/storefront/handle`). Every query is scoped by the resolved `org_id`.

**Already implemented:**
- `GET /api/public/v1/:handle/products` — all published products with variants, images (catalog, cacheable: s-maxage=60, SWR=1d)
- `GET /api/public/v1/:handle/products/:slug` — single product detail
- `GET /api/public/v1/:handle/inventory` — full stock map (short TTL: s-maxage=5, SWR=30s)
- `GET /api/public/v1/:handle/products/:slug/inventory` — per-product stock
- Legacy unversioned routes (`/api/public/storefronts/:id/...`) with deprecation headers (Sunset: Oct 2026)

**Still needed:**
- `GET /api/public/v1/:handle/config` — storefront branding (store name, logo, colors, contact info, social links) and shipping zones
- `POST /api/public/v1/:handle/orders` — submit an order (customer name, phone, address, items with variant IDs and quantities, shipping zone ID, notes)

**Order submission logic:**
1. Validate all variant IDs belong to the merchant's `org_id`
2. Check stock for each variant (reject if any variant has insufficient stock)
3. Calculate subtotal (variant price × quantity for each line item)
4. Look up shipping zone price from `storefront_settings.shipping_zones`
5. Apply free shipping if subtotal exceeds the zone's `free_above` threshold
6. Total = subtotal + shipping
7. Insert order into `orders` table with `source: "storefront"`
8. Decrement stock for each variant
9. Return order summary (order ID, total, shipping, confirmation message)
10. Send confirmation SMS in background (non-blocking)

### Image pipeline

- **Dependency:** `sharp` (Node.js image processing library)
- **On upload:** Convert original JPEG/PNG to WebP (quality: 80). Generate 3 thumbnail sizes: small (100px), medium (400px), large (800px). All outputs are WebP.
- **Storage:** Supabase Storage `product-images` bucket. Originals, WebP versions, and thumbnails stored in organized paths per product.
- **API response:** Returns WebP URLs (with original URL as fallback for older browsers).
- **Variant images:** Each variant can optionally have its own image URL. If not set, the product's primary image is used.

### Storefront pages

- **Product listing** (`/` or `/products`): responsive grid (2 cols mobile, 3 tablet, 4 desktop), product cards with image/name/price, "Out of stock" badges, loading skeletons, empty state.
- **Product detail** (`/product/:id`): large image with gallery thumbnails, variant picker (color swatches as circles, size as buttons), price updates on variant selection, stock indicator, quantity selector (max = stock), "Add to Cart" button (disabled when out of stock), description section.
- **Cart** (`/cart`): line items with image/name/variant/price/quantity controls, remove button, subtotal/shipping/total, "Proceed to Checkout" and "Continue Shopping" buttons, empty cart state.
- **Checkout** (`/checkout`): contact info form (name, phone), delivery address form, shipping zone dropdown (from merchant config), order summary with line items, COD-only payment, "Place Order" button → POST to public API.
- **Order success** (`/order/:orderId`): order number, summary, "What happens next" explanation, navigation links.

### Dashboard changes

- **New sidebar item:** "Online Store" with `Storefront` Phosphor icon (`weight="light"`), admin-only.
- **New route:** `/online-store` → `OnlineStore.tsx` page.
- **OnlineStore page sections:** Store info (name, logo upload, tagline, contact), Appearance (primary color, background color, font), Storefront URL (read-only subdomain display + "Preview Storefront" button), SEO defaults (title template, description template), Shipping & Delivery (zone builder UI), Storefront toggle.
- **Products page changes:** Variant management already exists — `VariantChip` component with click-to-edit popover for stock and COG. Still needed: option builder (add option name + values), auto-generated variant combination table, per-variant SKU and image fields.

### Design language

All dashboard UI follows the existing Merchant-Suite design system:
- Background: `bg-[#FAFAF8]`
- Labels: `text-[8px] font-medium tracking-[0.3em] text-black uppercase`
- Values: `text-2xl font-light`
- Icons: Phosphor Icons with `weight="light"`
- Font: Geist Sans variable
- Currency: `৳` (taka symbol)
- Animations: Framer Motion
- UI components: shadcn/ui

The storefront template follows its own design (from the e-commerce repo) but respects the merchant's configured colors.

## Testing Decisions

### What makes a good test

Tests should verify **external behavior**, not implementation details. For the storefront feature, this means:
- API tests: verify response shapes, status codes, and side effects (stock decrement, order creation) — not internal query construction.
- Schema tests: verify that migration logic correctly creates default variants for existing products.
- Image pipeline tests: verify that uploaded images produce correct WebP output and thumbnail sizes — not internal `sharp` call sequences.
- Dashboard tests: verify that saving storefront settings persists and is readable — not component internals.

### Modules to test

1. **New public API routes** (highest priority — only the new endpoints, existing ones are already tested):
   - `GET /api/public/v1/:handle/config` returns correct branding and shipping zones
   - `POST /api/public/v1/:handle/orders` creates an order, decrements stock, returns order summary
   - `POST /api/public/v1/:handle/orders` rejects when stock is insufficient
   - `POST /api/public/v1/:handle/orders` rejects when variant IDs don't belong to the merchant
   - Shipping cost calculation with free-above threshold

2. **Schema** (high priority — only the new table):
   - `storefront_settings` enforces one row per `org_id` (UNIQUE constraint)
   - Shipping zones JSONB serializes/deserializes correctly

3. **Image pipeline** (medium priority):
   - JPEG upload produces WebP output
   - PNG upload produces WebP output
   - Thumbnails are generated at correct sizes (100px, 400px, 800px width)
   - Original image is preserved as fallback

4. **Dashboard storefront settings** (medium priority):
   - Saving storefront settings persists all fields
   - Shipping zone builder correctly serializes to JSONB
   - Storefront toggle (enabled/disabled) persists
   - Logo upload triggers image pipeline

### Prior art

- Existing API tests (if any) in `src/test/` use Vitest + the Express server.
- Supabase queries can be tested against a local Supabase instance or mocked with MSW.
- Image pipeline tests can use fixture images (small JPEG/PNG files) and verify output buffers.

## Out of Scope

The following are explicitly **not** part of this feature:

- **Payment gateway integration** (bKash, Nagad, SSLCOMMERZ) — COD only at launch. No card processing, no mobile financial services.
- **Theme editor** (drag-and-drop page builder) — branding only: logo, colors, store name. No layout customization.
- **Multi-language support** — English (and Bangla product content) only. No i18n framework.
- **Custom domain support** — subdomains only (`merchant.merchant-suite.online`). No CNAME mapping.
- **App store / extensions** — no plugin architecture.
- **Blog / content pages** — product catalog only.
- **Real-time stock sync** — stock is read on page load, not pushed via webhooks. Dashboard is the source of truth.
- **Product search and filtering** — basic product grid at launch. Search and category filtering are future features.
- **Product categories / collections** — flat product list at launch.
- **Customer accounts** — COD doesn't need accounts. No login, no order history.
- **Order tracking** — future feature. Customers receive SMS confirmation only.
- **Meta Pixel / CAPI events** — the existing e-commerce repo has this, but it's out of scope for the initial storefront launch. Can be ported later.

## Further Notes

- **Multi-tenancy is non-negotiable.** Every query on `product_variants`, `storefront_settings`, and orders from the storefront must be scoped by `org_id`. The public API resolves `org_id` from the `:handle` parameter via the forward mapping in `app_settings` (`storefront_handle:<handle>` → orgId). Missing `org_id` filters cause data leakage between merchants — this is the #1 bug class to avoid.
- **Significant infrastructure already exists.** The public product/inventory API, two-tier caching (catalog 60s SWR 1-day, inventory 5s SWR 30s), ETag/304 support, Cache-Tag purging via Cloudflare, warm-token bypass, rate limiting (per IP+handle), handle claiming, product variants table, and variant management UI are all implemented. New work builds on top of this — do not duplicate or refactor existing systems.
- **The dedicated storefront repo** (`github.com/mangoloverbd/mangoloverbd_storefront`, originally forked from `github.com/noorkarimmehedi/e-commerce` built for Stepprs Bangladesh) is the single-tenant Mango Lover BD storefront. It fetches all data via runtime API calls using the handle. The cart, checkout, and Meta Pixel code already work.
- **Image pipeline adds `sharp` as a new dependency.** This is a native Node.js module — it needs to be in the server's `package.json` and may require platform-specific binaries for deployment. Verify deployment compatibility before merging.
- **Shipping zones are stored as JSONB** in `storefront_settings`. This is intentionally flexible — merchants can define any number of zones with any conditions. The structure may evolve (e.g., weight-based shipping) without schema changes.
- **Order confirmation SMS** is listed as a background task in the order submission flow. The existing SMS infrastructure (if any) should be reused. If none exists, this can be deferred to a follow-up ticket.
- **The storefront app deploys separately on Vercel** from the Merchant-Suite dashboard. The handle is configured via environment variable at deploy time. No wildcard subdomain routing needed.
- **Stock decrement is optimistic** — the order is created and stock is decremented in the same transaction. If two customers check out the same last unit simultaneously, one will fail with a stock error. This is acceptable for launch; a reservation-based system can be added later if needed.
