# Audit — perf/cut-egress review-fix round

## Files changed
- server/index.js
- server/ttlCache.js
- src/lib/ordersSync.ts
- src/pages/Dashboard.tsx
- src/test/analyticsAuthCacheWiring.test.ts
- src/test/ordersDeltaRoute.test.ts
- src/test/ordersSync.test.ts
- src/test/ttlCache.test.ts
- progress/cut-egress/audit.md (this file)

## server/index.js
- GET /api/orders (finding 1): removed the `Date.now() - 5000` cursor. Added a local `maxUpdatedAt(values)` helper.
  - Delta: `overlapSince = changedSince - 120s`. The orders and order_items change queries use `.gt("updated_at", overlapSince)` and select `updated_at`. `syncedAt = max(changedSince, the orders' and items' updated_at)`.
  - Full: `syncedAt = max(updated_at of returned orders, their items)`, or `null` when there are no rows.
  - `attachOrderItems` selects item `updated_at` so it can compute the max, then strips it so the item payload is unchanged. It now returns `{ ordersWithItems, itemsMaxUpdatedAt }`.
  - The org_id and warehouse guards are unchanged.
- GET /api/analytics (findings 2 and 3):
  - Added a local `let degraded = false`. It is set when any of these fail: the products query returns an error, the COG try-block throws, the meta_connections/meta_ad_accounts lookups return an error, the currency lookup returns an error, or either warn-only catch runs.
  - `cacheable: !fbError && !degraded`. The response JSON is unchanged. On error `data` is null, which is the same value the code used before.
  - `fresh = req.query.fresh === "1"` is passed as `{ fresh }` to `analyticsCache.get`. The cache key is still `${orgId}:${since}:${until}`, so it ignores `t` and `fresh`.

## server/ttlCache.js
- `get(key, ttlMs, compute, { fresh = false } = {})`: `fresh` skips both the Redis and memory reads but still stores the result. This file is on the original plan's Files touched list.

## src/lib/ordersSync.ts (finding 4, plus null handling for finding 1)
- `syncedAt?: string | null`. The existing `data.syncedAt ? … : null` already treats null as "no cursor", so the next sync is full. There is a new test for this.
- The delta merge now reads `getQueryData(["/api/orders"])` right before writing. If the cache was cleared while the request was in flight, it falls back to a full sync.
- In-flight dedupe: a non-full call returns the in-flight promise. A full call waits for the in-flight one (and ignores its errors), then runs. The slot is cleared when the call settles, whether it succeeds or fails.
- Deviation: the in-flight slot is a `WeakMap<QueryClient, Promise>`, not a single module variable. With a single variable, a pending sync from one QueryClient was handed to another client. This broke `order-detail.test.ts` ("shows the customer's last orders…"). There is one QueryClient in the app, so behaviour there is the same. `resetOrdersSyncCursor` also clears the in-flight slot.

## src/pages/Dashboard.tsx (finding 3)
- `fetchAnalytics(range, silent, fresh = false)`. Only the main-range request gets `fresh=1`. The previous-period call is unchanged.
- `fresh=1` is used after the Shopify auto-sync (`fetchAnalytics(todayRange, true, true)`) and after a price/shipping/quantity change in handleOrderUpdate (`fetchAnalytics(dateRange, false, true)`).
- The 60s interval poll and the date-range effect are unchanged, so they stay cached.
- Deviations: (a) Dashboard has no manual refresh button, so nothing was wired there. (b) The courier refresh never called fetchAnalytics, and courier status is not an input to analytics. Adding a new analytics call there would add scope, so I left it out.

## Tests
- ordersDeltaRoute: cursor comes from DB updated_at (no `Date.now()`), `updated_at` is selected, the 120s overlap applies to both queries, and org guards are kept.
- analyticsAuthCacheWiring: `degraded` wiring, `fresh` wiring and cache key, Dashboard `fresh` call sites.
- ttlCache: `fresh` skips the read and stores the new value in Redis and memory.
- ordersSync: syncedAt null, merge at write time keeping optimistic updates, shared in-flight promise, full call after in-flight, slot cleared after failure.

## Results
- `npm test`: 218 files, 1411 tests passed.
- `npx eslint . --ignore-pattern '.claude/**' --ignore-pattern '.worktrees/**'`: 36 problems (0 errors, 36 warnings), the same as the baseline.
- `npm run build`: built in 5.92s (only the usual chunk-size warning).
- `node --check server/index.js`: OK.

## Open risks
- `getSettings()` (used by `getOrgSettings` for the facebook token and account) ignores Supabase errors. If that fails, analytics can cache `fbConfigured: false` for up to 60s or 10 min. Fixing it means changing a shared helper, which is outside this round.
- Delta `syncedAt` is `max(changedSince, rows)`, so the cursor never moves backwards. A row committed more than 120s after its transaction started, with an updated_at older than the cursor minus 120s, would still be missed until the 10-min full refresh.
- An overlapping full call waits for the in-flight sync, so a slow in-flight request delays the full sync.
