# 03 — Dashboard "Online Store" Settings Page

**What to build:** A merchant can configure their storefront branding from the Merchant-Suite dashboard. After this ticket, the dashboard has an "Online Store" sidebar item and a settings page where the merchant sets their store name, logo, colors, contact info, social links, SEO templates, and toggles the storefront on/off.

**Blocked by:** 01 — Storefront Branding Schema + Config API

**Status:** resolved

- [x] New sidebar item "Online Store" in `AppSidebar.tsx` with `Storefront` Phosphor icon (`weight="light"`), admin-only
- [x] New route `/online-store` in `App.tsx` wrapped in `ProtectedRoute` + admin guard
- [x] New page `OnlineStore.tsx` following existing design language (`bg-[#FAFAF8]`, Geist Sans, Phosphor Icons)
- [x] Store info section: store name input, tagline input, logo upload (triggers existing image upload endpoint), contact phone, contact email
- [x] Social links section: Facebook URL, Instagram URL, TikTok URL
- [x] Appearance section: primary color picker (hex input), background color picker (hex input)
- [x] SEO defaults section: title template input (supports `{product_name}` and `{store_name}` placeholders), description template input
- [x] Storefront toggle switch (enabled/disabled) — writes `enabled` boolean to `storefront_settings`
- [x] Public URL display: shows the merchant's storefront URL (`merchant-suite.online/api/public/v1/:handle/products`) with copy-to-clipboard (reads handle from existing `GET /api/storefront/handle`)
- [x] Settings load on page mount via TanStack Query, save via mutation with toast feedback
- [x] Settings persist across reloads (read from `storefront_settings` via authenticated API)
- [x] New authenticated API routes: `GET /api/storefront/settings` and `POST /api/storefront/settings` (scoped by org_id)
