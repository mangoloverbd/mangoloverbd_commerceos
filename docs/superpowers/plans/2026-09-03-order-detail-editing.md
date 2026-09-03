# Order Detail Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated order-detail page where merchants can edit line items for all orders, with transactional totals and inventory updates.

**Architecture:** Introduce an org-scoped `order_items` table and preserve the existing aggregate order columns for compatibility. Add server-owned detail and line-item mutation endpoints, then build a dedicated React Router page using the existing `ProductEdit` visual patterns. Product edits are locked after courier dispatch.

**Tech Stack:** React 18, TypeScript, React Router v6, TanStack Query v5, shadcn/ui, Express, Supabase/PostgreSQL, Vitest.

## Global Constraints

- Every order query must resolve the fixed Mango Lover BD workspace and retain the `org_id` guard.
- Every new API route must validate the authenticated user before reading or mutating order data.
- Client API requests must use `apiFetch()`.
- Totals and inventory deltas must be calculated server-side inside one database transaction.
- Existing aggregate `orders.product`, `orders.quantity`, and `orders.price` fields remain synchronized for compatibility.
- Orders sent to a courier are viewable but their product editing controls are disabled.
- Do not expose service-role credentials or direct commerce-table writes to the storefront.

## Files Touched

- Create: `supabase/migrations/<generated>_add_order_items.sql`
- Modify: `src/integrations/supabase/types.ts`
- Modify: `server/index.js`
- Create: `src/pages/OrderDetail.tsx`
- Modify: `src/components/OrdersTable.tsx`
- Modify: `src/App.tsx`
- Create: `src/test/order-detail.test.ts`
- Create or modify: `src/test/order-items.test.ts`

### Task 1: Add Order Item Schema And Backfill

**Files:**
- Create: `supabase/migrations/<generated>_add_order_items.sql`
- Modify: `src/integrations/supabase/types.ts`
- Test: `src/test/order-items.test.ts`

**Interfaces:**
- Produces `order_items(id, org_id, order_id, product_id, variant_id, product_name, variant_name, unit_price, quantity, created_at, updated_at)`.
- Produces a backfill that preserves every existing order even when `orders.product` cannot be parsed into a catalog product.

- [ ] **Step 1: Inspect the live baseline and create the migration through the project Supabase workflow.**
  - Run `npm run verify:supabase-project`.
  - Run `npm run verify:supabase-baseline`.
  - Use the Supabase migration command to create the next hand-authored migration name; do not invent a migration version.
  - Confirm `orders`, `products`, and any variant/inventory columns before finalizing foreign keys.

- [ ] **Step 2: Write failing tests for line-item invariants.**
  - Cover positive integer quantities, non-negative unit prices, order/org ownership, and preservation of a legacy product text value.
  - Assert that an order with no interpretable product still gets one legacy item rather than being dropped.

- [ ] **Step 3: Run the tests and confirm they fail for the missing schema/backfill behavior.**

- [ ] **Step 4: Add the table, indexes, constraints, and data-preserving backfill.**
  - Add indexes on `(org_id, order_id)` and optional product/variant references.
  - Enable RLS and add policies consistent with the existing private merchant access model, even though runtime access uses the authenticated service API.
  - Keep legacy product text in `product_name` when no product reference can be resolved.
  - Populate item aggregates without changing existing order totals.

- [ ] **Step 5: Regenerate TypeScript Supabase types and run the item tests.**
  - Expected: all line-item tests pass and generated types include `order_items`.

- [ ] **Step 6: Commit the schema unit.**
  - `git add supabase/migrations src/integrations/supabase/types.ts src/test/order-items.test.ts`
  - `git commit -m "feat: add order item records"`

### Task 2: Add Order Detail And Item Mutation API

**Files:**
- Modify: `server/index.js`
- Test: `src/test/order-items.test.ts`

**Interfaces:**
- `GET /api/orders/:id` returns `{ order, items, canEditItems }`.
- `PATCH /api/orders/:id/items` accepts `{ items: [{ productId?, variantId?, quantity }] }` and returns the recalculated order plus items.

- [ ] **Step 1: Add failing API/service tests.**
  - Test authenticated org-scoped detail loading.
  - Test add, remove, increase, and decrease operations.
  - Test server-side total recalculation while ignoring a client total.
  - Test insufficient inventory rollback, wrong-org rejection, malformed item rejection, and courier-dispatched locking.

- [ ] **Step 2: Run the focused tests and verify expected failures.**

- [ ] **Step 3: Implement authenticated detail loading in the orders domain section.**
  - Resolve the current user and workspace using existing helpers.
  - Query the order and items with `.eq("org_id", orgId)` and `.eq("id", orderId)`.
  - Return a derived editability flag based on courier dispatch fields/status.

- [ ] **Step 4: Implement the item replacement mutation with server-owned calculations.**
  - Validate product and variant ownership under the same `org_id`.
  - Reject duplicate product/variant keys and quantities below 1.
  - Lock the order and affected inventory rows before calculating deltas.
  - Apply stock reservations/releases, replace item rows, recalculate aggregate quantity/price/product summary, and commit atomically.
  - Return a conflict-style error when a dispatched order is edited or stock is insufficient.

- [ ] **Step 5: Run focused API tests and verify rollback paths.**

- [ ] **Step 6: Commit the API unit.**
  - `git add server/index.js src/test/order-items.test.ts`
  - `git commit -m "feat: add order item editing API"`

### Task 3: Add The Order Detail Page

**Files:**
- Create: `src/pages/OrderDetail.tsx`
- Modify: `src/App.tsx`
- Test: `src/test/order-detail.test.ts`

**Interfaces:**
- Route: `/orders/:id`.
- Page consumes `GET /api/orders/:id` and mutates through `PATCH /api/orders/:id/items` using `apiFetch()`.

- [ ] **Step 1: Write failing page tests.**
  - Assert loading, not-found, customer/order summary, line-item rendering, add-product control, remove control, quantity editing, save state, server error display, and locked dispatched state.

- [ ] **Step 2: Run the page tests and confirm they fail because the route/page does not exist.**

- [ ] **Step 3: Implement the route and page using `ProductEdit` patterns.**
  - Use the existing dashboard layout, page header, `BuiInput`, `RichButton`, and navigation conventions.
  - Keep a local draft of line items and derive subtotal/quantity from the draft for display only.
  - Use the existing product catalog query for product selection and variant selection.
  - Preserve customer, delivery, payment, courier, fraud, timestamps, and status as read-only summary fields.
  - Disable all item controls and save when `canEditItems` is false.

- [ ] **Step 4: Implement save/cancel behavior.**
  - Save sends only item identity and quantities.
  - On success, replace the query cache with the server response.
  - On failure, preserve the draft and show the API error.
  - Cancel navigates back to `/` or the existing orders dashboard route without saving.

- [ ] **Step 5: Run page tests and verify all states.**

- [ ] **Step 6: Commit the page unit.**
  - `git add src/pages/OrderDetail.tsx src/App.tsx src/test/order-detail.test.ts`
  - `git commit -m "feat: add order detail editing page"`

### Task 4: Make Orders Navigable

**Files:**
- Modify: `src/components/OrdersTable.tsx`
- Modify: `src/pages/Dashboard.tsx` only if the table needs route context
- Test: `src/test/order-detail.test.ts`

- [ ] **Step 1: Add a failing interaction test.**
  - Assert clicking the non-control area of an order row navigates to `/orders/:id`.
  - Assert clicking status controls, notes controls, selection checkboxes, courier actions, and delete actions does not navigate.

- [ ] **Step 2: Run the interaction test and confirm failure.**

- [ ] **Step 3: Add row navigation with explicit interactive-control guards.**
  - Use React Router navigation, not a new routing library.
  - Add keyboard-accessible row activation and a visible focus state.
  - Keep existing inline editing, selection, and bulk actions unchanged.

- [ ] **Step 4: Run the interaction test and existing table tests.**

- [ ] **Step 5: Commit the navigation unit.**
  - `git add src/components/OrdersTable.tsx src/pages/Dashboard.tsx src/test/order-detail.test.ts`
  - `git commit -m "feat: open order details from orders table"`

### Task 5: Full Verification And Security Review

**Files:**
- Review all files changed by Tasks 1-4.

- [ ] **Step 1: Run the complete test suite.**
  - `npm test`

- [ ] **Step 2: Run static checks and production build.**
  - `npm run lint`
  - `npm run build`

- [ ] **Step 3: Review the diff for auth, org guards, SQL safety, inventory atomicity, and courier locking.**

- [ ] **Step 4: Run Supabase advisors and inspect migration output.**

- [ ] **Step 5: Perform browser QA.**
  - Open the dashboard, click an order, add/remove/change a product, reload, and confirm totals persist.
  - Confirm a dispatched order is view-only.
  - Confirm an insufficient-stock edit leaves both inventory and order unchanged.

- [ ] **Step 6: Commit any verification fixes separately and report exact test output.**
