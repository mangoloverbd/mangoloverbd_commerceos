# Realtime Storefront Synchronization on Vercel — Design

Date: 2026-08-27
Status: Approved; engineering-reviewed implementation plan written

## Goal

Make Mango Lover BD product, price, image, publication, variant, and stock changes appear on the separately deployed storefront within one to three seconds, including on already-open pages, without rebuilding or redeploying the storefront.

## System boundary

This is one merchant, one fixed workspace, one Supabase project, and one intended storefront. Merchant-Suite and the storefront remain separate GitHub repositories and separate Vercel projects.

The canonical Supabase project `ldiktvcavyabivpxfwpn` was initially selected as a greenfield launch target, and no data is copied automatically from `hcsijvsfvwiozfruogzt`. A 2026-08-28 read-only audit found that the canonical project had already been provisioned with the application tables, one Mango Lover BD admin/workspace role, and non-secret usage/settings rows. Those rows are now treated as intentional bootstrap state: schema rollout must preserve them and reconcile the existing database non-destructively. The older project remains untouched and read-only as a temporary rollback reference; there is no dual-write period.

The production storefront handle is immutable after launch because it anchors public API URLs, Vercel configuration, Realtime filtering, and client query keys. A future rename is a coordinated migration: reserve the new handle, preserve the old handle as a temporary alias, update Vercel environment configuration, deploy and verify both applications, then retire the alias after the agreed compatibility window.

| Concern | Source of truth and delivery path |
|---|---|
| Storefront components, layouts, CSS, application logic | Storefront GitHub repo; Vercel build and deployment |
| Fixed code assets | Storefront GitHub repo |
| Products, prices, descriptions, publication state | Mango Lover BD Supabase database |
| Variants and authoritative stock | Mango Lover BD Supabase database |
| Product images and merchant-editable brand media | Mango Lover BD Supabase Storage |
| Storefront branding, shipping, customers, orders | Mango Lover BD Supabase database |
| Public commerce reads and checkout | Versioned Merchant-Suite API |
| Live invalidation signal | Read-only Supabase Realtime revision state |
| Catalog/API acceleration and responsive images | Vercel CDN and Image Optimization |

Agent-led storefront customization changes source code and fixed design assets in the storefront repository, then commits them so Vercel redeploys. Merchant-led operational changes happen in Merchant-Suite and never create Git commits or storefront deployments.

## Security boundary

The storefront receives only browser-safe configuration:

- `VITE_MERCHANT_SUITE_URL`
- `VITE_STOREFRONT_HANDLE`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

The Supabase browser client is notification-only. It may select and subscribe to the safe storefront revision row; it receives no direct read or write privileges on `products`, `product_images`, `product_variants`, `orders`, customers, or settings. The Supabase service-role/secret key remains server-only.

All catalog, inventory, configuration, and checkout operations use `/api/public/v1/:handle/...`. Authenticated mutations use Merchant-Suite endpoints and resolve the fixed Mango Lover BD workspace on the server. Public clients never choose an `org_id`.

## Revision model

Add a narrowly scoped `storefront_sync_state` table with one row for the Mango Lover BD workspace:

- `org_id` primary key
- `catalog_revision` monotonically increasing bigint
- `inventory_revision` monotonically increasing bigint
- `updated_at`

Enable RLS. Grant `anon` and `authenticated` only `SELECT` on the safe revision row, and revoke their insert, update, and delete privileges. Add the table to Supabase Realtime publication. It contains no private product, customer, order, or credential data.

Database triggers advance revisions according to the public response surfaces changed by the source mutation:

- Product creation, deletion, publication, or unpublication advances both revisions because the product enters/leaves catalog and inventory responses.
- Product text, price, slug, and image changes advance `catalog_revision` only.
- Base or variant stock-only changes advance `inventory_revision` only.
- Adding or deleting a variant advances both revisions.
- Variant attributes and variant pricing advance `catalog_revision` only.
- Storefront branding and shipping configuration advance `catalog_revision` only.
- Checkout stock decrements advance `inventory_revision` only.

Trigger-based revisioning is required so changes made by any valid server path cannot silently bypass synchronization.

Each database transaction may advance each affected revision class once. A logical dashboard save that intentionally uses several independent database transactions may therefore produce several monotonic increments; this is correct and harmless. No route may claim cross-call atomicity unless its logical mutation has been moved into one Postgres function/transaction.

## Snapshot-consistent revision reads

Revision validation and commerce reads happen in one database statement/snapshot. Each public catalog, configuration, or inventory database function returns the revision it observed together with its strict public payload. The API caches a response only when the requested revision equals the revision observed by that same statement.

This prevents a mutation from landing between a separate revision check and content query and avoids caching new content under an old revision URL. Revision URLs and authoritative version checks are the correctness mechanism. Vercel cache tags may be added for observability or a later optimization, but v1 does not require cache invalidation, an invalidation outbox, or a retry worker.

## Public API and cache behavior

Add or extend these endpoints:

```text
GET /api/public/v1/:handle/version
GET /api/public/v1/:handle/config?rev=<catalog_revision>
GET /api/public/v1/:handle/products?rev=<catalog_revision>
GET /api/public/v1/:handle/products/:slug?rev=<catalog_revision>
GET /api/public/v1/:handle/inventory?rev=<inventory_revision>
GET /api/public/v1/:handle/products/:slug/inventory?rev=<inventory_revision>
POST /api/public/v1/:handle/orders
```

The version response is tiny and uses `no-store`. Catalog and inventory responses use revision-aware URLs, ETags, and Vercel-specific CDN cache headers. Browser caching must revalidate rather than hold a stale catalog independently of Vercel. Revisions are canonical decimal strings across PostgreSQL, JSON, URLs, ETags, and query keys so JavaScript number precision cannot corrupt them.

The rollout is backward compatible. During the short migration window, existing catalog clients may omit `rev`, but those responses use `no-store`; existing checkout clients may omit an idempotency key, but still execute through atomic checkout with a server-generated one-request key. After the updated storefront is verified, server-side feature flags require revision parameters and client-provided high-entropy idempotency keys. Compatibility paths are removed after the observation window.

The existing Cloudflare-only purge path is not the target deployment architecture. Both applications deploy to Vercel, and revision-aware URLs make explicit purge unnecessary for correctness. Old revision entries may expire naturally because clients move to the newest revision after Realtime or an authoritative version check.

## Storefront client behavior

Keep the integration layer isolated from theme components:

```text
src/lib/merchant-suite/
  client.ts
  queries.ts
  realtime.ts
  types.ts
```

Use revision-aware client query keys:

```text
["catalog", handle, catalogRevision]
["product", handle, slug, catalogRevision]
["inventory", handle, inventoryRevision]
```

On initial navigation, the storefront establishes the revision subscription, waits until it is subscribed, fetches the authoritative revisions, and then requests the corresponding cached resources. This ordering closes the startup missed-event window. On a Realtime revision event, it refetches all active queries in the affected resource class. Because the public signal intentionally contains no product data or product IDs, product-specific refetching is not assumed.

On reconnect, browser focus, or returning online, it first checks the version endpoint. A low-frequency authoritative version check continues while a visible tab is open even when Realtime appears healthy, because a connected channel can still miss an individual event. When Realtime is degraded, the client temporarily increases the polling frequency and returns to the low-frequency check after recovery.

An open product page updates price, images, variants, and sold-out state without a browser refresh. If a product is unpublished, the page redirects or presents an unavailable state. Invalid cart variants remain visible with an explicit unavailable warning and checkout disabled; they are never removed silently.

## Stock correctness

Remove parallel base-stock truth from workspace-prefixed `app_settings`. Use one authoritative database representation:

- `products.stock_quantity` for products without selectable variants
- `product_variants.stock_quantity` for products with variants

The public inventory serializer derives availability from those rows only. Existing stock data requires a verified one-time migration before old settings keys stop being read.

Checkout must validate and decrement inventory atomically in one database transaction. Use a `SECURITY INVOKER` Postgres function called only by the server's service-role client. Revoke `EXECUTE` from `PUBLIC`, `anon`, and `authenticated`, then grant it only to `service_role`.

The function is authoritative for current prices, shipping-zone selection and shipping cost, order-number allocation, idempotency, order creation, and stock decrement. It locks requested inventory rows in deterministic ID order, rechecks publication and variant ownership, creates the existing order shape expected by analytics/courier flows, and commits together. The JavaScript shipping helper remains estimate-only and must share parity fixtures with the database rules.

Checkout idempotency is scoped by storefront/workspace and a high-entropy client key. Store a canonical request hash and the minimal safe success response in the same transaction. Reusing the key with a different payload returns a conflict; retrying the same payload returns the original order result without customer PII. Apply a documented retention window. Concurrent checkouts must not oversell, duplicate an order, or partially decrement stock.

## Images

Merchant-uploaded images use immutable UUID paths in the existing public Supabase Storage bucket. Replacing an image creates a new object URL. Never overwrite image bytes at an existing URL.

Store image metadata needed for stable rendering: width, height, MIME type, file size, alt text, sort order, primary state, and a compact blur placeholder. Image insert, deletion, reordering, or primary-image changes advance the catalog revision.

The Vite storefront uses Vercel's `/_vercel/image` API with restrictive remote patterns, supported widths, quality values, and WebP/AVIF output. The above-the-fold image loads eagerly with high fetch priority; other images lazy-load. All images render with explicit dimensions/aspect ratio to prevent layout shift.

## Provisioning changes

The existing Merchant-Suite Vercel provisioner continues to create the storefront project from the dedicated storefront GitHub repository. Extend it to inject the storefront handle and Supabase URL/publishable key in addition to the Merchant-Suite public URL. Do not inject a service-role key or other server secret into a `VITE_` variable.

Provisioning and redeployment are for source-code changes. Dashboard catalog mutations never invoke the Vercel deployment API.

Provisioning locks the production handle after the first successful production storefront deployment. Normal settings APIs must reject later handle edits with a clear migration-required error rather than silently disconnecting the storefront.

## Failure handling

- A dashboard save succeeds only after the authoritative Supabase transaction commits.
- Realtime disconnection or a silently missed event falls back to authoritative version checks on reconnect, focus, online events, and bounded polling.
- API responses retain strict public schemas so internal fields cannot leak through new database columns.
- Storage upload failure does not create an image record. Database insert failure after upload removes the orphaned object.
- Checkout failure rolls back both the order insert and every stock decrement.

## Observability

Reuse the existing PostHog and Vercel observability surfaces. After a storefront refetch renders the committed revision, emit a PII-free `storefront_sync_applied` PostHog event containing the catalog/inventory revision strings, recovery source (`realtime`, `focus`, `online`, `healthy_poll`, or `degraded_poll`), database revision `updated_at`, render completion time, derived latency, page class, and deployment identifier. Never include customer identity, cart contents, phone, address, order details, or secrets.

Merchant-Suite emits structured Vercel logs with a generated/request-propagated correlation ID, storefront handle, revision strings, endpoint class, database/API duration, revision-match result, checkout conflict category, and idempotent-new/idempotent-replay outcome. PostHog reporting tracks p50/p95 synchronization latency and recovery-source rates. Production acceptance requires p95 normal Realtime commit-to-render latency at or below three seconds during the observation session.

## Testing and acceptance criteria

1. Product creation, edits, publication changes, deletion, image operations, variant operations, and stock operations each advance the correct revision exactly once per transaction.
2. A newly opened storefront shows committed changes within one to three seconds without a deployment.
3. An already-open product page and cart reflect relevant changes within one to three seconds without refresh.
4. Missing Realtime events recover through the version check.
5. Vercel cache hits serve catalog and optimized images without bypassing revision correctness.
6. Replacing an image never serves the previous bytes under the new catalog revision.
7. Concurrent checkout tests prove stock cannot become negative and orders cannot oversell.
8. Anonymous Supabase clients can read/subscribe only to revision state and cannot read or mutate commerce tables.
9. Contract tests reject accidental private fields in public API responses.
10. Unit, integration, and critical Playwright flows pass; relevant changed code maintains at least 80% test coverage.

## Rollout

1. Keep `ldiktvcavyabivpxfwpn` as the canonical project and reconcile it with a reviewed, data-preserving migration. Do not transfer data automatically from the older project.
2. Validate schema and destructive tests in a local Supabase instance or isolated Supabase branch, never against the future production database.
3. Add revision schema, RLS, grants, triggers, snapshot-consistent read functions, and tests in a reviewed migration.
4. Bootstrap the Mango Lover BD admin/workspace, then enter required branding, shipping, integrations, products, variants, images, and opening stock explicitly.
5. Add revisioned API/cache behavior and atomic checkout.
6. Update storefront integration and Realtime handling in the separate repository.
7. Configure Vercel image optimization and environment variables.
8. Run acceptance tests, freeze configuration changes during the switch window, then promote the backward-compatible Merchant-Suite API before the storefront.
9. Verify the updated storefront, enable strict revision/idempotency feature flags, and observe before removing compatibility paths.
10. Confirm PostHog p50/p95 synchronization reporting and structured Vercel logs, then observe revision mismatches, API errors, and oversell attempts before retiring the older project reference and removing legacy Cloudflare/settings-stock paths.

The executable phase breakdown and test matrix are documented in `docs/superpowers/plans/2026-08-27-realtime-storefront-sync-implementation-plan.md`.

## Superseded guidance

This design supersedes the connection, cache, stock, and image-delivery portions of:

- `docs/superpowers/specs/2026-08-14-storefront-connection-design.md`
- `docs/superpowers/plans/2026-07-15-public-product-api-bridge.md`
- `docs/superpowers/plans/2026-07-19-public-product-api-cache-tier.md`

Historical implementation details remain useful evidence, but new work must follow this design and a new implementation plan.
