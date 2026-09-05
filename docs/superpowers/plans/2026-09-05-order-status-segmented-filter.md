# Order Status Segmented Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a BoardUI segmented status summary that filters the Dashboard and Warehouse order tables.

**Architecture:** Put mutually exclusive order-status classification and counting in a small pure utility. Build one presentational `OrderStatusSegmentedControl` around the existing BoardUI primitive, then compose it into both pages while leaving the shared row table unchanged.

**Tech Stack:** React 18, TypeScript, React Aria Components, BoardUI segmented control, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- Frontend only; do not change APIs, Supabase schema, or server behavior.
- Use the existing `src/components/base/segmented-control/segmented-control.tsx`; do not duplicate the BoardUI primitive.
- Buckets are mutually exclusive and ordered: All Orders, Pending, On Hold, Approved, Processing, Ready To Ship, In-Transit, Delivered, Flagged, Cancelled.
- Dashboard counts respond to warehouse selection but not search; Warehouse counts are scoped to that warehouse but not search.
- Selecting a status composes with existing search and warehouse filters and resets Dashboard pagination.
- Keep one horizontally scrollable row on narrow screens.

---

### Task 1: Define and test status classification

**Files:**
- Create: `src/lib/orderStatusFilters.ts`
- Test: `src/test/orderStatusFilters.test.ts`

**Interfaces:**
- Consumes: order fields `status`, `fulfillment_status`, `courier_status`, `sent_to_courier`, `fraud_checked`, and `fraud_data`.
- Produces: `OrderStatusFilter`, `ORDER_STATUS_FILTERS`, `classifyOrderStatus(order)`, `filterOrdersByStatus(orders, filter)`, and `countOrdersByStatus(orders)`.

- [ ] **Step 1: Write failing classification tests**

Cover explicit aliases, courier terminal/transit/hold/processing states, fulfilled readiness, low-delivery fraud flags, confirmed approval, pending fallback, and the invariant that bucket counts sum to `all`.

- [ ] **Step 2: Run the focused test and verify red**

Run: `npx vitest run src/test/orderStatusFilters.test.ts`

Expected: FAIL because `@/lib/orderStatusFilters` does not exist.

- [ ] **Step 3: Implement the pure classifier and counters**

Use normalized lowercase underscore-delimited values and ordered sets for courier aliases. Return one bucket per order, with terminal courier state taking precedence over business state.

- [ ] **Step 4: Run the focused test and verify green**

Run: `npx vitest run src/test/orderStatusFilters.test.ts`

Expected: PASS.

### Task 2: Build the shared BoardUI status control

**Files:**
- Create: `src/components/orders/OrderStatusSegmentedControl.tsx`
- Test: `src/test/orderStatusSegmentedControl.test.tsx`

**Interfaces:**
- Consumes: `counts: Record<OrderStatusFilter, number>`, `value: OrderStatusFilter`, `onChange(value)` and optional `loading`.
- Produces: an accessible, single-select, horizontally scrollable BoardUI segmented filter.

- [ ] **Step 1: Write failing rendering and interaction tests**

Assert all ten labels and formatted counts render, selected state is exposed through React Aria, and choosing Delivered calls `onChange("delivered")`.

- [ ] **Step 2: Run the component test and verify red**

Run: `npx vitest run src/test/orderStatusSegmentedControl.test.tsx`

Expected: FAIL because the shared component does not exist.

- [ ] **Step 3: Implement the polished control**

Wrap `SegmentedControl` in an overflow container. Render each item as a compact two-line block with a colored dot, uppercase label, and tabular count. Use the BoardUI animated selected thumb, a neutral tray, subtle separators, and a minimum width per segment.

- [ ] **Step 4: Run the component test and verify green**

Run: `npx vitest run src/test/orderStatusSegmentedControl.test.tsx`

Expected: PASS.

### Task 3: Integrate Dashboard and Warehouse filtering

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/WarehouseDetail.tsx`
- Modify: `src/test/dashboardWarehouseFilter.test.ts`
- Modify: `src/test/warehouseDetailPage.test.tsx`

**Interfaces:**
- Consumes: Task 1 filter/count helpers and Task 2 shared component.
- Produces: working status summary filters on both order-table surfaces.

- [ ] **Step 1: Add failing page integration assertions**

Dashboard source assertions require status state, count computation, filter composition, and pagination reset. Warehouse interaction tests load several bucket states, select Delivered, and verify the table and displayed result count update.

- [ ] **Step 2: Run page tests and verify red**

Run: `npx vitest run src/test/dashboardWarehouseFilter.test.ts src/test/warehouseDetailPage.test.tsx`

Expected: FAIL on missing status UI/filter behavior.

- [ ] **Step 3: Integrate the Dashboard**

Compute the count source after warehouse filtering but before search. Apply status filtering before search/pagination, reset page on selection, and render the shared control between the toolbar and table.

- [ ] **Step 4: Integrate Warehouse Detail**

Compute counts from the warehouse response, apply status then search, and render the shared control between its toolbar and shared table.

- [ ] **Step 5: Run focused and full verification**

Run:

```bash
npx vitest run src/test/orderStatusFilters.test.ts src/test/orderStatusSegmentedControl.test.tsx src/test/dashboardWarehouseFilter.test.ts src/test/warehouseDetailPage.test.tsx
npm test
npm run lint
npm run build
```

Expected: all tests pass, lint has no new errors, and the production build succeeds.

## Self-review

- Spec coverage: classification, counts, BoardUI styling, responsive overflow, both pages, filter composition, and pagination reset are covered.
- Placeholder scan: no deferred requirements or implementation placeholders remain.
- Type consistency: all tasks use the same `OrderStatusFilter` union and shared control props.
