# Audit — abandoned-pending-match

## Files changed
- src/lib/abandonedPendingMatch.ts (new)
- src/components/orders/AbandonedCheckoutQueue.tsx
- src/pages/Dashboard.tsx
- src/pages/AbandonedDetail.tsx
- src/test/abandonedPendingMatch.test.ts (new)
- src/test/abandonedCheckoutQueue.test.tsx
- src/test/abandonedDetail.test.tsx
- src/test/dashboardOrderStatusFilter.test.tsx

## Per file
- **src/lib/abandonedPendingMatch.ts**: `PendingOrderMatch`, `buildPendingOrdersByPhone` (uses `classifyOrderStatus === "pending"` + `normalizeBdPhone`), `pendingOrdersForPhone`, and `pendingOrderLabel` (turns the order number into "#1234" and strips any existing leading '#' so it never shows "##"; a missing number shows "#—").
- **AbandonedCheckoutQueue.tsx**: new optional prop `pendingOrdersByPhone` (defaults to a module-level empty Map). Matched rows get `data-pending-match="true"`, a `bg-status-rose-background/40` tint and a 2px inset left accent in `--color-status-rose-text`. A React Router `<Link>` chip sits next to the Protection chip and uses `stopPropagation`. It uses the user's wording ("Already ordered · #1234" / "Already ordered · N pending" plus the specified tooltips).
- **Dashboard.tsx**: builds `pendingOrdersByPhone` with useMemo from `orders` and passes it to the queue. 4 added lines.
- **AbandonedDetail.tsx**: `useQuery(["/api/orders"], syncOrders, staleTime 60s, enabled once checkout loaded)`. It matches on the live `customer.phone` only (review round 1: an empty draft no longer falls back to `checkout.phone`; the draft is seeded from the checkout on load) and shows a role="status" banner (rose token, Phosphor `Warning` light 16, 6px radius) with the user's wording and links to `/orders/:id`. No actions are blocked.
- **Tests**: 4 unit tests, 3 queue tests (single, multiple, "##" guard), 4 detail tests (single, multiple, approved means no banner, clearing the phone hides the banner). The no-banner test now waits for the `["/api/orders"]` query to reach `success` with data, not a 20ms sleep. Dashboard wiring test in dashboardOrderStatusFilter.test.tsx: pending order #101 plus a checkout with the same phone, open the Abandoned tab, and the "Already ordered · #101" link to /orders/pending appears.

## Deviations / rulings
- Ruling: badge and banner copy follow the coordinator's mid-task wording change instead of the plan's copy — the user's instruction — low cost.
- Ruling: colour token = `status-rose` — no `status-orange-*` exists in src/styles/theme.css — rose is also used by the Dismiss chip, so some visual overlap.
- Ruling: added `pendingOrderLabel` to the new helper (not in the plan) — the queue and the banner share the "##" guard — negligible.
- Ruling: minimal structural `PendingMatchOrder` type in AbandonedDetail instead of importing Order — the plan allowed either — none.
- Ruling: the badge and banner match orders across all warehouses — the customer did order, whatever the warehouse — with a warehouse filter active the badge can point to an order that is not visible in the filtered Pending tab.
- Ruling: orders query is `enabled: Boolean(checkout)` — avoids fetching on not-found — the banner appears slightly after the checkout loads on a cold cache.

## Results
- Baseline: 247 files / 1701 tests passed.
- Targeted: 3 files / 40 tests passed.
- Full: 248 files / 1711 tests passed.
- eslint on the 7 touched files: exit 0, no output.
- tsc grep: 2 errors in Dashboard.tsx, lines 339 (framer variants) and 1185 (matchesOrderSearch). Neither is on a line I touched, so both predate this change. No errors in the other touched files.

## Open risks
- On a cold cache the editor now calls `/api/orders` (a full sync) when opened directly. The Dashboard usually warms that cache already.
- The row tint and inset shadow rely on Tailwind v4 CSS variables at runtime. I have not checked them visually in a browser.
