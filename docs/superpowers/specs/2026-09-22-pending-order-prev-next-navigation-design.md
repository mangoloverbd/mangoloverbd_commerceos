# Pending Order Prev/Next Navigation — Design

Date: 2026-09-22
Status: Approved

## Problem

Merchant-Suite's order editor (`/orders/:id`, `src/pages/OrderDetail.tsx`) is opened from a row click
in the Dashboard's orders table. Today there is no way to move to the next or previous order without
leaving the editor and clicking back into the table. When working through the **Pending** tab
specifically (the queue of newly-received orders that need triage), this back-and-forth is the most
frequent workflow in the app.

Additionally, `save()` always navigates back to the Dashboard (`goBack()`) on success. That's fine for
ad-hoc edits, but it defeats a Previous/Next workflow — the merchant wants to save an order and
immediately keep moving through the queue, not get bounced back to the table each time.

## Goal

From an order opened via the **Pending** tab, let the merchant:
1. See their position in the pending queue (e.g. "3 of 24").
2. Step to the previous/next pending order with a click.
3. Save the current order without leaving the editor, so Previous/Next keeps working.

This is scoped to the Pending tab only. Other tabs (Approved, Print, etc.) are unaffected — opening an
order from any other tab keeps today's exact behavior (no Prev/Next controls, Save returns to
Dashboard).

## Non-goals

- No change to how orders are fetched, filtered, or paginated on the Dashboard.
- No new backend endpoints or API changes.
- No global change to Save's post-save navigation — it only stays in place when the order was reached
  through Pending-tab navigation.
- No wraparound navigation (Next on the last pending order is simply disabled, not looped).
- No live re-filtering of the pending queue mid-session (see "List freshness" below).

## Data flow

### 1. Capturing the sequence (`src/pages/Dashboard.tsx`)

The Pending tab's badge count is already computed via `filterOrdersByStatus(warehouseOrders, "pending")`
(`src/lib/orderStatusFilters.ts`). Add a memo deriving the ordered ID list from the same source:

```ts
const pendingOrderIds = useMemo(
  () => filterOrdersByStatus(warehouseOrders, "pending").map((o) => o.id),
  [warehouseOrders],
);
```

This list:
- Respects the current **warehouse filter** (consistent with the tab badge count).
- Ignores the search box text and the table's client-side pagination — it is the *full* pending queue,
  not just what's currently visible in the table.
- Preserves the existing order (`created_at desc`, as returned by the backend and used by the table).

Pass it into the existing `orderLinkState` prop on `<OrdersTable>`, but only while the Pending tab is
active:

```ts
orderLinkState={fulfillmentTab === "pending" ? { fulfillmentTab, pendingOrderIds } : { fulfillmentTab }}
```

No changes are needed inside `OrdersTable`/`MobileOrderCards` — both already forward `orderLinkState`
verbatim as `location.state` when navigating to `/orders/:id`.

### 2. Reading the sequence (`src/pages/OrderDetail.tsx`)

Alongside the existing `fulfillmentTab` read from `location.state`, read `pendingOrderIds`:

```ts
const rawPendingOrderIds = (location.state as { pendingOrderIds?: unknown } | null)?.pendingOrderIds;
const pendingOrderIds = Array.isArray(rawPendingOrderIds)
  ? rawPendingOrderIds.filter((v): v is string => typeof v === "string")
  : null;
const pendingIndex = pendingOrderIds && id ? pendingOrderIds.indexOf(id) : -1;
const hasPendingNav = Boolean(pendingOrderIds) && pendingIndex !== -1;
const prevOrderId = hasPendingNav && pendingIndex > 0 ? pendingOrderIds![pendingIndex - 1] : null;
const nextOrderId = hasPendingNav && pendingIndex < pendingOrderIds!.length - 1 ? pendingOrderIds![pendingIndex + 1] : null;
```

Introduce a `siblingState` alongside the existing `backState`, used for any forward navigation to
another order (Prev/Next, and the Customer Panel's order-history jump) so the snapshot keeps riding
along:

```ts
const siblingState = pendingOrderIds ? { fulfillmentTab: returnTab, pendingOrderIds } : backState;
```

`goBack()` (Back button, "order not found" link, no-op save outside pending-nav) continues to use
`backState` only — it never needs to carry `pendingOrderIds` since it's returning to the Dashboard,
which recomputes the list itself.

### 3. List freshness: fixed snapshot per session

`pendingOrderIds` is captured once, at the moment the merchant leaves the Dashboard's Pending tab. It
is **not** recomputed as edits happen. If editing order #5 changes its status away from "pending" (e.g.
approving it), it still stays in the snapshot and the merchant can keep stepping through the same
sequence they started with. This keeps the navigation predictable — no order disappearing out from
under the merchant mid-review, no index jumping around.

The snapshot naturally goes stale across page reloads or if the merchant returns to the Dashboard and
re-enters — that's expected and fine; a fresh snapshot is captured the next time they click into the
tab.

## UI

### Toolbar controls

In `OrderDetail.tsx`'s sticky toolbar (`data-testid="order-editor-toolbar"`), next to the existing Back
button and title, add — only when `hasPendingNav` is true:

- A small position label: `"{pendingIndex + 1} of {pendingOrderIds.length}"`.
- Previous/Next icon buttons using Phosphor `CaretLeft`/`CaretRight` (`weight="light"`), styled as
  ghost icon buttons matching the existing Back button (`BuiButton variant="ghost" size="small"
  iconOnly`).
- Previous is disabled when `prevOrderId` is `null` (first pending order); Next is disabled when
  `nextOrderId` is `null` (last pending order). No wraparound.

### Navigation

```ts
function goToSibling(targetId: string) {
  navigate(`/orders/${targetId}`, { state: siblingState, replace: true });
}
```

`replace: true` is used specifically for Prev/Next so that repeatedly stepping through orders doesn't
pile up browser history entries — pressing the browser's Back button from the editor returns directly
to the Dashboard, not to each previously-viewed order.

The existing `initializedOrderId` ref + effect in `OrderDetail.tsx` (lines ~196-213) already correctly
re-hydrates all local draft state (`draft`, `customer`, discount, delivery, notes, status, source) when
`id` changes while the component stays mounted, so no additional reset logic is needed — Prev/Next
reuses this existing mechanism.

## Save behavior

`save()` currently always ends every success path (and the "nothing changed" early-return) with a call
to `goBack()`, which navigates to `/`. Change:

- When `hasPendingNav` is true: skip `goBack()`. On success, the function already resets all draft state
  from the server response before the `goBack()` call — that part is unchanged. Add
  `toast.success("Order saved")` (via the existing `@/components/ui/sonner` toast helper, same one
  Dashboard already uses) so there's still explicit save feedback now that there's no page transition.
  On the "nothing changed" early return, also skip `goBack()` and simply do nothing further (no toast —
  there's nothing to confirm).
- When `hasPendingNav` is false (direct link, or opened from any tab other than Pending): behavior is
  completely unchanged — `goBack()` fires exactly as it does today.

Errors continue to surface via the existing `saveError` state shown in `CartPanel`, unchanged.

## Edge cases

- **Direct URL entry** (`/orders/:id` with no `location.state`): no Prev/Next controls, Save returns to
  Dashboard — identical to today's behavior.
- **Customer Panel's "order history" jump** (`onOpenOrder`, unrelated feature for jumping to a past
  order from the same customer): forward `siblingState` instead of `backState` so `pendingOrderIds`
  survives the jump. If the target order happens to be in the pending snapshot, Prev/Next appears for
  it; otherwise it's hidden — same rule as any other order.
- **Non-pending tabs** (Approved, Print, Processing, etc.): `orderLinkState` never includes
  `pendingOrderIds`, so `hasPendingNav` is always `false` and nothing changes for these flows.
- **Page reload while on `/orders/:id`**: `location.state` may or may not survive a hard reload
  depending on the browser; if lost, Prev/Next controls simply don't render and Save falls back to
  today's `goBack()` behavior. No error state, just a graceful downgrade.

## Testing

- Unit/component test for `OrderDetail.tsx`: given `location.state.pendingOrderIds` containing the
  current id at a middle index, Prev/Next buttons render enabled and navigate to the correct
  neighboring id with `replace: true`.
- Boundary test: id at index 0 → Previous disabled; id at last index → Next disabled.
- Save test: with `hasPendingNav` true, a successful save does not call `navigate("/")`; without it
  (no `pendingOrderIds`, or id not found in the list), save still calls `navigate("/")` as today.
- Dashboard test: `pendingOrderIds` passed via `orderLinkState` only when `fulfillmentTab === "pending"`,
  and matches `filterOrdersByStatus(warehouseOrders, "pending").map(o => o.id)`.

## Files touched

| File | Change |
|---|---|
| `src/pages/Dashboard.tsx` | Add `pendingOrderIds` memo; extend `orderLinkState` passed to `OrdersTable` |
| `src/pages/OrderDetail.tsx` | Read `pendingOrderIds`/compute index; add `siblingState`; render Prev/Next toolbar controls; change `save()` to stay in place when `hasPendingNav` |

No backend changes. No new dependencies (Phosphor icons and the existing sonner toast helper are
already used elsewhere in the codebase).
