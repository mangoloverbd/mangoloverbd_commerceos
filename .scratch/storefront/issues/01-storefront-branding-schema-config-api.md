# 01 — Storefront Branding Schema + Config API

**What to build:** A merchant's storefront branding data (store name, logo, colors, contact info, social links) is stored in the database and publicly accessible via the existing handle-based API. After this ticket, `curl https://merchant-suite.online/api/public/v1/:handle/config` returns the merchant's full branding configuration.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] New `storefront_settings` table with: `org_id` (UNIQUE), `enabled`, `store_name`, `tagline`, `logo_url`, `favicon_url`, `primary_color`, `background_color`, `font_family`, `contact_phone`, `contact_email`, `social_facebook`, `social_instagram`, `social_tiktok`, `seo_title_template`, `seo_description_template`, `shipping_zones` (JSONB), `created_at`, `updated_at`
- [x] Public endpoint `GET /api/public/v1/:handle/config` resolves handle → org_id via the existing forward mapping in `app_settings`, then returns storefront branding
- [x] Response shape: `{ storeName, tagline, logoUrl, primaryColor, backgroundColor, fontFamily, contactPhone, contactEmail, socialLinks: { facebook, instagram, tiktok }, shippingZones: [...] }`
- [x] Returns 404 for invalid or unclaimed handles
- [x] All queries scoped by `org_id` — no cross-tenant data leakage
- [x] Route uses the existing `rateLimitPublicRead` middleware
- [x] Migration: table creation is idempotent (`CREATE TABLE IF NOT EXISTS`)

## Resolution

### Changes made to `server/index.js`

**1. Migration function** — `migrateStorefrontSettingsTable()` (line ~9643)
- Creates `storefront_settings` table with `CREATE TABLE IF NOT EXISTS`
- Adds index on `org_id`
- Sends `NOTIFY pgrst, 'reload schema'` to refresh PostgREST cache
- Registered in both startup paths: HTTP server (line ~9980) and serverless cold-start (line ~9995)

**2. Public config endpoint** — `GET /api/public/v1/:handle/config` (line ~8584)
- Handler: `handlePublicHandleConfig()` (line ~8443)
- Loader: `loadPublicStorefrontConfig(orgId)` (line ~8427)
- ETag: `configEtag(config)` for 304 responses (line ~8438)
- Cache: `public, max-age=60, stale-while-revalidate=86400, s-maxage=60` (same as catalog)
- Uses existing `rateLimitPublicRead` middleware
- Returns sensible defaults when no settings row exists yet

**3. Authenticated settings CRUD** — `GET/POST /api/storefront/settings` (lines ~2091, ~2146)
- `GET` — returns current settings or defaults, scoped by `org_id`
- `POST` — admin-only upsert with `onConflict: "org_id"`, triggers Cloudflare purge
- `purgeStorefrontConfigCache(orgId)` — purges the cached config URL after settings save

### New public route inventory

```
GET /api/public/v1/:handle/config     ← NEW
GET /api/public/v1/:handle/products   (existing)
GET /api/public/v1/:handle/products/:slug  (existing)
GET /api/public/v1/:handle/inventory  (existing)
GET /api/public/v1/:handle/products/:slug/inventory  (existing)
```
