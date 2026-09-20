# Litchi Flower Honey Free Delivery Implementation Plan

> **For agentic workers:** Execute inline and review each repository after its focused test cycle.

**Goal:** Add a Litchi Flower Honey free-delivery promotion and default `২ কেজি` variant selection without changing other storefront products.

**Architecture:** Extend the existing product allowlists in the storefront and Merchant-Suite with Litchi's canonical UUID, slug, and Bengali name fallback. The public order handler calculates shipping after resolving validated catalog items, so it will force zero shipping for matching items; the storefront dialog uses the same identity rule for checkout feedback. A small product-selection helper chooses the preferred bundle only for the Litchi slug.

**Tech Stack:** React + TypeScript + Vite storefront, Express ESM Merchant-Suite, Vitest, Node test runner.

## Global Constraints

- Preserve the existing Black Seed Flower Honey free-delivery rule.
- Match Litchi by product ID `11043874-e90d-4160-bce7-38723b703706`, slug `litchi-flower-honey`, and name `লিচু ফুলের মধু`.
- Keep all other products on their current delivery and first-variant behavior.
- Backend shipping remains authoritative for saved orders.
- Do not modify credentials, database schema, or unrelated checkout behavior.

---

### Task 1: Add Merchant-Suite regression coverage

**Files:**
- Modify: `.context/litchi-commerceos/src/test/shippingCalculation.test.ts`

- [ ] Add tests proving `cartHasFreeDeliveryProduct` returns true for a Litchi-only cart and a mixed cart, and false for an unrelated product cart.
- [ ] Run `npm test -- src/test/shippingCalculation.test.ts`; the new Litchi cases must fail before the implementation change.

### Task 2: Implement authoritative Merchant-Suite shipping

**Files:**
- Modify: `.context/litchi-commerceos/server/shippingCalculation.js`
- Modify: `.context/litchi-commerceos/src/test/shippingCalculation.test.ts`

- [ ] Add the Litchi UUID, slug, and Bengali name fallback to the existing free-delivery allowlist, retaining Black Seed matching.
- [ ] Keep the existing handler flow that checks `cartHasFreeDeliveryProduct(orderItems)` after validated catalog resolution and sets `shipping = 0` before inserting `orders.delivery_rate`.
- [ ] Re-run the focused shipping tests and confirm all pass.

### Task 3: Add storefront regression coverage

**Files:**
- Modify: `.context/litchi-storefront/client/src/lib/free-delivery.test.ts`
- Create: `.context/litchi-storefront/client/src/lib/product-selection.test.ts`

- [ ] Add Litchi slug/name tests to the existing free-delivery helper suite.
- [ ] Add tests for `getDefaultBundleIndex("litchi-flower-honey", [{ title: "১ কেজি" }, { title: "২ কেজি" }]) === 1`, first-bundle behavior for another slug, and fallback when no `২ কেজি` option exists.
- [ ] Run the focused tests and confirm they fail before implementation.

### Task 4: Implement storefront UI behavior

**Files:**
- Modify: `.context/litchi-storefront/client/src/lib/free-delivery.ts`
- Create: `.context/litchi-storefront/client/src/lib/product-selection.ts`
- Modify: `.context/litchi-storefront/client/src/pages/product.tsx`
- Modify: `.context/litchi-storefront/client/src/components/order-dialog.tsx`

- [ ] Extend the storefront allowlist with the Litchi UUID, slug, and Bengali name fragment while preserving Black Seed.
- [ ] Implement `getDefaultBundleIndex(slug, bundles)` to return the `২ কেজি` index only for `litchi-flower-honey`, otherwise index `0`, with index `0` fallback if unavailable.
- [ ] Apply this helper when the product's async bundles are ready and when the slug changes, while preserving explicit user selection.
- [ ] Show product-specific free-delivery copy for Litchi; leave threshold and Black Seed copy unchanged.
- [ ] Run the focused storefront tests and confirm all pass.

### Task 5: Full verification and scope review

**Files:**
- Review all files changed in Tasks 1–4.

- [ ] Merchant-Suite: run `npm test`, `npm run lint`, `npm run build`, and `node --check server/index.js`.
- [ ] Storefront: run `npm test`, `npm run check`, and `npm run build`.
- [ ] Run `git diff --check` in both worktrees and inspect diffs to confirm only Litchi behavior, matching tests, and product-specific copy changed.
