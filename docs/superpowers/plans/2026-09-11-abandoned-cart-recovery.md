# Abandoned Cart Recovery Queue — Implementation Plan

> **Scope:** Merchant Suite owns the recovered-checkout data, staff queue, lifecycle, and privacy cleanup. The storefront captures qualifying checkout drafts through a same-origin proxy. Neither repository treats a draft as an order.

## Baseline and boundaries

- Merchant Suite branch: `feat/abandoned-cart-recovery`, based on the approved design commit `1f53b0c`.
- Storefront branch: `feat/abandoned-cart-recovery`, based on its current committed checkout implementation; the original checkout's uncommitted work remains untouched.
- Use synthetic data only during verification. Do not apply a remote migration or create real orders while developing.
- Keep `docs/superpowers/plans/2026-09-11-server-side-order-protection.md` untouched. Its client-session signal remains independent from the abandonment `draft_key`.

## File map

### Merchant Suite

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20260911000000_add_abandoned_checkouts.sql` | Data-preserving schema for drafts, scoped relationship and hashed draft-reconciliation key on orders, indexes, RLS, and schema-cache reload. |
| `scripts/verify-supabase-baseline.mjs` | Derive the expected runtime-table total from its explicit table contract instead of rejecting every legitimate new runtime table. |
| `server/abandonedCheckouts.js` | Pure payload parsing, lifecycle, active-search, privacy-scrub, and recovery helpers shared by the Express route logic and unit tests. |
| `server/index.js` | Secret-authenticated custom-store upsert, authenticated staff routes, safe custom-order recovery association, and cron cleanup/reconciliation endpoint. |
| `vercel.json` | Daily authenticated cleanup schedule. |
| `src/lib/abandonedCheckouts.ts` | Dashboard record types, active-state helpers, search, cart-summary, and safe call/WhatsApp formatting. |
| `src/components/orders/AbandonedCheckoutQueue.tsx` | Responsive manual staff queue with contact, copy, mark-contacted, and dismiss controls. |
| `src/components/orders/OrderStatusSegmentedControl.tsx` | Separate `abandoned` queue tab immediately after All Orders without adding it to `ORDER_STATUS_FILTERS`. |
| `src/pages/Dashboard.tsx` | Fetch/cache/poll the queue separately from orders, switch UI modes, and perform scoped queue mutations. |
| `src/test/abandonedCheckouts*.test.{ts,tsx}` | Migration, server-domain, tab placement, queue interaction, dashboard, and isolation tests. |
| `src/test/supabaseCanonicalBaseline.test.ts` | Assert the new runtime table is present and RLS-protected in the canonical baseline. |

### Storefront

| File | Responsibility |
| --- | --- |
| `api/abandoned-carts.ts` | Production Vercel same-origin capture handler: bounded parsing, upstream proxying, redacted failures. |
| `server/abandoned-carts.ts` | Shared capture schema/forwarder used by the production handler and local Express route. |
| `server/routes.ts` | Register local `POST /api/abandoned-carts` with identical behaviour to Vercel. |
| `client/src/lib/abandoned-checkout.ts` | Browser-only draft-key persistence, payload shaping, debounced/blur/retry capture, and short non-blocking flush API. |
| `client/src/components/order-dialog.tsx` | Main cart checkout capture, notice, and optional draft-key propagation on a successful real order. |
| `client/src/features/sundarbans-honey/honey-checkout.tsx` | Campaign snapshot capture and order recovery key propagation. |
| `client/src/features/kalojira-mixed/kalojira-checkout.tsx` | Campaign snapshot capture and order recovery key propagation. |
| `client/src/features/honey-nut/honey-nut-checkout.tsx` | Campaign snapshot capture and order recovery key propagation. |
| `api/orders.ts`, `server/order-service.ts`, `server/routes.ts` | Validate an optional UUID draft key and forward it only through the server-to-server custom-order webhook. |
| `client/src/lib/site-pages.ts` | Describe incomplete-checkout support and the 30-day retention in the privacy policy. |
| `api/abandoned-carts.test.ts`, `server/abandoned-carts.test.ts`, `client/src/lib/abandoned-checkout.test.ts`, checkout tests | Cover validation, key persistence, retries, privacy, and all four checkout surfaces. |

## Task 1 — Establish tests before implementation

1. Add red tests for the pure Merchant Suite draft payload and lifecycle contract:
   - allow only the four source/path pairs;
   - require an opaque UUID key and normalized `01XXXXXXXXX` phone;
   - reject unknown fields, oversized text, invalid totals, unsafe item lists, and arbitrary campaign fields;
   - keep `contacted` on later browser updates and prohibit reopening dismissed/recovered/expired drafts;
   - permit only `open → contacted`, `open/contacted → dismissed`, and server-only recovery/expiry.
2. Add schema contract tests that require `abandoned_checkouts`, RLS, the composite workspace relationship, active-queue indexes, and no browser-role grants.
3. Add storefront red tests for strict capture payload validation, same-origin forwarding with the server-only secret, UUID persistence/clearing, and no customer data passed to Google/Meta tracking helpers.
4. Add dashboard red tests that assert Abandoned Carts appears immediately after All Orders, uses a separate count, and does not change existing order-status filter counts.
5. Add a regression test for the critical race: a real order with a valid draft key persists before capture arrives, then a late capture is immediately linked and recovered instead of surfacing as an active queue item.
6. Add a synthetic proxy-to-Merchant Suite contract test that asserts the exact bounded JSON, secret header, timeout/error mapping, and optional draft-key forwarding without using a live database.

**Checkpoint:** Run the focused tests and confirm the failures describe missing functionality, not a broken baseline.

## Task 2 — Add the data model and database safeguards

1. Invoke the Supabase skills, run the project/baseline verification scripts, and inspect the linked project schema before authoring SQL.
2. Create a forward-only migration that:
   - creates `public.abandoned_checkouts` with UUID `id`, fixed `org_id`, UUID `draft_key`, constrained lifecycle state, nullable customer fields, descriptive JSONB cart/campaign snapshots, non-negative monetary estimates, source/path constraints, lifecycle timestamps, immutable-on-update `expires_at`, and standard timestamps;
   - adds `unique (org_id, draft_key)` for idempotency and `unique (id, org_id)` solely to support a workspace-scoped foreign key;
   - indexes `(org_id, status, expires_at)` and `(org_id, created_at desc)`;
   - adds nullable `orders.abandoned_checkout_id`, a server-generated SHA-256 `orders.abandoned_draft_key_hash`, an index on `(org_id, abandoned_draft_key_hash)`, and a composite foreign key `(abandoned_checkout_id, org_id) → abandoned_checkouts(id, org_id)` without changing existing order data;
   - creates the update trigger, enables RLS, leaves anon/authenticated without direct grants or policies, and reloads PostgREST after commit.
3. Update the canonical reconciliation baseline with the same table, columns, indexes, RLS, and grants so a fresh project has the complete canonical schema. Update `scripts/verify-supabase-baseline.mjs` to derive its expected runtime-table count from one explicit table contract that now includes `abandoned_checkouts`.
4. Regenerate browser database types only if the project workflow permits it; otherwise keep browser code free of this server-only table.

**Checkpoint:** Re-run schema contract tests and `npm run verify:supabase-baseline`; do not apply the migration remotely during this implementation task.

## Task 3 — Implement Merchant Suite’s secure draft domain and API routes

1. Add a focused server-domain module that owns:
   - strict untrusted capture parsing and source/path pairing;
   - phone normalization through the existing `normalizeBdPhone()` logic;
   - item/amount/campaign bounds and redacted error categories;
   - status-transition and PII-scrubbing payload builders;
   - formatted active records safe for the dashboard.
2. In `server/index.js`, extract the existing API-key-to-workspace lookup so the custom-order webhook and the new capture endpoint use one server-only resolver. Never accept an organization id from the storefront.
3. Add `POST /api/custom-orders/abandoned-checkouts` near the custom-store webhook:
   - require `x-api-key`, resolve the workspace, and apply a central rate limit keyed by a trusted forwarded client identifier plus resolved workspace;
   - parse only the bounded capture shape; never log raw customer data;
   - insert a new record with `expires_at = created_at + 30 days`; on unique conflict update only unexpired `open`/`contacted` records, keeping their state and original expiry;
   - derive the draft-key hash server-side; if a completed order already carries that scoped hash, link and recover the late draft before returning;
   - return only `{ ok: true }` and a redacted error category.
4. Add staff-facing `GET /api/abandoned-checkouts` and `PATCH /api/abandoned-checkouts/:id` in the Orders domain section:
   - authenticate with `getToken()`/`getUser()` and resolve `orgId` via `getUserOrg()`;
   - scope every query by that `org_id` and exclude expired/terminal rows from GET;
   - order new records before contacted records, return only active count plus safe records;
   - restrict PATCH to `contacted` and `dismissed` actions; require UUID IDs, active status, unexpired data, and return the updated record.
5. Extend `/api/custom-orders/webhook` without changing its existing normal-order contract:
   - accept an optional UUID `abandoned_checkout_draft_key` only from the secret-authenticated storefront;
   - hash the incoming key server-side and persist it on the real order; resolve a matching active, unexpired record under the same `org_id` before setting the nullable order relationship;
   - create the real order and order items exactly as today; only after persistence succeeds, mark that draft recovered;
   - leave order success intact if recovery update fails, log only a redacted category, and let reconciliation repair it later.
6. Add an authenticated daily cron route that first reconciles both workspace-scoped order IDs and late-capture hashes, then expires due unresolved drafts and scrubs name, phone, address, cart, and campaign fields. Group records by resolved workspace and use scoped batch updates, each with an explicit `org_id` predicate. Add its Vercel schedule beside the existing cron.

**Checkpoint:** Run focused server/domain tests. Verify unauthenticated staff routes return 401, arbitrary org fields are rejected/ignored, terminal drafts cannot be re-opened, a late capture is recovered, and custom-order recovery does not change normal order/SMS/inventory behavior.

## Task 4 — Build the Merchant Suite queue without coupling it to orders

1. Create `src/lib/abandonedCheckouts.ts` with strongly typed API records plus pure helpers for active-state filtering, case-insensitive search across allowed staff fields, copy-summary generation, and normalized `tel:` / manual `wa.me` links.
2. Extend `OrderStatusSegmentedControl` with a `FulfillmentQueueTab` union and dedicated count prop. Render **Abandoned Carts** immediately after **All Orders**, but leave `ORDER_STATUS_FILTERS`, `countOrdersByStatus`, warehouse filtering, bulk status operations, and analytics unchanged.
3. Create `AbandonedCheckoutQueue` using Phosphor icons with `weight="light"` and the existing minimalist dashboard language. It must:
   - present capture time, source, optional name/address, phone, cart summary, estimated total, and New/Contacted state responsively;
   - offer manual call, manual WhatsApp, copy summary, mark contacted, and a confirmed dismiss action;
   - expose clear keyboard labels, durable focus states, empty/loading/error states, and no direct conversion, courier, fraud, or automated-message controls.
4. Update `Dashboard` to fetch/cache/poll abandoned records independently through `apiFetch()`, derive its count/search separately, switch toolbars/table/pagination safely by queue tab, and patch cached records after staff actions. The orders query/cache must remain the only input to order counts and P&L.
5. Update/add component tests for tab ordering, independent counts, search, safe contact links, copy, dismissal confirmation, keyboard access, and mobile layout.

**Checkpoint:** Run the dashboard/component test subset and inspect the queued view with synthetic fixtures. Ensure selecting the new tab cannot select real orders or enable bulk status updates.

## Task 5 — Build the storefront’s same-origin capture boundary

1. Create a shared server-side capture service for Vercel and local Express. It must parse a strict request body, cap body size/timeouts, reject unknown fields, ensure source/path consistency, validate phone and all numeric/string/item limits, and forward only the validated body to Merchant Suite with `CUSTOM_ORDERS_API_KEY`.
2. Add Vercel `POST /api/abandoned-carts` and the equivalent local Express route. Both must return generic non-PII errors, avoid request-body logging, preserve capture non-blocking behavior, and rely on the central Merchant Suite endpoint for durable rate limiting.
3. Add a browser capture helper that:
   - creates one UUID per checkout source in `sessionStorage` after the first valid phone, with safe in-memory fallback when storage is unavailable;
   - debounces updates, flushes on field blur, and retries after later form interaction, focus, or online events;
   - exposes `draftKey`, `flush`, and `clear` to checkout code; clears only after a confirmed real order;
   - never calls Google Analytics, Meta, merchant visitor tracking, route URLs, console logging, or query strings with the shopper’s data.
4. Wire the helper into the main cart dialog and all three campaign forms. Keep the main dialog's existing uncontrolled inputs: use a form ref plus input/blur snapshots rather than duplicating field state. Each surface supplies its fixed source/path, current product/variant/quantity/price/delivery snapshot, optional name/address, and allowlisted UTM values. Add the non-blocking support/retention notice near each form.
5. Extend both Vercel and local order request validators/types with optional UUID `draftKey`. Forward it internally as `abandoned_checkout_draft_key` only after the normal server-side order validation; do not expose the custom-store key or a workspace id to browser code.
6. On submit, attempt an immediate bounded capture flush, but never fail or visibly delay a valid real order because capture is unavailable. Send its available key with the normal order. Clear the session key only after the order response is confirmed.
7. Update the storefront privacy policy to explain incomplete-checkout support and 30-day retention.

**Checkpoint:** Run storefront unit/type tests. Verify a failed capture still permits a successful order, the bundle/pack update reuses its draft key, and browser bundles contain neither the secret nor an organization identifier.

## Task 6 — Integration verification and review

1. Execute focused test suites after each task, then complete both projects’ full test/type/build/lint commands.
2. Use synthetic data against local endpoints to confirm this sequence for each checkout surface: valid phone creates one draft, state changes update it, manual queue actions work, successful order recovers it, and an expiry fixture is scrubbed.
3. Search changed browser/server code for phone, address, customer name, `CUSTOM_ORDERS_API_KEY`, and `org_id` to verify data is not leaked into analytics/logs/URLs and secrets remain server-only.
4. Run the engineering, security, database, diff-review, UI QA, and verification skills before declaring completion.
5. Commit coherent changes separately in each repository with imperative messages, without touching the original worktrees’ unrelated files.

## Recovery data flow

```text
Browser checkout (valid 01XXXXXXXXX)
  │  sessionStorage draft_key, bounded cart snapshot
  ▼
Same-origin storefront /api/abandoned-carts
  │  validates payload; keeps CUSTOM_ORDERS_API_KEY server-side
  ▼
Merchant Suite custom-store capture endpoint
  │  resolves org from API key; inserts/updates active draft
  ├─────────────────────────────────────────────────────────────┐
  │                                                               │
  ▼                                                               │
Normal storefront /api/orders ── draft_key ──► custom order webhook
                                                    │
                                                    ├─ hash draft_key on order
                                                    ├─ link existing draft, if present
                                                    └─ recover only after order/items persist
                                                                    │
Late draft capture ── matching order hash ─────────────────────────┘
  │
  └─ link + recover immediately, never show a false active lead
```

```text
open ── staff contact ──► contacted
 │                         │
 ├── staff dismiss ────────┴──► dismissed
 ├── real order persists ─────► recovered
 └── expires after 30 days ───► expired + personal-data scrub

Terminal states never reopen from a browser retry.
```

## What already exists

- The custom-store order route already resolves `org_id` exclusively from `x-api-key`; reuse that resolver instead of accepting a browser workspace value.
- The storefront already has production Vercel and local Express order paths; use the same paired-handler pattern for capture validation and forwarding.
- `normalizeBdPhone()` already handles the canonical Bangladesh `01XXXXXXXXX` format; reuse it server-side for capture rather than introducing a second normalizer.
- Merchant Suite’s dashboard already has polling, authenticated `apiFetch()`, tab controls, pagination, and a confirmation dialog primitive; the queue extends those without changing order counts.
- Existing order-item persistence cleans up failed custom orders; recovery status changes must run only after that durable path succeeds.

## Not in scope

- Automated SMS, WhatsApp, email, Meta audience, or advertising recovery actions. V1 provides only staff-initiated call/WhatsApp links.
- Inventory reservation, captured-price guarantees, fraud checks, courier dispatch, or direct draft-to-order conversion.
- Anonymous cart tracking before a valid phone number is entered.
- Applying the migration to the remote Supabase project or creating real customer data during development.
- Reformating unrelated checkout files, including the compact Honey Nut component, beyond the minimal capture integration.

## Test coverage map

```text
CODE PATHS                                           USER FLOWS
Merchant capture parser                              Storefront checkout
  ├─ valid bounded payload [unit]                      ├─ valid phone → one draft [integration]
  ├─ invalid/unknown/oversize [unit]                   ├─ edit cart/pack → same draft [integration]
  ├─ terminal update ignored [unit]                    ├─ capture network failure → order still works [integration]
  └─ late order hash → recovered [regression]          └─ success → recovered, not an order count [→E2E QA]

Staff queue                                          Lifecycle maintenance
  ├─ separate tab/count [component]                    ├─ contact/copy/dismiss [component]
  ├─ search/link formatting [unit]                      ├─ expired record excluded [server]
  └─ auth/org guard [route]                             └─ PII scrub + reconciliation [server]

Proxy boundary
  ├─ Vercel handler [unit]
  ├─ local Express handler [unit]
  └─ secret-header/payload contract [integration]
```

## Failure modes and safeguards

| Failure mode | Safeguard | Verification |
| --- | --- | --- |
| Browser capture fails or storage is unavailable | Non-blocking retry and memory fallback; valid order flow remains independent | Storefront helper and checkout tests |
| Order wins the race against draft persistence | Hashed draft key on order links/recover late capture | Critical late-capture regression test |
| Staff or public client crosses a workspace boundary | Auth/API-key resolver plus `org_id` on every data query | Route and source-guard tests |
| Browser payload is malformed or abusive | Strict allowlist, size bounds, same-origin proxy, central rate limit | Handler/parser contract tests |
| Cron creates database N+1 load | Batch updates scoped per resolved workspace | Cleanup helper tests and code review |
| Expired customer data remains visible | Active GET filters expiry; daily scrub removes customer fields | Lifecycle tests |

## Parallelization

| Workstream | Modules touched | Depends on |
| --- | --- | --- |
| Schema and server domain | `supabase/`, `server/`, scripts | — |
| Storefront capture/proxy | `api/`, `server/`, `client/src/` | Shared payload contract |
| Dashboard queue | `src/components/`, `src/lib/`, `src/pages/` | Merchant Suite API response contract |
| Verification | both test suites, local browser QA | All above |

- Lane A: schema and Merchant Suite API, sequential.
- Lane B: storefront capture helper and paired proxy handlers, parallel with Lane A after the payload contract is fixed.
- Lane C: dashboard queue, parallel with Lane B after the API response type is fixed.
- Lane D: cross-repository contract tests and browser QA after A–C.

The current session will implement sequentially to preserve the two isolated worktrees and avoid cross-repository contract churn.

## Implementation Tasks

- [ ] **T1 (P1, human: ~3h / agent: ~25m)** — Schema and recovery linkage
  - Surfaced by: Architecture review, late-capture race.
  - Files: `supabase/`, `server/`, `scripts/`.
  - Verify: migration/baseline tests and late-capture regression coverage.
- [ ] **T2 (P1, human: ~3h / agent: ~30m)** — Secure capture boundary
  - Surfaced by: Architecture and test review, server-to-server payload seam.
  - Files: storefront `api/`, `server/`, `client/src/lib/`.
  - Verify: strict handler and synthetic contract tests.
- [ ] **T3 (P2, human: ~2h / agent: ~25m)** — Staff recovery queue
  - Surfaced by: Code-quality review, separate order/lead state.
  - Files: Merchant Suite `src/lib/`, `src/components/`, `src/pages/`.
  - Verify: component/dashboard tests and keyboard/mobile checks.
- [ ] **T4 (P1, human: ~3h / agent: ~30m)** — Four checkout integrations and privacy notice
  - Surfaced by: Approved feature scope.
  - Files: storefront checkout components and privacy page data.
  - Verify: helper/retry/order-success tests for each surface.
- [ ] **T5 (P1, human: ~2h / agent: ~20m)** — Full verification and security review
  - Surfaced by: Privacy, workspace guard, and data-retention requirements.
  - Files: both repositories’ tests and review artifacts.
  - Verify: full test/type/lint/build commands and synthetic browser QA.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | Not run |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | Timed out | One verifier issue surfaced and was folded into the plan |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | Clear | Four issues addressed: late-capture race, form-state churn, cross-repo contract, cron batching |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | Deferred until implementation |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | Not run |

**VERDICT:** ENG CLEARED — ready to implement.
NO UNRESOLVED DECISIONS
