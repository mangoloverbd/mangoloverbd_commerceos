# Realtime Storefront Synchronization — Implementation Plan

Date: 2026-08-27
Status: Phase 0 implemented locally; remote reconciliation awaiting deploy checkpoint
Target database: Supabase project `ldiktvcavyabivpxfwpn`
Related design: `docs/superpowers/specs/2026-08-27-realtime-storefront-sync-design.md`

## Outcome

Merchant changes to products, prices, variants, publication state, images, branding, and stock become visible on the separately deployed Vercel storefront within one to three seconds, including on already-open pages. Storefront source-code and design changes still deploy from the separate GitHub repository. Runtime commerce data stays in the single Mango Lover BD Supabase project.

## Locked decisions

1. `ldiktvcavyabivpxfwpn` is the new canonical Supabase project.
2. It receives a version-controlled, data-preserving schema reconciliation. No data is copied automatically from `hcsijvsfvwiozfruogzt`.
3. GitHub and Vercel remain the source and deployment path for application code.
4. Supabase Database and Storage are the source of truth for runtime commerce data and merchant-uploaded media.
5. The storefront uses Supabase only for a browser-safe, read-only revision notification row. Catalog, inventory, configuration, and checkout use the Merchant-Suite public API.
6. Snapshot-consistent revisioned API reads plus authoritative version checks are the correctness mechanism. V1 does not require cache invalidation or an invalidation outbox.
7. Stock has one authoritative database value and checkout changes stock and creates the order in one database transaction.
8. Supabase Postgres Changes is acceptable for this single-row, single-storefront notification feed. Version checks on focus, reconnect, online events, and bounded polling recover missed events.
9. The canonical database was pre-provisioned with one Mango Lover BD admin/workspace and non-secret settings before the baseline was ready. Preserve that bootstrap state, reconcile it non-destructively, and do not transfer or dual-write data from the older project.
10. The older Supabase project remains untouched and read-only as a temporary rollback reference until the new production launch is accepted.
11. The production storefront handle is immutable after first launch. Renaming requires an explicit alias-backed migration and coordinated Vercel deployment.
12. Backend changes deploy backward compatibly before the storefront. Strict revision and checkout-idempotency requirements activate through server-side feature flags only after the updated storefront passes production verification.

## Architecture

```text
MERCHANT WRITE
Dashboard
   │ authenticated apiFetch()
   ▼
Merchant-Suite Vercel Function
   │ resolve user + fixed Mango Lover BD org_id
   ▼
Supabase transaction
   ├── mutate product / image / variant / stock / settings
   ├── advance catalog and/or inventory revision
   └── commit
          │
          └── Supabase Realtime publishes safe revision-row UPDATE

STOREFRONT READ
Storefront browser
   ├── GET /version (no-store)
   ├── GET catalog/config?rev=<catalog revision> (snapshot RPC → Vercel CDN)
   ├── GET inventory?rev=<inventory revision> (snapshot RPC → Vercel CDN)
   └── subscribe to safe revision row with publishable Supabase key
          │ revision changes
          └── refetch only the affected revision-keyed query
```

```text
CHECKOUT
Public order request
   │ validate request + normalize BD phone + resolve storefront handle
   ▼
Atomic Postgres RPC (service_role only, SECURITY INVOKER)
   ├── lock requested product/variant rows in deterministic ID order
   ├── recheck publication, ownership, price, shipping, and stock
   ├── claim/verify storefront-scoped idempotency key + request hash
   ├── allocate the next storefront order number
   ├── create one order with server-calculated totals
   ├── decrement every stock row
   ├── advance inventory revision once
   └── commit all or roll back all
```

## What already exists

- `server/index.js` already resolves authenticated users, the fixed workspace, storefront handles, public product routes, product/image/variant mutations, storage uploads, and checkout entry points. Reuse these route boundaries.
- `server/publicCatalog.js` already allowlists public product and inventory fields with strict schemas. Extend it instead of returning database rows directly.
- `server/storefrontHandle.js` already normalizes and validates public handles. Keep handles as the public identifier.
- Public catalog and inventory handlers already emit ETags and cache headers, but the current Cloudflare tags/purge path and TTL model must be replaced with revision-aware Vercel behavior.
- Product images already use UUID-style Supabase Storage paths. Preserve immutable object paths and add missing metadata.
- `src/lib/api.ts` already attaches the dashboard JWT. All new authenticated dashboard requests continue to use it.
- Vitest unit/contract tests exist for the catalog serializer, handles, product images, and shipping calculation. Build on these tests rather than creating another test harness.

## Phase 0 — Establish the canonical Supabase baseline

### 0.1 Link configuration safely

- Update `supabase/config.toml` to `project_id = "ldiktvcavyabivpxfwpn"`.
- Keep `.codex/config.toml` project-local and pointed to the same reference.
- Add a verification script that compares the project ref in `supabase/config.toml`, `.codex/config.toml`, and `SUPABASE_URL` without printing keys.
- Do not add a Management API token or database password to source control.

### 0.2 Produce a canonical reconciliation migration

- Inventory every table, enum, constraint, index, RLS policy, storage bucket/policy, function, trigger, and publication required by the current application.
- Replace reliance on cold-start DDL in `server/index.js` and `scripts/seed-storefront.mjs` with a deterministic baseline that succeeds on an empty local Supabase database.
- Preserve the fixed `org_id` columns and guards for compatibility, but create only the one Mango Lover BD workspace during an explicit seed/bootstrap step.
- Treat the old repository migration directory as legacy input. Build and test one canonical reconciliation that succeeds both on an empty local database and on the already-provisioned target without deleting its admin/settings bootstrap state; do not blindly replay unverified legacy migrations.
- Make all policies and grants explicit. Revoke default function execution where appropriate.
- Add SQL assertions that fail if anonymous/authenticated roles can access commerce tables or execute privileged functions.

### 0.3 Validate before any remote mutation

- Run a local Supabase reset from empty state twice to prove idempotent developer setup.
- Use a local database or isolated Supabase branch for integration, concurrency, and destructive E2E tests. Never aim those tests at the future production database.
- Run schema lint/security advisors locally.
- Generate TypeScript types from the validated schema and replace `src/integrations/supabase/types.ts`.
- Review the migration diff and live-schema preconditions, then apply it once to `ldiktvcavyabivpxfwpn` only after an explicit pre-deploy checkpoint.
- Immediately rerun table, migration, RLS, and advisor introspection through the project-local Supabase MCP.

### 0.4 Bootstrap the single production workspace explicitly

- Create the Mango Lover BD administrator through Supabase Auth using a one-time operator workflow; never seed a password in SQL or source control.
- Insert the fixed `user_roles` admin/workspace association only after the Auth user exists.
- Create the one storefront handle and sync-state row.
- Mark the handle locked after the first verified production storefront deployment.
- Configure branding, shipping zones, integration credentials, products, variants, images, and opening stock through authenticated application/operator flows.
- Record a signed-off opening inventory report before accepting public checkout traffic.
- Do not copy Auth users, operational rows, Storage objects, secrets, or order history from `hcsijvsfvwiozfruogzt`.
- Keep the older project unchanged and read-only during acceptance. It is a reference/rollback source, not an active writer.

## Phase 1 — Revision state, RLS, triggers, and snapshot-consistent reads

Create a reviewed migration containing:

- `storefront_sync_state`: fixed workspace reference, public handle, `catalog_revision bigint`, `inventory_revision bigint`, and `updated_at`.
- A unique workspace revision row and supporting indexes.
- RLS enabled on the sync-state table.
- `anon`/`authenticated`: only `SELECT` on the one safe sync-state row; no access to commerce tables.
- `service_role`: required access for server mutations and snapshot read functions.
- `storefront_sync_state` added to `supabase_realtime`; no commerce table is added to the public notification surface.

Trigger rules:

| Mutation | Catalog revision | Inventory revision |
|---|---:|---:|
| Product insert/delete | yes | yes |
| Product publish/unpublish | yes | yes |
| Product text, slug, or price | yes | no |
| Product base stock only | no | yes |
| Image insert/update/delete/reorder/primary | yes | no |
| Variant attributes or price | yes | no |
| Variant stock only | no | yes |
| Variant insert/delete | yes | yes |
| Storefront branding/shipping config | yes | no |
| Checkout decrement | no | yes |

Derive this classification from the exact public serializers: if a mutation changes membership or output of both catalog and inventory, both revisions advance. Use transaction-local guard flags inside trigger functions so each revision class advances at most once in one transaction even when several rows change. The public signal carries only global catalog and inventory revisions, so the storefront invalidates every active query in the changed resource class rather than assuming product-level change hints.

A logical dashboard operation may currently span several independent `supabase-js` calls and therefore several database transactions. Multiple monotonic revision increments are valid. Do not use transaction-local flags to imply atomicity across calls; move only logical writes that require all-or-nothing behavior behind a typed Postgres RPC. After a multi-call route finishes, read the final revision once if the API response needs to report it.

Add service-role-only snapshot read functions for config, catalog list, product detail, inventory list, and product inventory. Each function reads the applicable revision and serialized data in one SQL statement/snapshot and returns both. The Express handler compares the requested revision with the returned revision and caches only an exact match. Revisions cross the wire as canonical decimal strings, never JavaScript numbers.

Add `server/storefrontSync.js` as a focused standalone helper for public version serialization, decimal-string revision validation, cache headers, and revision mismatch normalization. Register routes and invoke mutations from `server/index.js` to preserve its domain organization.

Use `Vercel-CDN-Cache-Control` for the Vercel TTL and browser `Cache-Control: max-age=0, must-revalidate`. `Vercel-Cache-Tag` may be emitted for inspection or future optimization, but do not add `invalidateByTag()`, a Vercel credential, a cron drain, or an invalidation outbox in v1.

## Phase 2 — One stock truth and atomic checkout

### 2.1 Canonical inventory

- Make `products.stock_quantity` authoritative for products with no selectable variants.
- Make `product_variants.stock_quantity` authoritative for products with variants.
- Update product reads/writes, public inventory serializers, AI product actions, imports/crawls, and dashboard forms to use those rows only.
- Add database checks enforcing non-negative stock.
- Reject ambiguous products that mix sellable variant stock with an independently sellable base-stock pool.
- Because the target project is a clean bootstrap, do not import legacy `app_settings` stock. Add a one-time diagnostic that reports any future `${orgId}:product_stock:*` keys before deleting the fallback reader.
- Remove `getProductStockMap()` and `saveProductStock()` only after all callers and tests use canonical columns.

### 2.2 Atomic order RPC

Add a typed Postgres function accepting the fixed workspace, normalized customer payload, shipping-zone ID, client idempotency key, and requested product/variant IDs with quantities. The RPC is the source of truth for shipping, order numbering, prices, idempotency, order creation, and stock. It must:

1. validate positive bounded quantities and reject duplicate line IDs or normalize them deterministically;
2. lock inventory rows in sorted ID order to reduce deadlock risk;
3. ensure every row belongs to the resolved Mango Lover BD workspace and every product is published;
4. calculate current prices from product/variant rows and shipping from the selected zone in the current `storefront_settings.shipping_zones` snapshot rather than trusting client totals;
5. allocate the next `#S...` order number through a database counter in the same transaction;
6. claim an idempotency record uniquely scoped by workspace and high-entropy key;
7. compare a canonical request hash, return a conflict when the same key has different contents, and return the original minimal result for an identical retry;
8. reject insufficient inventory without inserting an order;
9. insert the existing order columns expected by analytics and courier flows plus immutable order-line snapshots;
10. decrement base or variant stock without allowing a negative result;
11. persist only the minimal safe retry response (order number and totals, no customer PII) and a documented expiry/retention timestamp;
12. commit once, advancing inventory revision through the trigger.

Keep the function `SECURITY INVOKER`. Revoke `EXECUTE` from `PUBLIC`, `anon`, and `authenticated`, and grant only `service_role`. The Express public endpoint remains rate-limited, validates its schema, resolves the handle server-side, normalizes the phone, and calls the function with the fixed workspace. During the compatibility window, a missing key receives a server-generated one-request key; after `STOREFRONT_REQUIRE_IDEMPOTENCY` is enabled, checkout requires a client UUID-style idempotency key.

The existing `server/shippingCalculation.js` remains available for storefront/dashboard estimates only. Define shared JSON fixtures covering ordinary delivery, free-above thresholds, minimum-order rejection, missing zones, decimal currency values, and boundary amounts; run the same fixtures against JavaScript and the SQL calculation in integration tests. If parity fails, checkout follows the database result and the estimate build fails testing.

The checkout transaction does not dispatch couriers, send notifications, or call third-party services. Existing dashboard/courier flows consume the committed order afterward. Any future automatic external side effects require a separate post-commit order-event outbox and are not part of this storefront-sync implementation.

## Phase 3 — Revision-aware public API and Vercel caching

Add or complete:

```text
GET /api/public/v1/:handle/version
GET /api/public/v1/:handle/config?rev=<catalogRevision>
GET /api/public/v1/:handle/products?rev=<catalogRevision>
GET /api/public/v1/:handle/products/:slug?rev=<catalogRevision>
GET /api/public/v1/:handle/inventory?rev=<inventoryRevision>
GET /api/public/v1/:handle/products/:slug/inventory?rev=<inventoryRevision>
POST /api/public/v1/:handle/orders
```

- `/version` returns a strict allowlisted object and `Cache-Control: no-store`.
- A missing `rev` remains temporarily supported for old storefront clients but uses `no-store`; after `STOREFRONT_REQUIRE_REVISIONS` is enabled, it returns a clear upgrade-required error.
- A matching revision uses a long Vercel CDN TTL because the payload and revision were read in one database snapshot.
- A stale, future, malformed, or ambiguous revision returns `409 revision_mismatch`, `no-store`, and the current safe revision so the client can retry once.
- ETags include the applicable canonical decimal-string revision.
- Snapshot read functions prevent a concurrent mutation from caching new data under an old revision URL.
- Keep response shapes compatible with the current storefront throughout the migration window; new revision fields are additive.
- CORS uses an explicit storefront origin allowlist for public API methods; do not leave credentialed or mutation surfaces on reflective `origin: true` behavior.
- Strict Zod public response schemas prevent new database columns from leaking.
- Every product, image, variant, stock, config, import, crawl, and AI mutation path gets an integration test proving the database trigger changes the expected revision without route-specific synchronization code.

## Phase 4 — Merchant dashboard integration

- Keep existing dashboard save/upload flows using `apiFetch()`.
- Return the committed catalog/inventory revisions with successful mutations where useful for UI feedback.
- Treat the committed database revision as save success; storefront convergence is observed through the revision signal and version checks rather than a cache-purge result.
- Add image metadata capture: width, height, MIME type, file size, alt text, sort order, primary state, and blur placeholder.
- On upload, write the Storage object first, then metadata. If metadata insert fails, remove only the newly uploaded orphan object.
- On replacement, create a new immutable UUID object path; never overwrite an existing path.
- Update provisioning to inject only `VITE_MERCHANT_SUITE_URL`, `VITE_STOREFRONT_HANDLE`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY` into the storefront project. Remove the raw org-ID browser variable after the external storefront no longer needs it.
- After first production provisioning, reject ordinary handle edits. Add a separate operator-only rename workflow that reserves the new handle, creates a time-bounded old-handle alias, updates Vercel configuration, deploys/validates both applications, and retires the alias only after the compatibility window.

## Phase 5 — Separate storefront repository

This phase is executed in the dedicated storefront repository after it is checked out locally. Do not place theme components in Merchant-Suite.

Create an isolated integration boundary:

```text
src/lib/merchant-suite/
  client.ts       request schemas, timeouts, one revision-mismatch retry
  queries.ts      React Query keys and fetchers
  realtime.ts     Supabase subscription + reconnect/focus/online recovery
  types.ts        strict public API types
```

Client flow:

1. Subscribe to the one safe `storefront_sync_state` row using `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. Wait for the channel to report `SUBSCRIBED`, then fetch `/version` authoritatively.
3. Fetch catalog/config and inventory using the returned revisions.
4. On catalog revision change, update the catalog revision key and refetch affected catalog/config/product queries.
5. On inventory revision change, update the inventory revision key and refetch inventory queries.
6. On reconnect, browser focus, returning online, subscription timeout, or channel error, fetch `/version` before trusting local state.
7. Check `/version` periodically even while Realtime is healthy (for example every 30 seconds while the tab is visible), and temporarily increase the frequency while Realtime is unavailable.

User-visible rules:

- Open product pages update images, price, variants, and sold-out state without refresh.
- Unpublished/deleted products show an unavailable state and route back to the catalog safely.
- Cart lines are snapshot-visible but marked unavailable when a product/variant disappears or stock becomes insufficient; checkout is disabled until resolved.
- Checkout submits an idempotency key and treats retrying the same successful request as success.
- Network or subscription failure never clears the cart.
- The client treats the configured production handle as stable; it does not discover or rewrite handles dynamically.

Vercel image delivery:

- Configure the Vite build output for `/_vercel/image` with an allowlist restricted to this Supabase project's Storage hostname/path.
- Allow only the widths and quality values used by the storefront and prefer WebP; add AVIF only after measuring transformation cost and benefit.
- Use explicit dimensions/aspect ratios, eager/high-priority loading only for the primary above-the-fold image, and lazy loading for the rest.
- Immutable object URLs mean image replacement creates a new optimization cache key; do not depend on image-cache purge for normal replacement.

## Phase 6 — Verification and rollout

### Test coverage diagram

```text
CODE PATHS                                             USER FLOWS
[+] Schema bootstrap                                   [+] Merchant product update [E2E]
  ├── empty reset succeeds [SQL integration]             ├── save → commit → open page updates ≤3s
  ├── second reset succeeds [SQL integration]            ├── image replace shows new bytes
  └── grants/RLS deny unsafe roles [SQL security]         └── unpublish removes open product safely

[+] Revision triggers                                  [+] Realtime recovery [E2E]
  ├── catalog-only mutation [SQL integration]             ├── live event updates correct query
  ├── inventory-only mutation [SQL integration]           ├── missed event recovered on focus
  ├── publish/unpublish/delete bumps both                  ├── healthy-channel miss recovered by periodic check
  ├── both revisions for variant add/delete               ├── offline → online version recovery
  ├── multi-row transaction bumps once                    └── polling stops after reconnect
  └── payload and revision share one snapshot

[+] Public API                                         [+] Shopping and checkout [E2E]
  ├── version success / unknown handle / DB failure       ├── add variant and base-stock product
  ├── valid revision → cacheable response                 ├── stale cart blocks checkout clearly
  ├── missing revision → no-store compatibility           ├── double-click/retry creates one order
  ├── invalid/mismatched revision → 409 retry              ├── two buyers race for last unit
  ├── ETag 304 and Vercel tags                            └── failure leaves order/stock unchanged
  └── strict schema rejects private fields

[+] Cache correctness                                 [+] Merchant image management [E2E]
  ├── revision + payload share snapshot [integration]     ├── upload → metadata → storefront
  ├── old revision cache cannot be poisoned               ├── metadata failure cleans orphan
  ├── browser cache always revalidates                     └── reorder/primary updates live
  └── CDN caches exact revision URLs

[+] Atomic checkout RPC
  ├── validation and ownership rejection [SQL]
  ├── price/shipping recalculation [SQL]
  ├── JS/SQL shipping parity fixtures [integration]
  ├── base and variant stock success [SQL]
  ├── insufficient stock rollback [SQL]
  ├── deterministic locking / no negative stock [concurrency]
  ├── identical idempotent retry returns minimal original result [SQL/API]
  └── key reuse with a different hash returns conflict [SQL/API]
```

### Required test artifacts

- `supabase/tests/storefront_sync.test.sql`: response-derived revision classification (including publish/unpublish/delete), once-per-transaction guards, snapshot reads, grants, RLS, and publication membership.
- `supabase/tests/submit_storefront_order.test.sql`: authorization, shipping rules, order-number allocation, base/variant stock, rollback, request-hash idempotency, safe retry response, retention, and concurrency prerequisites.
- Extend `src/test/shippingCalculation.test.ts` and add database integration coverage that executes the same shipping fixtures through JavaScript and SQL.
- `src/test/publicStorefrontSync.test.ts`: decimal-string revision parsing, cache policy, ETags, strict version schema, and revision-mismatch normalization.
- Extend `src/test/publicCatalog.test.ts`: canonical base stock, variant stock, image metadata allowlist, and private-field regression coverage.
- API integration tests around the Express app using a disposable local Supabase instance for version/catalog/inventory/order routes and all mutation-to-revision paths.
- Storefront-repository Vitest tests for query keys, revision mismatch retry, Realtime lifecycle, polling fallback, cart reconciliation, and image URL construction.
- Playwright flows across preview deployments for product edit, image replace, stock edit, unpublish, offline recovery, and concurrent checkout.
- Enforce at least 80% changed-code coverage; target complete branch coverage for revision classification and checkout correctness.

### Rollout order

1. Bootstrap and verify local schema.
2. Apply the reviewed baseline to the empty canonical Supabase project.
3. Create the production admin/workspace with a one-time operator workflow and configure production data manually.
4. Deploy Merchant-Suite preview with revision state, triggers, API changes, and atomic checkout against an isolated test branch/database.
5. Deploy storefront preview with browser-safe test-branch variables.
6. Run contract, RLS, concurrency, cache-header, Realtime, and Playwright acceptance tests without touching production rows.
7. Verify the opening catalog, images, branding, shipping, integrations, and stock in the canonical production project.
8. Freeze configuration changes for the short switch window and promote Merchant-Suite with `STOREFRONT_REQUIRE_REVISIONS=false` and `STOREFRONT_REQUIRE_IDEMPOTENCY=false`.
9. Smoke-test the current storefront against the new backward-compatible API, then promote the updated storefront.
10. Verify Realtime, revisioned reads, cart reconciliation, and idempotent checkout in production; enable both strict feature flags only after success.
11. Keep the old project untouched/read-only as the rollback reference; never dual-write orders or stock.
12. Observe for at least one full merchant-editing session before removing compatibility paths, retiring the rollback reference, and deleting Cloudflare and `app_settings` stock compatibility code.

### Observability gates

Reuse the existing PostHog and Vercel surfaces; do not introduce another vendor.

- Storefront: emit a PII-free `storefront_sync_applied` PostHog event only after the new revision renders. Include canonical revision strings, revision-row `updatedAt`, render completion time, calculated latency, trigger source (`realtime`, `focus`, `online`, `healthy_poll`, `degraded_poll`), page class, and Vercel deployment identifier.
- Merchant-Suite: emit JSON Vercel logs with correlation ID, handle, endpoint class, revision strings, database/API duration, revision match/mismatch, checkout conflict category, and idempotent-new/idempotent-replay result.
- Correlation: accept/return `X-Request-ID` when valid or generate one; pass it through server logs and public responses, but do not use it as a cache key.
- Privacy: never send customer identity, phone, address, cart/order contents, integration data, raw idempotency keys, or secrets to PostHog/log metadata.
- Reporting: create PostHog insights for p50/p95 commit-to-render latency and recovery-source rate; filter by production deployment.
- Gate: normal Realtime p95 must be at or below three seconds during the production observation session. Investigate any sustained revision divergence, negative-stock constraint attempt, or unexpected idempotency conflict before removing compatibility paths.

## Failure modes

| Failure | Protection | Test | User experience |
|---|---|---|---|
| Realtime event missed | continuous low-frequency version checks plus faster degraded polling | storefront unit + E2E | brief delay, then automatic recovery |
| Mutation races a public read | revision and payload read in one statement/snapshot | SQL/API integration | exact revision response or retryable 409 |
| Unpublished/deleted product remains in inventory/cart | publication/deletion advances both revisions | SQL integration + storefront E2E | product becomes unavailable automatically |
| Stale/fabricated revision URL | compare with current revision, return no-store 409 | API integration | client refreshes version and retries once |
| Two buyers request last unit | row locks + atomic RPC | concurrency integration | one succeeds, one sees sold-out response |
| Checkout retried after timeout | idempotency key | SQL/API integration | original successful order returned |
| Same idempotency key reused with another cart | workspace-scoped unique key + canonical request hash | SQL/API integration | clear conflict; no prior customer data returned |
| JavaScript shipping estimate drifts from checkout | shared JS/SQL parity fixtures; database remains authoritative | integration | build/test blocks drift before release |
| Storage upload succeeds, metadata fails | scoped orphan cleanup | API integration | clear upload error; no broken gallery row |
| Slug changes | new catalog revision and revision-keyed product queries | integration + E2E | old route becomes unavailable, new route resolves |
| Anonymous client probes Supabase | explicit grants + RLS + SQL assertions | security integration | only safe revision row is available |
| Database project mismatch | preflight ref verification | script unit/integration | deployment fails before schema mutation |
| Destructive preview test reaches production | environment/project-ref assertion and isolated test branch | CI integration | test aborts before mutation |
| Production launched without usable workspace | explicit admin/config/catalog/opening-stock checklist | operator acceptance | launch remains blocked |
| Handle edited after launch | immutable-handle guard; explicit alias-backed rename workflow | API integration + deployment E2E | normal edit rejected with migration instructions |
| New backend breaks old storefront | additive responses, no-store unrevisioned reads, temporary server-generated checkout keys | compatibility contract + preview E2E | existing storefront continues during rollout |
| Sync exceeds promised latency | database timestamp + PII-free PostHog render event; p95 report | preview/production acceptance | rollout remains in observation; compatibility paths stay enabled |

No production failure above is intentionally silent: server failures are logged with context and either surface a clear response or recover through a durable mechanism.

## Workstream dependencies and parallelization

| Step | Modules touched | Depends on |
|---|---|---|
| A. Canonical schema baseline | `supabase/`, generated Supabase types | — |
| B. Revision/API/cache helpers | `server/`, `src/test/` | A |
| C. Atomic inventory/checkout | `supabase/`, `server/`, `src/test/` | A |
| D. Dashboard mutation feedback/images | `src/pages/`, `src/lib/`, `server/` | A, B |
| E. Storefront client/realtime/images | separate storefront repository | A, B API contract |
| F. Preview E2E and rollout | both repositories, Vercel previews | B, C, D, E |

Execution lanes after Phase 0:

- Lane A: revision schema → API/cache integration → dashboard feedback.
- Lane B: inventory consolidation → atomic checkout.
- Lane C: storefront API client scaffolding can begin from the locked contract, then Realtime integration waits for the preview API.
- Final lane: merge preview contracts and run cross-repository E2E.

Lane A and Lane B both touch `server/index.js` and migrations, so use separate commits/worktrees but merge them sequentially after the shared schema contract lands. Lane C is the safest true parallel lane because it lives in the other repository.

## NOT in scope

- Multi-tenant SaaS behavior: this deployment remains the single Mango Lover BD workspace.
- Automatic migration or synchronization from `hcsijvsfvwiozfruogzt`: explicitly declined for the clean canonical bootstrap.
- Dual writes between old and new Supabase projects: they create split-brain order and inventory risk.
- Direct storefront writes to Supabase commerce tables: all checkout and merchant mutations remain server-mediated.
- Storefront theme/design implementation in this repository: it belongs in the dedicated storefront repository.
- Rebuilding/redeploying the storefront for merchant catalog edits: runtime revisions replace deployments for data changes.
- Permanent support for unrevisioned reads or missing checkout idempotency: compatibility is time-bounded and removed after verification.
- A general event-streaming or cache-invalidation platform: the one-row Realtime signal is intentionally narrow.
- Self-service production handle changes: renames require a coordinated operator migration.
- Multi-region inventory reservation or warehouse allocation: atomic stock for the one current inventory pool is the target.
- Automatic courier dispatch, notifications, or other third-party side effects during checkout: existing post-order workflows remain separate.
- Silent automatic dependency remediation for the existing npm audit findings: handle in a separately reviewed security/dependency task.

## Implementation tasks

- [ ] **T1 (P1)** — Build and validate the canonical Supabase baseline for `ldiktvcavyabivpxfwpn`.
- [ ] **T2 (P1)** — Add safe revision state, RLS/publication, transaction-aware triggers, and snapshot-consistent public read functions.
- [ ] **T3 (P1)** — Consolidate inventory into product/variant rows and remove settings-based stock callers.
- [ ] **T4 (P1)** — Replace checkout with a service-role-only atomic, idempotent Postgres RPC.
- [ ] **T5 (P1)** — Implement versioned public endpoints, strict contracts, decimal-string revisions, and Vercel cache headers.
- [ ] **T6 (P2)** — Complete image metadata, immutable replacement, and orphan cleanup.
- [ ] **T7 (P2)** — Update storefront provisioning with handle and browser-safe Supabase variables.
- [ ] **T8 (P1)** — Implement storefront revision-aware queries, Realtime subscription, fallback recovery, and cart reconciliation in the separate repository.
- [ ] **T9 (P1)** — Add SQL, API integration, concurrency, unit, and cross-repository Playwright coverage.
- [ ] **T10 (P1)** — Deploy previews, verify one-to-three-second acceptance criteria, observe, and promote in dependency order.
- [ ] **T11 (P2)** — Add PII-free PostHog sync events, structured Vercel logs, correlation IDs, and p50/p95 acceptance reporting.

## Engineering review summary

- Scope challenge: full approved scope retained; implementation is phased to keep database correctness ahead of UI synchronization.
- Architecture review: the empty/mismatched Supabase project was the blocking issue; clean canonical bootstrap approved.
- Code quality review: reuse existing route/serializer/handle boundaries; isolate only standalone sync helpers; remove duplicate stock truth and runtime DDL debt.
- Test review: coverage diagram produced; critical gaps are revision/RLS integration, checkout concurrency/idempotency, and cross-repository E2E.
- Performance review: revision-keyed CDN reads avoid database work on cache hits; snapshot functions keep validation and payload consistent; deterministic row locking avoids checkout hotspots.
- Failure modes: no accepted silent critical gap.
- Parallelization: three implementation lanes after the shared schema contract, with cross-repository storefront work providing the clean parallel boundary.

## Review readiness report

| Review | Result | Findings |
|---|---|---|
| Engineering plan review | clear | 16 architecture, code-quality, test, and performance findings resolved in this plan |
| Independent outside voice | completed | Snapshot consistency, greenfield bootstrap, isolated testing, checkout authority/idempotency, handle lifecycle, compatibility rollout, revision classification, bigint handling, and observability findings incorporated after explicit approval |

Unresolved decisions: 0. Silent critical gaps accepted: 0. Review commit baseline: `c383e54`.
