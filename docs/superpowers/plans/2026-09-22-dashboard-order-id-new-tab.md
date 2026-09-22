# Dashboard Order ID New-Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make Order IDs in the main Dashboard's desktop table and mobile cards open the existing Order editor in a new browser tab without changing surrounding navigation.

**Architecture:** Add one focused `OrderIdLink` component that owns the route, target, relationship attributes, event propagation, accessibility label, icon, and interaction styling. Make the shared `OrdersTable` and `MobileOrderCards` integration opt-in so only Dashboard enables it; retain the existing row and button navigation and leave Warehouse usage unchanged.

**Tech Stack:** React 18, TypeScript, React Router v6, Phosphor Icons, Tailwind CSS, Vitest, Testing Library.

## Global Constraints

- Apply the behavior only to the main Dashboard's shared order table and mobile cards.
- Clicking the Order ID opens `/orders/:id` in a new tab.
- Clicking elsewhere preserves the existing current-tab navigation.
- Use a Phosphor icon with `weight="light"`.
- Preserve native link behavior and provide an accessible name.
- Do not change APIs, database schema, or the Order editor.
- Preserve the unrelated uncommitted `opencode.json` change.

---

### Task 1: Shared Order ID Link

**Files:**
- Create: `src/components/orders/OrderIdLink.tsx`
- Test: `src/test/orderIdLink.test.tsx`

**Interfaces:**
- Produces: `OrderIdLink({ orderId, orderNumber, className? })`.
- `orderId`: database order ID used in `/orders/:id`.
- `orderNumber`: displayed string or number.
- `className`: optional consumer styling.

- [x] **Step 1: Write the failing component tests**

Render inside `MemoryRouter` and assert:

```tsx
const link = screen.getByRole("link", { name: "Open order ML-1001 in a new tab" });
expect(link).toHaveAttribute("href", "/orders/order-1");
expect(link).toHaveAttribute("target", "_blank");
expect(link).toHaveAttribute("rel", "noopener noreferrer");
```

Wrap it in a parent with an `onClick` spy, click the link, and assert the parent spy was not called.

- [x] **Step 2: Run the component test and verify failure**

Run: `npm test -- src/test/orderIdLink.test.tsx`

Expected: FAIL because `OrderIdLink` does not exist.

- [x] **Step 3: Implement the shared component**

Use `Link` from `react-router-dom`, `ArrowSquareOut` from `@phosphor-icons/react`, and `cn()` for styling. Normalize only leading `#` characters for the accessible label while preserving the supplied visible order number.

```tsx
<Link
  to={`/orders/${orderId}`}
  target="_blank"
  rel="noopener noreferrer"
  aria-label={`Open order ${label} in a new tab`}
  onClick={(event) => event.stopPropagation()}
  onKeyDown={(event) => event.stopPropagation()}
>
  <span>{orderNumber}</span>
  <ArrowSquareOut weight="light" aria-hidden="true" />
</Link>
```

- [x] **Step 4: Run the component test and verify success**

Run: `npm test -- src/test/orderIdLink.test.tsx`

Expected: PASS.

### Task 2: Dashboard Desktop and Mobile Integration

**Files:**
- Modify: `src/components/OrdersTable.tsx`
- Modify: `src/components/MobileOrderCards.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/test/mobileOrderCards.test.tsx`
- Modify: `src/test/dashboardBulkStatus.test.tsx`
- Modify: `src/test/warehouseDetailPage.test.tsx`

**Interfaces:**
- Consumes: `OrderIdLink` from Task 1.
- Preserves: existing row navigation in `OrdersTable` and existing `Open order` button callback in `MobileOrderCards`.

- [x] **Step 1: Write failing desktop and mobile integration tests**

For mobile, wrap the component in `MemoryRouter`, find the new-tab link, verify its destination and target, click it, and assert `onOpenOrder` remains untouched. Then click the existing `Open order` button and assert the callback still runs.

For desktop, use the existing Dashboard test harness and assert the visible order link has the correct `/orders/:id` `href` and `_blank` target.

- [x] **Step 2: Run the focused integration tests and verify failure**

Run: `npm test -- src/test/mobileOrderCards.test.tsx src/test/dashboardOrderStatusFilter.test.tsx`

Expected: FAIL because the displayed IDs are plain text.

- [x] **Step 3: Replace displayed IDs with `OrderIdLink`**

In `OrdersTable`, render `OrderIdLink` only when the new opt-in prop is enabled. Keep fulfillment badges and row navigation unchanged. Enable the prop from `Dashboard` only, and verify Warehouse usage retains plain text.

In `MobileOrderCards`, replace only the order-label text span. Keep the bottom `Open order` button unchanged.

- [x] **Step 4: Run the focused integration tests and verify success**

Run: `npm test -- src/test/orderIdLink.test.tsx src/test/mobileOrderCards.test.tsx src/test/dashboardOrderStatusFilter.test.tsx`

Expected: PASS.

### Task 3: Verification

**Files:**
- Verify all files changed by Tasks 1 and 2.

**Interfaces:**
- Consumes: completed shared component and integrations.
- Produces: reviewed, buildable Dashboard behavior.

- [x] **Step 1: Run all tests**

Run: `npm test`

Expected: all tests pass.

- [x] **Step 2: Run lint**

Run: `npm run lint`

Expected: no new errors.

- [x] **Step 3: Run production build**

Run: `npm run build`

Expected: Vite completes successfully.

- [x] **Step 4: Review the final diff**

Confirm the ID alone opens a new tab, existing row/card controls still use current-tab navigation, all new icons use Phosphor `weight="light"`, and `opencode.json` remains uncommitted and untouched.
