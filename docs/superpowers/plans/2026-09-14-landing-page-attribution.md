# Landing Page Order Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the `/step/...` landing-page path that generated each storefront order and show it in the Merchant Suite Order Editor.

**Architecture:** The storefront captures the current pathname at checkout, validates it as a local `/step/<slug>` path, and sends it as `landingPagePath` through the existing order service. Merchant Suite validates the optional path at the public versioned order boundary and stores it in a nullable `orders.landing_page_path` column. Existing `source: "website"` remains unchanged, and staff can view attribution in the Order Editor without adding landing pages to the source dropdown.

**Tech Stack:** React + TypeScript + Vite storefront, Express + Supabase Merchant Suite, PostgreSQL migration, Vitest/node:test.

## Global Constraints

- Keep landing-page orders under the canonical `website` order source.
- Accept only normalized local paths matching `/step/<slug>`; never persist an arbitrary external URL.
- Preserve orders created from the homepage, product pages, manual creation, social channels, and legacy clients when the field is absent.
- Keep all Merchant Suite database access workspace-scoped with the resolved Mango Lover BD `org_id`.
- Do not expose service-role credentials or add direct storefront writes to Supabase.
- Do not add landing pages as Order source dropdown options.

---

### Task 1: Define and test landing-path normalization

**Files:**
- Create: `../mangoloverbd_storefront/client/src/lib/landing-page-attribution.ts`
- Test: `../mangoloverbd_storefront/client/src/lib/landing-page-attribution.test.ts`

**Interfaces:**
- Produces `normalizeLandingPagePath(pathname: string): string | undefined` and `currentLandingPagePath(): string | undefined`.
- Valid paths are normalized to a slash-prefixed, no-trailing-slash `/step/<slug>` path.

- [ ] Write tests for all four current paths, trailing slashes, query/hash removal, homepage/product paths returning `undefined`, full external URLs returning `undefined`, and invalid slug characters returning `undefined`.
- [ ] Run the focused storefront test and observe the expected missing-module failure.
- [ ] Implement the minimal normalization helper.
- [ ] Run the focused test again and verify it passes.

### Task 2: Thread attribution through storefront checkout

**Files:**
- Modify: `../mangoloverbd_storefront/api/orders.ts`
- Modify: `../mangoloverbd_storefront/server/order-service.ts`
- Modify: `../mangoloverbd_storefront/client/src/features/kalojira-mixed/kalojira-checkout.tsx`
- Modify: `../mangoloverbd_storefront/client/src/features/sundarbans-honey/honey-checkout.tsx`
- Modify: `../mangoloverbd_storefront/client/src/features/honey-nut/honey-nut-checkout.tsx`
- Test: `../mangoloverbd_storefront/api/orders.test.ts`
- Test: `../mangoloverbd_storefront/server/order-service.test.ts`

**Interfaces:**
- `OrderRequest.landingPagePath?: string` is optional and normalized by the storefront API validator.
- The existing Merchant Suite request gains `landingPagePath` only when present.

- [ ] Add failing validator and forwarding assertions for `/step/katimon-mango`, trailing-slash normalization, and omission for non-landing orders.
- [ ] Run the focused tests and observe failure before implementation.
- [ ] Add the optional field to validation/types, include it in the upstream request, and add `currentLandingPagePath()` to each landing-page checkout payload. Katimon inherits this through the shared Kalojira checkout.
- [ ] Run the focused storefront tests and verify all pass.

### Task 3: Store and validate attribution in Merchant Suite

**Files:**
- Create: `supabase/migrations/20260914000001_add_order_landing_page_path.sql`
- Modify: `server/index.js:11308-11525`
- Modify: `src/integrations/supabase/types.ts`
- Test: `src/test/orderSourceRouteWiring.test.ts`

**Interfaces:**
- Public order submissions accept optional `landingPagePath` / `landing_page_path` and store normalized `landing_page_path`.
- Invalid supplied paths receive HTTP 400; omitted paths remain null.

- [ ] Add failing route-wiring assertions for the allowlist, normalizer, and public order insert row.
- [ ] Run the focused Merchant Suite tests and observe failure.
- [ ] Add the nullable column migration, a server-side normalizer, public-boundary validation, and the insert-row field while preserving the `org_id` guard and Website source.
- [ ] Update generated TypeScript order Row/Insert/Update types with the nullable column.
- [ ] Run focused tests and verify they pass.

### Task 4: Display attribution in the Order Editor

**Files:**
- Modify: `src/pages/OrderDetail.tsx`
- Modify: `src/components/order-editor/CustomerPanel.tsx`
- Modify: `src/components/OrdersTable.tsx`
- Test: `src/test/order-detail.test.ts`

**Interfaces:**
- Existing order detail responses expose `landing_page_path` from `select("*")`.
- Customer panel renders the value read-only, while source editing remains unchanged.

- [ ] Add a failing test that renders a landing-page order and expects the normalized path as a read-only Landing page value.
- [ ] Run the focused test and observe failure.
- [ ] Add the optional field to the frontend order types and render a labeled link/text in the customer-and-order panel only when present.
- [ ] Run focused tests and verify source editing and dispatched-order behavior remain green.

### Task 5: Full verification

- [ ] Run storefront tests and build from `../mangoloverbd_storefront`.
- [ ] Run Merchant Suite tests, lint, build, and `git diff --check`.
- [ ] Confirm `src/pages/NewOrder.tsx` and the source option list are unchanged.
- [ ] Commit each repository’s implementation with imperative feature commits.
