# Multi-Item Storefront Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve two distinct storefront cart products as two Merchant Suite order items and display legacy multi-product orders correctly.

**Architecture:** Add one small server-side parser for legacy comma-separated product summaries. Use it in the custom-store webhook for multi-line routing and RPC persistence, and in the authenticated order-detail fallback to produce one virtual item per legacy line. The canonical structured public checkout path remains unchanged.

**Tech Stack:** Express/Node ESM, Supabase RPC `replace_order_items`, React 18, Vitest, Testing Library.

## Global Constraints

- Preserve the fixed Mango Lover BD `org_id` guard on every database operation.
- Do not accept an arbitrary organization identifier from storefront input.
- Keep server-authoritative pricing and inventory mutation in `replace_order_items`.
- Do not link ambiguous or unmatched legacy product text to catalog inventory.
- Use `apiFetch()` for frontend API calls; no frontend API changes are required.

---

### Task 1: Parse legacy multi-product summaries

**Files:**
- Create: `server/orderItemParsing.js`
- Test: `src/test/orderItemParsing.test.ts`

**Interfaces:**
- Produces `parseLegacyProductLines(productText): Array<{ productName: string; quantity: number }>` for server route and detail fallback code.

- [x] **Step 1: Write the failing test**

  `src/test/orderItemParsing.test.ts` asserts `Premium Mango x1, Honey Jar (500g) x2` becomes two named lines with quantities `1` and `2`.

- [x] **Step 2: Run test to verify it fails**

  Run `npm test -- src/test/orderItemParsing.test.ts`.
  Expected: import failure because `server/orderItemParsing.js` does not exist.

- [x] **Step 3: Write minimal implementation**

  Split on commas outside parentheses, trim empty segments, remove a leading `Nx` or trailing `xN`/`×N`, and clamp missing or invalid quantities to `1`.

- [x] **Step 4: Run test to verify it passes**

  Run `npm test -- src/test/orderItemParsing.test.ts`.

- [x] **Step 5: Add parser edge-case coverage**

  Cover comma-containing variant attributes, Shopify's leading `Nx Product` format, and the legacy single-product quantity fallback.

### Task 2: Persist all matched webhook lines

**Files:**
- Modify: `server/index.js:5698-5731`
- Modify: `src/test/orderRoutingWiring.test.ts`

**Interfaces:**
- Consumes `parseLegacyProductLines()` and existing `resolveOrderRouting()` output.
- Produces one `replace_order_items` RPC entry for every complete resolved line; retains the current no-link fallback for incomplete matches.

- [x] **Step 1: Write the failing wiring test**

  Assert the webhook derives `routingItems` from `parseLegacyProductLines(row.product)`, checks that every resolved item has `catalogMatchComplete`, maps every resolved item to an RPC payload, and no longer gates persistence on `resolvedItems.length === 1`.

- [x] **Step 2: Run test to verify it fails**

  Run `npm test -- src/test/orderRoutingWiring.test.ts`.
  Expected: FAIL because the current webhook creates `routingItems` as one item and only persists `routing.resolvedItems[0]`.

- [x] **Step 3: Write minimal implementation**

  Build routing input from parsed legacy lines. When all resolved lines are complete, call `replace_order_items` once with all product and variant IDs and quantities. Keep the existing cleanup-on-RPC-failure behavior and only send confirmation after the RPC succeeds.

- [x] **Step 4: Run test to verify it passes**

  Run `npm test -- src/test/orderRoutingWiring.test.ts`.

### Task 3: Render legacy multi-product detail lines

**Files:**
- Modify: `server/index.js:5420-5454`
- Modify: `src/test/order-detail.test.ts`

**Interfaces:**
- Consumes `parseLegacyProductLines()`.
- Produces one fallback detail item per legacy product line when `order_items` is empty, with line prices that sum exactly to `order.price`.

- [x] **Step 1: Write the failing test**

  Add a detail fixture with an empty structured `items` array and `product: "Premium Mango x1, Honey Jar x1"`; assert both product names render in the order cart and the detail endpoint response is mapped to two lines.

- [x] **Step 2: Run test to verify it fails**

  Run `npm test -- src/test/order-detail.test.ts`.
  Expected: FAIL because the current fallback always creates one item using the entire `order.product` string.

- [x] **Step 3: Write minimal implementation**

  Map parsed legacy lines into virtual items, divide the stored order price by total quantity, and assign any rounding remainder to the final line so totals remain exact. Preserve the existing catalog-match enrichment only for the matching line set.

- [x] **Step 4: Run test to verify it passes**

  Run `npm test -- src/test/order-detail.test.ts`.

- [x] **Step 5: Verify dashboard list and detail display contracts**

  The order routing wiring suite asserts the authenticated list/detail fallbacks, and `order-detail.test.ts` renders both products from a structured multi-item response.

### Task 4: Run complete verification

**Files:**
- No additional files.

- [x] **Step 1: Run all tests**

  Run `npm test` and confirm zero failures.

- [x] **Step 2: Run lint**

  Run `npm run lint` and confirm zero errors.

- [x] **Step 3: Run production build**

  Run `npm run build` and confirm exit code `0`.
