# Order Row Selector Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move each order table's rows-per-page dropdown from the footer into its table toolbar.

**Architecture:** Split the shared pagination UI into a reusable `OrderRowsPerPageSelect` toolbar control and a navigation-only `OrderTablePagination` footer. Dashboard and Warehouse pages continue owning page size, persistence, filtering, and page state.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Radix Select, Vitest, Testing Library

## Global Constraints

- Place the selector beside each table title and filtered order count.
- Keep page position and Previous/Next navigation in the footer.
- Preserve independent Dashboard and Warehouse page-size settings.
- Preserve options 20, 50, 100, 150, and 200 with a default of 100.
- Do not change filtering, order scope, APIs, server code, Supabase, or schema.

---

### Task 1: Separate selector and footer controls

**Files:**
- Modify: `src/components/orders/OrderTablePagination.tsx`
- Modify: `src/test/orderTablePagination.test.tsx`

**Interfaces:**
- Produces: `OrderRowsPerPageSelect({ pageSize, onPageSizeChange, ariaLabel })`.
- Updates: `OrderTablePagination({ page, pageSize, totalItems, onPageChange })` to navigation-only output.

- [ ] **Step 1: Write failing placement tests**

Test the rows selector as an independent component. Assert the pagination footer no longer contains `Rows per page` or a combobox while retaining page position and boundary navigation.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run src/test/orderTablePagination.test.tsx`

Expected: FAIL because the selector is still nested inside the footer.

- [ ] **Step 3: Split the shared components**

Extract the existing label and Radix dropdown into `OrderRowsPerPageSelect`. Remove page-size callback and label props from `OrderTablePagination`, leaving its responsive page indicator and navigation actions.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npx vitest run src/test/orderTablePagination.test.tsx`

Expected: PASS.

---

### Task 2: Place selectors in both table toolbars

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/WarehouseDetail.tsx`
- Modify: `src/test/dashboardOrderStatusFilter.test.tsx`
- Modify: `src/test/warehouseDetailPage.test.tsx`

**Interfaces:**
- Consumes: `OrderRowsPerPageSelect` and navigation-only `OrderTablePagination` from Task 1.

- [ ] **Step 1: Write failing page placement tests**

Add stable toolbar test IDs, then assert each page's labeled combobox is inside its order toolbar and not inside its pagination footer.

- [ ] **Step 2: Run page tests and confirm RED**

Run: `npx vitest run src/test/dashboardOrderStatusFilter.test.tsx src/test/warehouseDetailPage.test.tsx`

Expected: FAIL because both selectors still render in their footers.

- [ ] **Step 3: Move selectors into the toolbars**

Render `OrderRowsPerPageSelect` beside the title/count group on each page. Keep the existing page-size callbacks, including reset to page 1. Pass only page navigation data to each footer.

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run src/test/orderTablePagination.test.tsx src/test/dashboardOrderStatusFilter.test.tsx src/test/warehouseDetailPage.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/orders/OrderTablePagination.tsx src/pages/Dashboard.tsx src/pages/WarehouseDetail.tsx src/test/orderTablePagination.test.tsx src/test/dashboardOrderStatusFilter.test.tsx src/test/warehouseDetailPage.test.tsx
git commit -m "style: move order row controls to headers"
```

---

### Task 3: Verify

- [ ] **Step 1: Run all checks**

```bash
npm test
npm run lint
npm run build
git diff --check origin/main...HEAD
```

Expected: tests and build pass, lint has no errors, and diff check reports no whitespace errors.

## Self-review

- The plan changes placement only and preserves all page-size and data-scope behavior.
- The selector and footer interfaces have clear, separate responsibilities.
- Both responsive page toolbars receive the same shared control.
