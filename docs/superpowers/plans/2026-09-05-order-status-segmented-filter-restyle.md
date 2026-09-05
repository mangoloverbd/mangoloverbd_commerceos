# Order Status Segmented Filter Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the existing order-status control as a full-width flat rail without changing BoardUI behavior or filtering logic.

**Architecture:** Change only the wrapper and item classes in `OrderStatusSegmentedControl`. Keep the existing BoardUI `SegmentedControl`, status data, page integration, selection state, and callbacks intact.

**Tech Stack:** React 18, TypeScript, BoardUI segmented control, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- Keep the existing BoardUI segmented-control component and selection behavior unchanged.
- Fill the order-table width with ten equal-width segments on desktop.
- Use a flat row with faint separators and the existing white selected thumb.
- Keep labels and counts neutral. Use status color only for the dots.
- Preserve horizontal scrolling and practical minimum widths below the desktop breakpoint.
- Do not change status mapping, counts, filtering, page integration, APIs, or database code.

---

### Task 1: Restyle the shared status control

**Files:**
- Modify: `src/components/orders/OrderStatusSegmentedControl.tsx`
- Modify: `src/test/orderStatusSegmentedControl.test.tsx`

**Interfaces:**
- Consumes: the existing `OrderStatusSegmentedControlProps` and BoardUI `SegmentedControl` components.
- Produces: the same `OrderStatusSegmentedControl` export and interaction contract.

- [ ] **Step 1: Add a failing layout and color-scope test**

Add stable test IDs to the expected wrapper and control, then assert that the control has desktop grid sizing, each item has a minimum width for overflow, and the Delivered count does not use a status color class. Keep the existing rendering and interaction tests unchanged.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/test/orderStatusSegmentedControl.test.tsx`

Expected: FAIL because the full-width rail classes and test IDs do not exist.

- [ ] **Step 3: Apply the approved styling**

Change the outer wrapper to full-width horizontal overflow with table-aligned padding. Make the BoardUI control a full-width ten-column grid at `xl`, retain `min-w-max` below that breakpoint, remove the gray tray background and ring, add faint item separators, reduce vertical padding, and change every count to neutral black. Do not edit the BoardUI base component.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
npx vitest run src/test/orderStatusSegmentedControl.test.tsx src/test/dashboardOrderStatusFilter.test.tsx src/test/warehouseDetailPage.test.tsx
npm test
npm run lint
npm run build
```

Expected: all tests pass, lint has no new errors, and the production build succeeds.

- [ ] **Step 5: Commit the restyle**

```bash
git add src/components/orders/OrderStatusSegmentedControl.tsx src/test/orderStatusSegmentedControl.test.tsx docs/superpowers/plans/2026-09-05-order-status-segmented-filter-restyle.md
git commit -m "style: refine order status filter"
```

## Self-review

- The single task covers full width, equal desktop columns, separators, neutral text, dot-only color, tighter height, and responsive overflow.
- No behavior, data, server, or database work is included.
- The component props and export remain unchanged.
