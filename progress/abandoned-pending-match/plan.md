# Plan — Flag abandoned checkouts whose customer already has a Pending order

## Goal
If an abandoned checkout's phone matches an order that is currently in the **Pending** tab, highlight it (a) on the row in the Abandoned tab and (b) on the Abandoned editor page (`/abandoned/:id`), linking to that order. Only the Pending tab counts; orders in other tabs are ignored. Frontend only.

## Rulings
- Match by phone only, via `normalizeBdPhone` (src/lib/bdPhone.ts); checkouts or orders whose phone doesn't normalise never match — cost if wrong: add name matching later.
- "In Pending" = `classifyOrderStatus(order) === "pending"` (src/lib/orderStatusFilters.ts), the same function that drives the Pending tab — so the badge always agrees with the tab.
- The editor matches on the *saved* checkout phone plus the live phone draft (use the live `customer.phone` so a corrected number updates the banner).

## Files touched
1. `src/lib/abandonedPendingMatch.ts` — NEW, pure helper.
2. `src/components/orders/AbandonedCheckoutQueue.tsx` — optional prop + row badge/highlight.
3. `src/pages/Dashboard.tsx` — build the map from its `orders` state (useMemo) and pass it to the queue.
4. `src/pages/AbandonedDetail.tsx` — banner.
5. Tests: `src/test/abandonedPendingMatch.test.ts` (new), extend `src/test/abandonedCheckoutQueue.test.tsx` and `src/test/abandonedDetail.test.tsx`.
No server changes.

## Steps
1. Helper:
   ```ts
   export type PendingOrderMatch = { id: string; order_number: string | null };
   export function buildPendingOrdersByPhone(orders: Array<StatusFilterOrder & { id: string; order_number?: string | null; phone?: string | null }>): Map<string, PendingOrderMatch[]>
   export function pendingOrdersForPhone(map, phone: string | null | undefined): PendingOrderMatch[]  // normalises, returns [] when none
   ```
   → verify: unit tests — pending order with "+8801712345678" matches checkout "01712345678"; approved/on_hold/delivered order with same phone → no match; invalid phone → []; two pending orders → both returned.
2. Queue: add optional prop `pendingOrdersByPhone?: Map<string, PendingOrderMatch[]>` (default empty map). For a row with matches:
   - Next to the "Held in Order Protection" chip, add a link chip styled the same way but amber/yellow via the existing `bg-status-yellow-background text-status-yellow-text` tokens is already used by Protection — use a DIFFERENT existing status token for this one (check tailwind config / src/index.css for `status-orange-*` or `status-rose-*`; pick orange if it exists, else rose). Text: `Also in Pending · #<order_number>` (if several: `Also in Pending · 2 orders`). `href` → `/orders/<id>` of the first match, use React Router `<Link>` (react-router-dom) with `onClick={(e) => e.stopPropagation()}` so it doesn't open the checkout row; `title="This customer already has an order in the Pending tab"`.
   - Highlight the row: add a subtle left accent + tint on the row container (e.g. `bg-status-orange-background/40` or same token family, plus `data-pending-match="true"`). Keep it subtle; don't change layout.
   → verify: queue test renders badge with order number and link href `/orders/<id>`; row without match has no badge.
3. Dashboard: `const pendingOrdersByPhone = useMemo(() => buildPendingOrdersByPhone(orders), [orders]);` pass to `<AbandonedCheckoutQueue pendingOrdersByPhone={...}>` (~line 1842).
4. AbandonedDetail: get orders with `useQuery({ queryKey: ["/api/orders"], queryFn: () => syncOrders(queryClient), staleTime: 60_000 })` (syncOrders from src/lib/ordersSync.ts writes that same key; check its generic/type and the Order type used by Dashboard — reuse the type from src/components/OrdersTable.tsx `Order` or a minimal structural type). Compute matches with `pendingOrdersForPhone(map, customer.phone || checkout.phone)`. When matches exist, render a banner directly under the sticky toolbar, above the editor panels: rounded-[6px] tinted panel (same token family as the queue badge), Phosphor `Warning` icon weight="light" size 16, text "This customer already has {n === 1 ? "an order" : `${n} orders`} in Pending", followed by links "#<order_number>" to `/orders/<id>` (React Router Link). role="status". Do not block any action.
   → verify: detail test — orders fetch mocked to include a pending order with the same phone → banner + link; an approved order with the same phone → no banner. Make sure existing abandonedDetail tests still pass (the mock for `/api/orders...` URLs must return a sensible empty response — check what syncOrders requests).
5. Design rules: Phosphor weight="light", no new fonts, 6px radius on the banner/links to match the editor.

## Verify
- Targeted tests green; full `npx vitest run` no new failures (baseline 247 files / 1701 tests on main).
- eslint on touched files clean; `npx tsc --noEmit -p tsconfig.app.json | grep <touched files>` no new errors.
