# Pending Nav New-Tab Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the Pending Previous/Next bar appear when an order is opened in a new tab from the Dashboard Pending tab.

**Architecture:** Persist the Pending ID snapshot to `localStorage` from the Dashboard and encode `?fulfillmentTab=pending` on new-tab Order ID links; `OrderDetail` keeps `location.state` as first priority and falls back to the stored snapshot only when the pending context (state or URL query) is present and the current ID is in the snapshot. No API, DB, auth, or save-behavior changes.

**Tech Stack:** React 18, TypeScript, React Router v6, Vitest + Testing Library, Tailwind CSS (no visual changes).

## Global Constraints

- Preserve `data-testid="order-editor-pending-nav"`.
- Preserve `aria-label="Previous pending order"` and `aria-label="Next pending order"`.
- Preserve disabled logic and `goToSibling` with `replace: true`.
- Preserve position text `{pendingIndex + 1} of {pendingOrderIds.length} pending`.
- Same-tab row clicks keep today's exact behavior (`navigate` with `orderLinkState`).
- Warehouse order IDs stay plain text (no new-tab links, no queue context).
- Phosphor icons keep `weight="light"`.
- Storage access must be guarded with `try/catch` and `typeof window` checks so SSR/tests without DOM never throw.
- Snapshot expiry is exactly 30 minutes (`30 * 60 * 1000`).
- Do not touch the unrelated `opencode.json` modification.

---

### Task 1: Shared pending-queue storage helper

**Files:**
- Create: `src/lib/pendingOrderQueue.ts`
- Test: `src/test/pendingOrderQueue.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PENDING_ORDER_QUEUE_KEY`, `PENDING_QUEUE_MAX_AGE_MS`, `savePendingOrderQueue(ids: string[]): void`, `readPendingOrderQueue(now?: number): string[] | null`.

- [x] **Step 1: Write the failing helper tests**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { readPendingOrderQueue, savePendingOrderQueue } from "@/lib/pendingOrderQueue";

describe("pendingOrderQueue", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a saved queue", () => {
    savePendingOrderQueue(["order-1", "order-2"]);

    expect(readPendingOrderQueue()).toEqual(["order-1", "order-2"]);
  });

  it("returns null when nothing was saved", () => {
    expect(readPendingOrderQueue()).toBeNull();
  });

  it("returns null for a stale snapshot", () => {
    savePendingOrderQueue(["order-1"]);

    expect(readPendingOrderQueue(Date.now() + 31 * 60 * 1000)).toBeNull();
  });

  it("returns null for corrupt payloads", () => {
    localStorage.setItem("ml:pending-order-queue", "not-json");

    expect(readPendingOrderQueue()).toBeNull();
  });
});
```

- [x] **Step 2: Run the helper test and verify failure**

Run: `npm test -- src/test/pendingOrderQueue.test.ts`

Expected: FAIL with `Failed to resolve import "@/lib/pendingOrderQueue"`.

- [x] **Step 3: Implement the helper**

```ts
export const PENDING_ORDER_QUEUE_KEY = "ml:pending-order-queue";
export const PENDING_QUEUE_MAX_AGE_MS = 30 * 60 * 1000;

type PendingQueuePayload = {
  ids: string[];
  savedAt: number;
};

export function savePendingOrderQueue(ids: string[]): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const payload: PendingQueuePayload = { ids, savedAt: Date.now() };
    window.localStorage.setItem(PENDING_ORDER_QUEUE_KEY, JSON.stringify(payload));
  } catch {
    return;
  }
}

export function readPendingOrderQueue(now: number = Date.now()): string[] | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(PENDING_ORDER_QUEUE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as Partial<PendingQueuePayload>;
    if (!Array.isArray(payload.ids)) return null;
    if (typeof payload.savedAt !== "number") return null;
    if (now - payload.savedAt > PENDING_QUEUE_MAX_AGE_MS) return null;
    const ids = payload.ids.filter((value): value is string => typeof value === "string");
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}
```

- [x] **Step 4: Run the helper test and verify success**

Run: `npm test -- src/test/pendingOrderQueue.test.ts`

Expected: PASS (4 tests).

### Task 2: Save the queue on Dashboard and tag new-tab links

**Files:**
- Modify: `src/pages/Dashboard.tsx:1012-1017`
- Modify: `src/components/orders/OrderIdLink.tsx`
- Modify: `src/components/OrdersTable.tsx:1279-1283`
- Modify: `src/components/MobileOrderCards.tsx:118-122`
- Test: `src/test/orderIdLink.test.tsx`

**Interfaces:**
- Consumes: `savePendingOrderQueue` from Task 1, existing `pendingOrderIds` memo and `orderLinkState` prop.
- Produces: persisted snapshot plus `?fulfillmentTab=pending` on Dashboard new-tab links only when the Pending tab is active.

- [x] **Step 1: Write the failing link test**

Append to `src/test/orderIdLink.test.tsx`:

```tsx
it("encodes the pending context in the href when provided", () => {
  render(
    <MemoryRouter>
      <OrderIdLink orderId="order-1" orderNumber="ML-1001" search="?fulfillmentTab=pending" />
    </MemoryRouter>,
  );

  const link = screen.getByRole("link", { name: "Open order ML-1001 in a new tab" });
  expect(link).toHaveAttribute("href", "/orders/order-1?fulfillmentTab=pending");
});
```

- [x] **Step 2: Run the link test and verify failure**

Run: `npm test -- src/test/orderIdLink.test.tsx`

Expected: FAIL — `OrderIdLink` does not accept a `search` prop (TypeScript/unknown-prop error surfaces as test failure).

- [x] **Step 3: Implement the link, table, cards, and Dashboard save**

In `src/components/orders/OrderIdLink.tsx`, extend props and `to`:

```tsx
type OrderIdLinkProps = {
  orderId: string;
  orderNumber: string | number;
  className?: string;
  search?: string;
};

export function OrderIdLink({ orderId, orderNumber, className, search }: OrderIdLinkProps) {
  // ... unchanged label ...
  return (
    <Link
      to={{ pathname: `/orders/${orderId}`, search }}
      // ... unchanged target/rel/aria/handlers/className ...
```

In `src/components/OrdersTable.tsx`, derive the pending context from the existing prop and pass it through (desktop cell):

```tsx
{enableOrderIdLinks ? (
  <OrderIdLink
    orderId={order.id}
    orderNumber={order.order_number}
    className="font-bold text-[13px] tracking-tight"
    search={(orderLinkState as { fulfillmentTab?: unknown } | undefined)?.fulfillmentTab === "pending" ? "?fulfillmentTab=pending" : undefined}
  />
) : (
```

In `src/components/MobileOrderCards.tsx`, accept and forward the same signal. Add to props:

```tsx
orderLinkSearch?: string;
```

Pass `orderLinkSearch={...}` from `OrdersTable` mobile branch using the same `fulfillmentTab === "pending"` derivation, and render:

```tsx
<OrderIdLink orderId={order.id} orderNumber={orderLabel} className="text-sm font-bold" search={orderLinkSearch} />
```

In `src/pages/Dashboard.tsx`, persist the snapshot next to the existing memo:

```tsx
import { useEffect } from "react";
import { savePendingOrderQueue } from "@/lib/pendingOrderQueue";

// ... below the pendingOrderIds memo ...
useEffect(() => {
  if (fulfillmentTab === "pending") savePendingOrderQueue(pendingOrderIds);
}, [fulfillmentTab, pendingOrderIds]);
```

Verify `useEffect` is already imported in `Dashboard.tsx`; if it is, do not add a duplicate import.

- [x] **Step 4: Run the link tests and verify success**

Run: `npm test -- src/test/orderIdLink.test.tsx src/test/mobileOrderCards.test.tsx src/test/dashboardBulkStatus.test.tsx`

Expected: PASS.

### Task 3: Resolve the queue in OrderDetail for new tabs

**Files:**
- Modify: `src/pages/OrderDetail.tsx:141-157`
- Test: `src/test/orderDetailPendingNavigation.test.tsx`

**Interfaces:**
- Consumes: `readPendingOrderQueue` from Task 1, existing `location.state`, `location.search`, route `id`.
- Produces: unchanged `pendingOrderIds`, `pendingIndex`, `hasPendingNav`, `siblingState`, `goToSibling` values — now also populated for new tabs.

- [x] **Step 1: Write the failing new-tab fallback tests**

Append inside `describe("pending order prev/next navigation")`:

```tsx
it("shows pending nav in a new tab from the stored snapshot", async () => {
  localStorage.setItem(
    "ml:pending-order-queue",
    JSON.stringify({ ids: ["order-1", "order-2"], savedAt: Date.now() }),
  );
  apiFetch.mockImplementation((url: string) => {
    if (url === "/api/orders/order-1") return Promise.resolve(response({ order: orderOne, items: [], canEditItems: true }));
    if (url === "/api/products") return Promise.resolve(response({ products: [] }));
    if (url === "/api/orders") return Promise.resolve(response({ orders: [orderOne, orderTwo] }));
    return Promise.resolve(response({}));
  });

  renderNewTabOrderDetail("/orders/order-1?fulfillmentTab=pending");

  const nav = await screen.findByTestId("order-editor-pending-nav");
  expect(nav).toHaveTextContent("1 of 2 pending");
  expect(screen.getByRole("button", { name: "Next pending order" })).toBeEnabled();
});

it("hides pending nav in a new tab without pending context", async () => {
  localStorage.setItem(
    "ml:pending-order-queue",
    JSON.stringify({ ids: ["order-1", "order-2"], savedAt: Date.now() }),
  );
  apiFetch.mockImplementation((url: string) => {
    if (url === "/api/orders/order-1") return Promise.resolve(response({ order: orderOne, items: [], canEditItems: true }));
    if (url === "/api/products") return Promise.resolve(response({ products: [] }));
    if (url === "/api/orders") return Promise.resolve(response({ orders: [orderOne, orderTwo] }));
    return Promise.resolve(response({}));
  });

  renderNewTabOrderDetail("/orders/order-1");

  await screen.findByTestId("customer-name");
  expect(screen.queryByTestId("order-editor-pending-nav")).not.toBeInTheDocument();
});
```

Add the helper next to `renderOrderDetail` (same providers/routes, but entry has no state):

```tsx
function renderNewTabOrderDetail(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        { initialEntries: [entry] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: "/orders/:id", element: createElement(OrderDetail) }),
          createElement(Route, { path: "/", element: createElement("div", { "data-testid": "dashboard-stub" }) }),
        ),
      ),
    ),
  );
}
```

Note: the test file needs `localStorage.clear()` before each new-tab test — add it at the start of both tests if no global `beforeEach` clears storage.

- [x] **Step 2: Run the new tests and verify failure**

Run: `npm test -- src/test/orderDetailPendingNavigation.test.tsx`

Expected: FAIL — the new-tab test finds no `order-editor-pending-nav`.

- [x] **Step 3: Implement the fallback resolver**

In `src/pages/OrderDetail.tsx`, add the import:

```tsx
import { readPendingOrderQueue } from "@/lib/pendingOrderQueue";
```

Replace the queue derivation (lines 146-151) with:

```tsx
const rawPendingOrderIds = (location.state as { pendingOrderIds?: unknown } | null)?.pendingOrderIds;
const statePendingOrderIds = Array.isArray(rawPendingOrderIds)
  ? rawPendingOrderIds.filter((value): value is string => typeof value === "string")
  : null;
const queryFulfillmentTab = new URLSearchParams(location.search).get("fulfillmentTab");
const stateFulfillmentTab = (location.state as { fulfillmentTab?: unknown } | null)?.fulfillmentTab;
const isPendingContext = stateFulfillmentTab === "pending" || queryFulfillmentTab === "pending";
const storedPendingOrderIds =
  !statePendingOrderIds && isPendingContext ? readPendingOrderQueue() : null;
const pendingOrderIds = statePendingOrderIds ?? storedPendingOrderIds;
const pendingIndex = pendingOrderIds && id ? pendingOrderIds.indexOf(id) : -1;
const hasPendingNav = Boolean(pendingOrderIds) && pendingIndex !== -1;
```

Keep `siblingState`, `goToSibling`, and everything below unchanged.

- [x] **Step 4: Run the pending-nav tests and verify success**

Run: `npm test -- src/test/orderDetailPendingNavigation.test.tsx`

Expected: PASS (5 tests: 3 existing + 2 new).

### Task 4: Verification

**Files:**
- Verify all files changed by Tasks 1-3.

**Interfaces:**
- Consumes: completed helper, wiring, and resolver.
- Produces: verified, buildable behavior with no regressions.

- [x] **Step 1: Run focused tests**

Run: `npm test -- src/test/pendingOrderQueue.test.ts src/test/orderIdLink.test.tsx src/test/mobileOrderCards.test.tsx src/test/dashboardBulkStatus.test.tsx src/test/orderDetailPendingNavigation.test.tsx src/test/dashboardOrderStatusFilter.test.tsx src/test/warehouseDetailPage.test.tsx`

Expected: all PASS.

- [x] **Step 2: Run lint on touched files**

Run: `npx eslint src/lib/pendingOrderQueue.ts src/pages/OrderDetail.tsx src/pages/Dashboard.tsx src/components/orders/OrderIdLink.tsx src/components/OrdersTable.tsx src/components/MobileOrderCards.tsx src/test/pendingOrderQueue.test.ts src/test/orderIdLink.test.tsx src/test/orderDetailPendingNavigation.test.tsx`

Expected: 0 errors.

- [x] **Step 3: Run production build**

Run: `npm run build`

Expected: Vite completes successfully (pre-existing `bdDistricts.ts` duplicate-key warning is acceptable).

- [x] **Step 4: Confirm scope**

Run: `git status --short && git diff --check`

Expected: only the Task 1-3 files changed; `opencode.json` untouched.
