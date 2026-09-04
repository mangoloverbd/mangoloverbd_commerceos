# Three-Column Order Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the stacked order-detail form with a responsive customer/catalog/cart editor and persist fixed or percentage discounts on individual order items.

**Architecture:** Keep /orders/:id as the orchestration page, split the three visual regions into focused components, and centralize cart math in pure TypeScript helpers. Extend order_items and the existing replace_order_items transaction so catalog prices, discount amounts, inventory deltas, aggregate discount, and net order price remain server-authoritative and atomic.

**Tech Stack:** React 18, TypeScript, TanStack Query v5, Tailwind CSS, Framer Motion, Phosphor Icons, Express 5, Supabase/PostgreSQL, Vitest, Testing Library.

## Global Constraints

- Preserve the authenticated /orders/:id route and fixed Mango Lover BD org_id guard.
- Use apiFetch() for every frontend API request.
- Preserve inventory validation and courier-dispatch locking.
- Fixed discounts are taka off each unit; percentages must be between 0 and 100.
- Ignore client-provided prices, calculated discounts, totals, stock, names, and workspace IDs.
- Preserve existing unallocated order discounts as a legacy remainder.
- Preserve the dashboard design language.
- Do not implement customer reassignment, courier-history refresh, upselling, or a checkout wizard.

---

### Task 1: Persist Item Discounts Atomically

**Files:**
- Create: supabase/migrations/20260904000100_add_order_item_discounts.sql
- Modify: src/integrations/supabase/types.ts
- Modify: src/test/order-items.test.ts

**Interfaces:**
- Consumes: public.order_items, public.orders.discount, public.replace_order_items(uuid, uuid, jsonb).
- Produces: discount_type, discount_value, unit_discount fields and an RPC accepting discountType and discountValue per item.

- [x] **Step 1: Write failing schema and type tests**

Add and apply discountMigrationPath in the PostgreSQL harness. Extend the typed row fixture with:

    discount_type: null,
    discount_value: 0,
    unit_discount: 0,

Add SQL assertions that reject negative values, unsupported types, percentages above 100, and unit_discount greater than unit_price.

- [x] **Step 2: Write failing transaction tests**

Call replace_order_items with fixed and percentage JSON values. Assert authoritative unit_price, calculated unit_discount, aggregate orders.discount, and net orders.price. Add a legacy case proving that orders.discount minus existing item discounts survives replacement. Add rollback checks for invalid discounts and insufficient stock.

- [x] **Step 3: Verify RED**

Run: npm test -- src/test/order-items.test.ts

Expected: failures for the absent migration, fields, and calculations.

- [x] **Step 4: Add the data-preserving migration**

Add nullable discount_type constrained to fixed or percentage, non-negative discount_value numeric(12,2) default 0, and non-negative unit_discount numeric(12,2) default 0 constrained not to exceed unit_price.

Redefine replace_order_items. Resolve authoritative catalog price, then calculate:

    fixed: unit_discount = discount_value
    percentage: unit_discount = round(unit_price * discount_value / 100, 2)
    none: unit_discount = 0

Before deleting old rows, calculate legacy_discount as the non-negative difference between locked_order.discount and the sum of existing item unit_discount times quantity. Update orders.discount to legacy_discount plus new item discounts and orders.price to gross merchandise subtotal minus the aggregate discount. Retain all ownership checks, ordered locks, inventory deltas, grants, and security-invoker behavior.

- [x] **Step 5: Update generated TypeScript shapes**

Add the three fields to Row, Insert, and Update, with optional defaults in Insert/Update.

- [x] **Step 6: Verify GREEN**

Run: npm test -- src/test/order-items.test.ts

Expected: all schema and transaction tests pass.

### Task 2: Validate Discount Intent and Enrich Detail Data

**Files:**
- Modify: server/index.js
- Modify: src/test/order-items.test.ts

**Interfaces:**
- Consumes: Task 1 RPC fields and org-scoped catalog tables.
- Produces: normalized item payload { productId, variantId, quantity, discountType, discountValue } and enriched display items.

- [x] **Step 1: Write failing API contract tests**

Require discountType and discountValue validation, fixed/percentage allowlisting, the 100-percent ceiling, rejection of client price/unitDiscount, and org_id guards on catalog enrichment.

- [x] **Step 2: Verify RED**

Run: npm test -- src/test/order-items.test.ts

Expected: contract failures.

- [x] **Step 3: Normalize the request boundary**

For each item, accept null/fixed/percentage plus a finite non-negative numeric value. Reject percentage above 100. Pass only identity, quantity, discountType, and discountValue to the RPC. Never accept a calculated unit discount or total.

- [x] **Step 4: Enrich GET and PATCH item responses**

Batch-load referenced org-scoped products, variants, and product images. Return product_slug, image_url, weight_kg, and available_stock as display-only metadata. Variant weight/stock wins over product weight/stock. Add the quantity already reserved by this order to editable availability.

- [x] **Step 5: Handle detached legacy rows explicitly**

Keep customer-only saves possible. If the cart draft still contains an item without product_id/variant_id and the cart changes, return a clear UI validation message requiring the merchant to remove or replace that legacy item; never silently drop it.

- [x] **Step 6: Verify GREEN**

Run: npm test -- src/test/order-items.test.ts

Expected: all API and transaction tests pass.

### Task 3: Add Pure Cart Models and Math

**Files:**
- Create: src/lib/orderEditor.ts
- Create: src/test/orderEditor.test.ts

**Interfaces:**
- Produces: DiscountType, OrderEditorItem, CatalogProduct, calculateUnitDiscount(), calculateCartTotals(), matchesCatalogSearch(), and upsertCartItem().

- [x] **Step 1: Write failing helper tests**

Cover fixed and percentage rounding, quantity multiplication, legacy remainder, delivery fee, invalid-value clamping, name/slug/variant search, duplicate incrementing, and immutable updates.

Example assertions:

    expect(calculateUnitDiscount(480, "fixed", 30)).toBe(30);
    expect(calculateUnitDiscount(480, "percentage", 10)).toBe(48);

- [x] **Step 2: Verify RED**

Run: npm test -- src/test/orderEditor.test.ts

Expected: module-not-found failure.

- [x] **Step 3: Implement typed pure helpers**

Define DiscountType as "fixed" | "percentage". Round taka to two decimals. Calculate gross subtotal, item discount, preserved legacy discount, net merchandise total, and final total. Return new arrays and objects for all cart updates.

- [x] **Step 4: Verify GREEN**

Run: npm test -- src/test/orderEditor.test.ts

Expected: all helper tests pass.

### Task 4: Build Controlled Three-Column Components

**Files:**
- Create: src/components/order-editor/CustomerPanel.tsx
- Create: src/components/order-editor/CatalogPanel.tsx
- Create: src/components/order-editor/CartPanel.tsx
- Create: src/components/order-editor/DiscountEditor.tsx
- Modify: src/test/order-detail.test.ts

**Interfaces:**
- Consumes: Task 3 types/helpers and controlled props.
- Produces: accessible panels without direct data fetching.

- [x] **Step 1: Write failing layout and customer tests**

Assert regions named Customer and order, Product catalog, and Order cart. Test read-only customer values, Edit, Apply, Cancel, operational metadata, and courier locking.

- [x] **Step 2: Write failing catalog/cart tests**

Test search by name/slug/variant, images, weight, availability, product/variant add, duplicate increment, quantity stepper, removal, and empty/error states.

- [x] **Step 3: Write failing discount interaction tests**

Test Add discount, mode selection, preview, Apply, Remove discount, validation, original/net prices, and summary totals.

- [x] **Step 4: Verify RED**

Run: npm test -- src/test/order-detail.test.ts

Expected: missing-region and interaction failures.

- [x] **Step 5: Implement CustomerPanel**

Render summary by default, inline fields only in edit mode, Apply/Cancel draft behavior, and existing order metadata.

- [x] **Step 6: Implement CatalogPanel**

Render search, query states, product cards, primary images, slug identifier, adjusted prices, variant/product weights, available stock, and Add to cart actions. Use Phosphor icons with weight="light".

- [x] **Step 7: Implement DiscountEditor**

Use the existing popover primitives. Keep local mode/value until Apply, validate fixed 0..unitPrice and percentage 0..100, show live unit/line totals, and expose Remove only for an existing discount.

- [x] **Step 8: Implement CartPanel**

Render cart cards, variant/weight metadata, quantity and delete controls, discounts, empty/legacy/locked states, and a sticky subtotal/discount/delivery/final summary.

- [x] **Step 9: Verify GREEN**

Run: npm test -- src/test/order-detail.test.ts

Expected: component interactions pass.

### Task 5: Integrate the Editor Page

**Files:**
- Modify: src/pages/OrderDetail.tsx
- Modify: src/test/order-detail.test.ts

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: complete /orders/:id editing workflow.

- [x] **Step 1: Write failing save-payload and cache tests**

Require item payloads to contain only productId, variantId, quantity, discountType, and discountValue. Verify failed saves keep the draft and successful saves replace cached detail with the enriched response.

- [x] **Step 2: Verify RED**

Run: npm test -- src/test/order-detail.test.ts

Expected: old payload and layout fail.

- [x] **Step 3: Refactor OrderDetail into orchestration state**

Retain route loading/not-found behavior. Initialize customer/cart drafts once per authoritative load, eagerly load the visible catalog, compute the legacy discount remainder, and connect controlled panels.

- [x] **Step 4: Add the responsive shell**

Use an xl three-column grid with minimum widths for customer, catalog, and cart. Give desktop panels bounded internal scrolling and use natural stacked flow below xl.

- [x] **Step 5: Persist customer and discounted cart drafts**

Save customer fields through the current authenticated order PATCH and items through the item PATCH. Disable duplicate submissions, block changed carts containing detached legacy rows, and surface errors without discarding drafts.

- [x] **Step 6: Verify GREEN**

Run: npm test -- src/test/order-detail.test.ts src/test/orderEditor.test.ts

Expected: all editor tests pass.

### Task 6: Verification and Review

**Files:**
- Modify only files required to fix verification failures.

- [x] **Step 1: Verify the Supabase target and baseline**

Run:

    npm run verify:supabase-project
    npm run verify:supabase-baseline

Expected: project and baseline checks pass. Do not apply the migration remotely.

- [x] **Step 2: Run focused tests**

Run:

    npm test -- src/test/order-items.test.ts src/test/orderEditor.test.ts src/test/order-detail.test.ts

Expected: all focused suites pass.

- [x] **Step 3: Run full checks**

Run:

    npm test
    npm run lint
    npm run build

Expected: all pass.

- [x] **Step 4: Run safety checks**

Run:

    npm audit --audit-level=high
    git diff --check
    git diff --stat

Expected: no new high-severity dependency issue, whitespace error, secret, missing auth guard, unscoped user-data query, or client-trusted monetary calculation. Report network-blocked audit explicitly.

- [x] **Step 5: Perform final review**

Verify org_id on all user-data queries, authentication on both endpoints, service-role-only RPC execution, security-invoker behavior, non-negative discount math, atomic rollback, and courier locking.

- [x] **Step 6: Commit if Git metadata is writable**

Stage only the feature files and commit with: feat: add discounted three-column order editor.

Resolution: implementation is complete, but no commit was created because the work began on `main` with pre-existing uncommitted Task 1–2 changes. The full feature diff remains available for the user to review and commit safely.

## GSTACK REVIEW REPORT

### Review Summary

| Review | Runs | Status | Findings |
|---|---:|---|---|
| Scope challenge | 1 | Accepted | The focused component split is justified by separate database, API, pure-math, and UI responsibilities. |
| Architecture | 1 | Clear after fixes | Auth, fixed-workspace guards, server-authoritative pricing, transactional stock/totals, and service-role-only RPC access are preserved. |
| Code quality | 1 | Clear after fixes | Fixed false courier-lock messaging while placeholder data is shown. No unresolved duplication or error-handling issue blocks completion. |
| Tests | 1 | Clear | Added schema, transaction, rollback, request-boundary, helper, interaction, loading, empty, error, legacy, and courier-lock regression coverage. |
| Performance | 1 | Clear | Catalog metadata uses batched queries; no N+1 query or new unbounded client loop was introduced. |
| Pre-landing safety | 1 | Clear after fixes | Aligned the RPC dispatch predicate with the API predicate so courier status alone does not create a false lock. |
| Outside voice | 0 | Skipped | Delegated/subagent review was not used in this inline execution session. |

### Architecture and Data Flow

```text
Authenticated order editor
  ├─ GET /api/orders/:id ── org-scoped order/items ── batched catalog enrichment
  ├─ GET /api/products ──── org-scoped visible catalog
  └─ Save
      ├─ PATCH /api/orders/:id ───── customer fields only
      └─ PATCH /api/orders/:id/items
          └─ replace_order_items RPC
              ├─ lock order and inventory rows
              ├─ reject dispatched/order-workspace/catalog violations
              ├─ resolve catalog prices and calculate discounts
              ├─ apply inventory deltas and replace lines
              └─ update quantity, discount, product summary, and net price atomically
```

### Test Coverage

```text
CODE PATHS                                      USER FLOWS
[★★★] Migration constraints and rollback       [★★★] Load cached and authoritative order
[★★★] Org/auth and request validation           [★★★] Edit/apply/cancel customer details
[★★★] Price, discount, stock transaction        [★★★] Search/add/increment/remove cart lines
[★★★] Legacy discount preservation              [★★★] Add/preview/remove item discounts
[★★★] Courier dispatch serialization            [★★★] Empty/error/locked/legacy states
[★★★] Pure cart math and immutable updates      [★★★] Save success, pending, and failure

COVERAGE: all planned paths have automated coverage
```

### Failure Modes

| Failure mode | Test | Handling | User-visible result |
|---|---|---|---|
| Wrong workspace or missing order | Yes | API org guard and 404 | Not-found state |
| Malformed IDs, quantities, or discount intent | Yes | API validation and DB constraints | Clear request error |
| Stale or client-forged monetary values | Yes | Monetary fields rejected; prices recalculated in RPC | Save error without draft loss |
| Insufficient stock or concurrent inventory edit | Yes | Ordered row locks and transactional rollback | Conflict message without partial mutation |
| Courier dispatch races with item edits | Yes | Order row serialization and dispatch predicate | Cart edit rejected after dispatch |
| Catalog request failure | Yes | Query error state and retry action | Retryable catalog message |
| Detached legacy line in changed cart | Yes | Client and server validation | Remove-or-replace guidance |
| Customer save succeeds before cart save fails | Yes, component save retry path | Updated customer cache retained; cart draft retained | Cart error remains recoverable |

Critical silent gaps: 0.

### What Already Exists

- Existing authenticated order PATCH is reused for customer fields.
- Existing `replace_order_items` RPC is extended rather than replaced with client-side writes.
- Existing `apiFetch()`, TanStack Query cache, React Router route, product catalog API, cache purge flow, and Radix popover primitives are reused.
- Existing fixed Mango Lover BD `org_id` guards remain on order, item, product, variant, and image queries.

### NOT in Scope

- Customer reassignment: this editor changes contact fields only.
- Courier-history refresh: operational metadata remains read-only.
- Upselling or checkout wizard behavior: the catalog only edits the current order cart.
- Catalog price or stock editing: catalog values remain authoritative external inputs.
- Dependency upgrades for existing audit findings: no package dependency changed in this feature.
- Node runtime policy update: the documented Node 20 mismatch with current Supabase client support predates this feature.

### Parallelization

Sequential implementation was used because the pre-existing uncommitted migration/API work and the shared order-editor contracts made isolated worktrees more likely to conflict than help.

### Implementation Tasks

All review-generated fixes were completed in this working tree:

- [x] Align API and RPC courier-dispatch predicates.
- [x] Distinguish placeholder loading from a confirmed courier lock.
- [x] Cap duplicate catalog additions at editable availability.
- [x] Normalize a null discount mode to a zero discount value at the API boundary.

### Verification Evidence

- `npm run verify:supabase-project` — passed for `ldiktvcavyabivpxfwpn`.
- `npm run verify:supabase-baseline` — both baseline resets passed.
- Focused tests — 3 files, 79 tests passed.
- Full tests — 70 files, 407 tests passed.
- `npm run lint` — passed with 30 pre-existing warnings and zero errors.
- `npm run build` — passed; existing bundle-size warning remains.
- `npm audit --audit-level=high` — reports 8 existing dependency advisories (2 high, 6 moderate); no dependency file changed.
- `git diff --check` — passed.
- Remote migration application — intentionally not performed.
- Browser QA — not run because the checkout is intentionally dirty and no authenticated browser target was supplied; interaction behavior is covered by Testing Library.

### Verdict

**CLEARED** — the implementation matches the approved design and plan, with no open auth, workspace-isolation, pricing-trust, inventory-atomicity, discount-integrity, or courier-lock issue found.

NO UNRESOLVED DECISIONS
