# Order Rows-Per-Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add independently persisted 20–200 rows-per-page controls to the Dashboard and Warehouse order tables.

**Architecture:** Add the supplied Radix/shadcn Select variant under the existing UI component path, then compose it into a shared order-pagination footer. Page components retain ownership of their filtered order lists, current page, and separate saved page-size keys so Dashboard and Warehouse data never mix.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Radix Select, Vitest, Testing Library

## Global Constraints

- Dashboard pagination applies to its filtered all-orders list.
- Warehouse pagination applies only to the warehouse currently being viewed.
- Use page-size options 20, 50, 100, 150, and 200; default to 100.
- Save Dashboard and Warehouse preferences under separate local-storage keys.
- Apply search, status, and warehouse filters before pagination.
- Reset to page 1 when a page size or filter changes.
- Keep all API, server, Supabase, and schema code unchanged.

---

### Task 1: Add the dropdown and shared pagination footer

**Files:**
- Create: `src/components/ui/interfaces-select.tsx`
- Create: `src/components/orders/OrderTablePagination.tsx`
- Create: `src/hooks/useOrderPageSize.ts`
- Create: `src/test/orderTablePagination.test.tsx`

**Interfaces:**
- Produces: `useOrderPageSize(storageKey: string): [number, (pageSize: number) => void]`.
- Produces: `OrderTablePagination({ page, pageSize, totalItems, onPageChange, onPageSizeChange, ariaLabel })` where `page` is zero-based.
- Produces: Radix Select exports from `@/components/ui/interfaces-select`.

- [ ] **Step 1: Write failing component and persistence tests**

Test that the footer shows the current page, disables boundary actions, exposes a labeled page-size combobox, reports a supported size selection, and that `useOrderPageSize` rejects unsupported stored values.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run src/test/orderTablePagination.test.tsx`

Expected: FAIL because the shared footer and persistence hook do not exist.

- [ ] **Step 3: Add the Select variant and pagination primitives**

Add the provided Radix Select structure to `src/components/ui/interfaces-select.tsx`, adapting unsupported Tailwind syntax to this repository's Tailwind version. Build a responsive footer with `Rows per page`, values 20/50/100/150/200, `Page X of Y`, and Previous/Next buttons. Add a storage-safe hook that accepts only those values and defaults to 100.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npx vitest run src/test/orderTablePagination.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the shared UI**

```bash
git add src/components/ui/interfaces-select.tsx src/components/orders/OrderTablePagination.tsx src/hooks/useOrderPageSize.ts src/test/orderTablePagination.test.tsx
git commit -m "feat: add order pagination controls"
```

---

### Task 2: Make Dashboard page size configurable

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/test/dashboardOrderStatusFilter.test.tsx`

**Interfaces:**
- Consumes: `useOrderPageSize("dashboard-order-page-size")`.
- Consumes: `OrderTablePagination` from Task 1.

- [ ] **Step 1: Write a failing Dashboard pagination test**

Provide more than 20 Dashboard orders, select 20 rows, assert only the first 20 filtered rows render, navigate to page 2, and assert the remaining rows render. Verify the Dashboard storage key is updated.

- [ ] **Step 2: Run the Dashboard test and confirm RED**

Run: `npx vitest run src/test/dashboardOrderStatusFilter.test.tsx`

Expected: FAIL because Dashboard still uses a fixed 100-row page size.

- [ ] **Step 3: Replace the fixed page size**

Use the Dashboard-specific persisted size in page-count and slicing calculations. Replace the existing conditional pagination row with the shared footer, and reset the current page when the size changes.

- [ ] **Step 4: Run the Dashboard test and confirm GREEN**

Run: `npx vitest run src/test/dashboardOrderStatusFilter.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit Dashboard integration**

```bash
git add src/pages/Dashboard.tsx src/test/dashboardOrderStatusFilter.test.tsx
git commit -m "feat: configure dashboard order page size"
```

---

### Task 3: Add warehouse-scoped pagination

**Files:**
- Modify: `src/pages/WarehouseDetail.tsx`
- Modify: `src/test/warehouseDetailPage.test.tsx`

**Interfaces:**
- Consumes: `useOrderPageSize("warehouse-order-page-size")`.
- Consumes: `OrderTablePagination` from Task 1.

- [ ] **Step 1: Write a failing Warehouse pagination test**

Return more than 20 orders for one warehouse, select 20 rows, verify only that warehouse's first 20 filtered rows render, navigate to page 2, and verify the remaining warehouse rows render. Assert the Warehouse key changes while the Dashboard key remains untouched.

- [ ] **Step 2: Run the Warehouse test and confirm RED**

Run: `npx vitest run src/test/warehouseDetailPage.test.tsx`

Expected: FAIL because Warehouse currently renders every filtered order.

- [ ] **Step 3: Paginate the warehouse-filtered list**

Add Warehouse page state, persisted page size, safe-page calculation, and sliced visible orders. Reset the page for search, status, and size changes. Render the shared footer below the warehouse `OrdersTable`.

- [ ] **Step 4: Run focused integration tests**

Run: `npx vitest run src/test/orderTablePagination.test.tsx src/test/dashboardOrderStatusFilter.test.tsx src/test/warehouseDetailPage.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit Warehouse integration**

```bash
git add src/pages/WarehouseDetail.tsx src/test/warehouseDetailPage.test.tsx
git commit -m "feat: paginate warehouse orders"
```

---

### Task 4: Verify the complete feature

**Files:**
- Verify only

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: a verified feature branch ready for review.

- [ ] **Step 1: Run all project checks**

```bash
npm test
npm run lint
npm run build
git diff --check origin/main...HEAD
```

Expected: tests and build pass, lint has no errors, and diff check reports no whitespace errors.

- [ ] **Step 2: Review the final diff**

Confirm there are no API, server, Supabase, schema, order-classification, or BoardUI segmented-control changes.

## Self-review

- The plan covers independent data scope, separate persistence, all requested size options, filter-first pagination, page resets, responsive UI, and accessibility.
- All produced interfaces have matching consumers.
- No placeholder steps or unspecified implementation work remain.
