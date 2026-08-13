# 07 — Storefront Product Listing Page

**What to build:** A customer visiting the storefront sees all the merchant's published products in a responsive grid. After this ticket, the storefront's home/listing page renders product cards with images, names, prices, and stock status — all fetched from the Merchant-Suite public API.

**Blocked by:** 06 — Storefront Template Refactor

**Status:** ready-for-agent

- [ ] Product grid renders all published products fetched from `GET /api/public/v1/:handle/products`
- [ ] Responsive layout: 2 columns on mobile, 3 on tablet, 4 on desktop
- [ ] Product cards show: primary image, product name, price (or price range if variants have different prices)
- [ ] "Out of stock" badge/overlay on products where all variants have zero stock (using `available` flag from catalog API)
- [ ] Loading skeleton displayed while products are fetching
- [ ] Empty state rendered when the merchant has no published products ("No products available yet")
- [ ] Click on product card navigates to product detail page (`/product/:slug`)
- [ ] Stock status checked via inventory API (`GET /api/public/v1/:handle/inventory`) for accurate real-time availability
- [ ] Store branding (name, logo, colors from config API) applied to header/navigation
- [ ] Images use lazy loading for performance
