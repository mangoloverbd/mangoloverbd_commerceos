# Order Pagination Footer Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Previous left, page position center, and Next right in the shared order pagination footer.

**Architecture:** Change only the shared `OrderTablePagination` layout, which automatically updates Dashboard and Warehouse. Keep pagination calculations, callbacks, labels, disabled states, and button styling unchanged.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- Previous is the footer's left-aligned control.
- `Page X of Y` remains centered.
- Next remains right-aligned.
- The layout remains usable on narrow screens.
- Do not change pagination behavior, APIs, server code, Supabase, or schema.

---

### Task 1: Align shared footer controls

**Files:**
- Modify: `src/components/orders/OrderTablePagination.tsx`
- Test: `src/test/orderTablePagination.test.tsx`

**Interfaces:**
- Consumes: Existing `OrderTablePagination({ page, pageSize, totalItems, onPageChange })` props.
- Produces: The same interface and behavior with three direct visual regions in Previous, page-position, Next order.

- [ ] **Step 1: Write the failing layout test**

Render `OrderTablePagination`, select `order-pagination-footer`, and assert its three direct children contain Previous, `Page 1 of 2`, and Next respectively.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/test/orderTablePagination.test.tsx`

Expected: FAIL because the first child is currently an empty spacer and both buttons share the right region.

- [ ] **Step 3: Implement the three-column footer**

Render Previous with `justify-self-start`, page position in the center column, and Next with `justify-self-end`. Use a three-column grid at all breakpoints so the controls do not stack or change semantic order.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run src/test/orderTablePagination.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/orders/OrderTablePagination.tsx src/test/orderTablePagination.test.tsx
git commit -m "style: separate order pagination actions"
```

---

### Task 2: Verify and merge locally

- [ ] **Step 1: Run all checks**

```bash
npm test
npm run lint
npm run build
git diff --check main...HEAD
```

Expected: tests and build pass, lint has no errors, and diff check reports no whitespace errors.

- [ ] **Step 2: Fast-forward local main**

From the main repository checkout, run:

```bash
git checkout main
git merge --ff-only feat/order-rows-per-page
npm test
```

Expected: local `main` points at the feature commit and the merged test suite passes.

## Self-review

- The shared component updates both requested pages without duplicated layout code.
- The plan preserves behavior and changes only footer alignment.
- No placeholders, unrelated work, or interface changes are included.
