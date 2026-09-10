# Merchant Dashboard Courier Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Merchant Suite users search orders by customer name, phone number, order number, Steadfast consignment ID, and Steadfast tracking code.

**Architecture:** Extract the dashboard's existing case-insensitive substring matching into a pure `matchesOrderSearch` helper. The dashboard will pass each order and the debounced query to that helper, adding the two courier fields without changing the API or database.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library.

## Global Constraints

- Preserve current name, phone, and order-number search behavior.
- Treat missing `consignment_id` and `tracking_code` values as non-matches, not errors.
- Do not change API routes, database schema, pagination, or order data loading.
- Keep the existing Merchant Suite dashboard styling and single search input.

---

## Task 1: Add the tested order-search helper

**Files:**
- Create: `src/lib/orderSearch.ts`
- Create: `src/test/orderSearch.test.ts`

**Interfaces:**
- `OrderSearchRecord` accepts `order_number`, `customer_name`, `phone`, `consignment_id`, and `tracking_code` fields.
- `matchesOrderSearch(order: OrderSearchRecord, query: string): boolean` returns true when the trimmed query occurs in any searchable field.

- [ ] **Step 1: Write the failing tests**

Create tests with this behavior:

```ts
expect(matchesOrderSearch(order, "rahim")).toBe(true);
expect(matchesOrderSearch(order, "01712")).toBe(true);
expect(matchesOrderSearch(order, "ML-150000")).toBe(true);
expect(matchesOrderSearch(order, "987654")).toBe(true); // consignment ID
expect(matchesOrderSearch(order, "stead-abc")).toBe(true); // tracking code
expect(matchesOrderSearch(order, "STEAD-ABC")).toBe(true); // case-insensitive
expect(matchesOrderSearch(order, "missing")).toBe(false);
expect(matchesOrderSearch({ ...order, consignment_id: null, tracking_code: null }, "987654")).toBe(false);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run `npm test -- src/test/orderSearch.test.ts`. Expected result: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the minimal helper**

Implement `matchesOrderSearch` by trimming and lowercasing the query, returning true for an empty query, and checking:

```ts
[
  order.order_number,
  order.customer_name,
  order.phone,
  order.consignment_id,
  order.tracking_code,
].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery))
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run `npm test -- src/test/orderSearch.test.ts`. Expected result: PASS.

- [ ] **Step 5: Commit the helper and tests**

```bash
git add src/lib/orderSearch.ts src/test/orderSearch.test.ts
git commit -m "feat: add courier-aware order search helper"
```

---

## Task 2: Wire courier fields into the dashboard search

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/test/dashboardOrderStatusFilter.test.tsx` or create a focused dashboard search wiring test if the existing fixture is not suitable.

**Interfaces:**
- Consumes `matchesOrderSearch(order, debouncedSearch)` from `src/lib/orderSearch.ts`.
- Produces the same filtered order list as before, plus consignment-ID and tracking-code matches.

- [ ] **Step 1: Add a failing dashboard search assertion**

Extend the existing dashboard search fixture or add a source-contract assertion proving an order with `consignment_id: 987654` and `tracking_code: "STEAD-ABC"` appears when the search input contains either value.

- [ ] **Step 2: Run the focused dashboard test and verify it fails**

Run `npm test -- src/test/dashboardOrderStatusFilter.test.tsx`. Expected result: FAIL because the current inline filter checks only order number, name, and phone.

- [ ] **Step 3: Replace the inline field checks with the helper**

Import `matchesOrderSearch` and replace the current predicate body with:

```tsx
return filterOrdersByStatus(warehouseOrders, statusFilter).filter((order) =>
  matchesOrderSearch(order, debouncedSearch),
);
```

Change the placeholder from `Search orders…` to `Search name, phone, order or courier ID…`.

- [ ] **Step 4: Run the focused dashboard test and verify it passes**

Run `npm test -- src/test/orderSearch.test.ts src/test/dashboardOrderStatusFilter.test.tsx`. Expected result: PASS.

- [ ] **Step 5: Commit the dashboard wiring**

```bash
git add src/pages/Dashboard.tsx src/test/dashboardOrderStatusFilter.test.tsx
git commit -m "feat: search dashboard orders by courier identifiers"
```

---

## Task 3: Verify the complete change

- [ ] **Step 1: Run the full Merchant Suite test suite**

Run `npm test`. Expected result: all tests pass.

- [ ] **Step 2: Run lint and production build**

Run `npm run lint && npm run build`. Expected result: zero lint errors and a successful production build.

- [ ] **Step 3: Review the diff**

Run `git diff --check` and confirm only the helper, tests, dashboard wiring, and design/plan documentation changed. No server, API, Supabase, or storefront files should be modified.
