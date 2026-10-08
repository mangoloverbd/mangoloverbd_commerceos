# Plan: cut Supabase egress and per-request overhead

Branch: `perf/cut-egress` (suite, from origin/main e993183) + `perf/remove-posthog` (storefront).
Baseline (24h to 2026-09-23 23:59 UTC): ~20 GB/day Supabase uncached egress, 745k Supabase requests/day.

## A. Orders list: delta polling instead of full reloads
Problem: `GET /api/orders` returns every order + all items (~1.9 MB) each call; Dashboard polls every 60s, OrderDetail refetches the full list every 30s.
- Server `GET /api/orders?changed_since=<iso>`: returns only orders whose `updated_at > changed_since`, plus orders whose `order_items.updated_at > changed_since`, with their items; plus `totalCount` (count-only head query) and `syncedAt` (server time at query start minus 5s overlap). Without `changed_since`, behaviour is unchanged (existing tests keep passing).
- New `src/lib/ordersSync.ts`: `syncOrders(queryClient)` merges the delta into the `["/api/orders"]` cache by id, re-sorts by created_at desc. It does a full reload when: no cache, no cursor, cursor older than 10 min, or merged length != totalCount (catches deletes).
- Dashboard `fetchOrders` and OrderDetail `historyQuery` use `syncOrders`.
- Warehouse page (`?warehouse_id=`) unchanged.
- → verify: new tests for merge/fallback rules + route delta branch; existing dashboard/order-detail tests pass.

## B. Analytics: fewer columns + short shared cache
- `/api/analytics` orders query selects only `id, created_at, price, delivery_rate, product` (all the computation reads).
- New `server/ttlCache.js` (Redis with in-memory fallback, same pattern as sidebarAlertInsightsCache): cache the full response per org+since+until. TTL 60s if the range includes today (Dhaka), 10 min if it ended before today. The `t=` cache-buster is ignored. Covers the Meta Graph ad-spend call too.
- → verify: ttlCache unit tests (hit, expiry, Redis failure fallback); route wiring test.

## C. Auth: stop 3 Supabase round trips per request
- `getUser`: in-process cache keyed by sha256(token), TTL = min(30s, token exp). Stores user + role row.
- `getUserOrg`: in-process cache by userId, TTL 30s, filled by getUser.
- `ensureUserRole`: skip the admin upsert when the row already equals what it would write (today every admin request writes to user_roles).
- Invalidate the user's entries on every user_roles write in this file (register, assign-role, team-member create/delete/rollback).
- Security bound: a removed staff member or revoked session keeps access for at most 30s on an already-warm instance. Soft-delete denial and org_id guards unchanged.
- → verify: unit tests for cache hit, expiry at token exp, invalidation, deleted user denied.

## D. Sidebar alerts fallback
- On `/api/sidebar-alerts` failure keep the last alerts instead of downloading the full orders list.
- → verify: updated useSidebarAlerts test.

## E. Storefront: remove leftover PostHog snippet
- Delete `client/index.html` lines 13-20 in mangoloverbd_storefront.
- → verify: `npm run check`, `npm run build`, grep shows no posthog.

## Deferred
- Realtime revision signal for the storefront. Ruling: skip — public catalog is already CDN-cached (x-vercel-cache HIT, s-maxage=30) — cost if wrong: a few thousand cheap storefront requests/day.

## Files touched
Suite: `server/index.js`, `server/ttlCache.js` (new), `src/lib/ordersSync.ts` (new), `src/pages/Dashboard.tsx`, `src/pages/OrderDetail.tsx`, `src/hooks/useSidebarAlerts.ts`, new/updated tests in `src/test/`.
Storefront: `client/index.html`.

## Verification (whole branch)
`npm test`, `npm run lint`, `npm run build`; independent review; after deploy re-run Supabase edge-log + Vercel 24h counts against the baseline.
