# 06 — Storefront Template Refactor (e-commerce repo)

**What to build:** The existing single-tenant e-commerce storefront (`github.com/noorkarimmehedi/e-commerce`, built for Stepprs Bangladesh) is refactored into a multi-tenant template that any Merchant-Suite merchant can use. After this ticket, the storefront fetches all data from the Merchant-Suite public API based on a configurable handle, and renders the correct merchant's branding and products.

**Blocked by:** 01 — Storefront Branding Schema + Config API ✅

**Status:** ✅ Resolved

- [x] Strip all hard-coded Stepprs Bangladesh data (store name, logo, colors, products, API URLs) from the e-commerce repo
- [x] Handle configured via `VITE_STOREFRONT_HANDLE` environment variable at build/deploy time
- [x] API base URL configured via `VITE_API_URL` environment variable (points to `merchant-suite.online`)
- [x] On app load, fetch config from `GET /api/public/v1/${handle}/config` — apply branding (store name, logo, colors) to the UI
- [x] Product data fetched from `GET /api/public/v1/${handle}/products` (catalog) and `/inventory` (stock)
- [x] Handle invalid/unclaimed handle gracefully — show a "Store not found" 404 page
- [x] Local development works with `?handle=xxx` query parameter override (takes precedence over env var)
- [x] Existing cart, checkout UI, and Meta Pixel code preserved and functional
- [x] Storefront app builds successfully with `npm run build`
- [x] README updated with setup instructions (env vars, local dev, deployment)
