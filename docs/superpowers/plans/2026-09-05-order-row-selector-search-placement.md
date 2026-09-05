# Order Row Selector Search Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place the numeric order page-size dropdown immediately after the search field on Dashboard and Warehouse, without a visible label.

**Architecture:** Keep `OrderRowsPerPageSelect` as the shared controlled Radix Select and preserve its `ariaLabel`. Move each page’s instance from the title/count group into the toolbar action group directly after the search wrapper; pagination state and persistence remain page-owned.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Radix Select, Vitest, Testing Library

## Global Constraints

- Apply the same placement on Dashboard and Warehouse.
- Render no visible `Rows per page` text.
- Keep the dropdown's descriptive accessible label.
- Preserve page-size options, persistence keys, filtering, and page reset behavior.
- Do not change APIs, server code, Supabase, or schema.

---

### Task 1: Make the shared selector numeric-only

**Files:**
- Modify: `src/components/orders/OrderTablePagination.tsx`
- Test: `src/test/orderTablePagination.test.tsx`

**Interfaces:**
- Consumes: `OrderRowsPerPageSelect({ pageSize, onPageSizeChange, ariaLabel })`.
- Produces: The same component interface with numeric-only visible output and unchanged accessible naming.

- [ ] **Step 1: Add a failing assertion**

In the standalone selector test, assert `screen.queryByText("Rows per page")` is absent while the labeled combobox remains available.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/test/orderTablePagination.test.tsx`

Expected: FAIL because the component currently renders the visible label.

- [ ] **Step 3: Remove the visible label**

Render only the Radix `Select`; keep `aria-label={ariaLabel}` on `SelectTrigger`.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run src/test/orderTablePagination.test.tsx`

Expected: PASS.

---

### Task 2: Move selectors after search fields

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/WarehouseDetail.tsx`
- Test: `src/test/dashboardOrderStatusFilter.test.tsx`
- Test: `src/test/warehouseDetailPage.test.tsx`

**Interfaces:**
- Consumes: Numeric-only `OrderRowsPerPageSelect` from Task 1.
- Produces: `dashboard-order-actions` and `warehouse-order-actions` toolbar regions containing search followed by the page-size dropdown.

- [ ] **Step 1: Add failing placement assertions**

Assert each labeled combobox is inside its page’s toolbar action region and appears after the search input in document order.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/test/dashboardOrderStatusFilter.test.tsx src/test/warehouseDetailPage.test.tsx`

Expected: FAIL because selectors currently sit in the title/count groups.

- [ ] **Step 3: Move both selector instances**

Remove each selector and adjacent divider from the title/count group. Add the selector immediately after the search wrapper in each action group. Preserve each existing `onPageSizeChange` callback.

- [ ] **Step 4: Verify focused tests**

Run: `npx vitest run src/test/orderTablePagination.test.tsx src/test/dashboardOrderStatusFilter.test.tsx src/test/warehouseDetailPage.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/orders/OrderTablePagination.tsx src/pages/Dashboard.tsx src/pages/WarehouseDetail.tsx src/test/orderTablePagination.test.tsx src/test/dashboardOrderStatusFilter.test.tsx src/test/warehouseDetailPage.test.tsx
git commit -m "style: align order row selectors with search"
```

---

### Task 3: Verify

- [ ] **Step 1: Run all checks**

```bash
npm test
npm run lint
npm run build
git diff --check main...HEAD
```

Expected: tests and build pass, lint has no errors, and diff check reports no whitespace errors.

## Self-review

- Every placement and accessibility requirement maps to a focused test.
- Component interfaces and saved preference behavior remain unchanged.
- No placeholder or unrelated work is included.
