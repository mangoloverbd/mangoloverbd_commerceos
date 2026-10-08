# Plan: cut Vercel/Supabase/OpenAI request volume

Baseline (Vercel runtime logs, suite project, 24h ending 2026-09-24 ~05:20 BDT): ~164k function runs.
Goal: cut to roughly half or less without making the storefront slower.

## Repo 1 — Merchant Suite (branch `perf/cut-request-volume` from origin/main)

S1. Cache CORS preflights: add `maxAge: 86400` to the global `cors()` at `server/index.js:512`.
    → verify: test — OPTIONS on a public route returns `Access-Control-Max-Age: 86400`.
S2. Sidebar alerts stop calling OpenAI every minute: cache `buildSidebarAlertInsights` result per org
    (Redis when available, memory fallback) for 15 min, keyed on the set of alert ids; client poll 60s → 5 min.
    → verify: test — two calls with the same alerts invoke OpenAI once.
S3. New `src/hooks/useVisibleInterval.ts`: runs a callback on an interval, skips ticks while
    `document.hidden`, fires once when the tab becomes visible again. Apply to:
    - `Dashboard.tsx` orders / abandoned checkouts / analytics loops: 30s → 60s
    - `useLiveVisitors.ts`: 5s → 30s
    - `useSidebarAlerts.ts`: 5 min (from S2)
    - `SocialInbox.tsx` two loops: same interval, add hidden-pause only
    → verify: hook unit tests (fake timers + visibilitychange).
S4. `OrderActivityTimeline.tsx` LIVE_POLL_MS 2s → 10s.
S5. Dashboard courier `refresh-status` POSTs (Steadfast + Pathao) run on every Dashboard mount:
    skip if last run was < 10 min ago in this browser session.
S6. `/api/live-visitor/ping`: drop the 4 counts whose results are discarded. Tracker ping 15s → 30s
    ONLY if the presence window is ≥ 60s (implementer checks the constant; otherwise leave 15s).

Deferred (separate task): paginate `GET /api/orders` (touches many pages).

## Repo 2 — Storefront (branch `perf/cut-request-volume` from origin/main)

F1. Remove the leftover `ngrok-skip-browser-warning` header (`client/src/lib/storefront-products.ts:270-274`
    and its uses) so product/inventory GETs are "simple" requests with no preflight.
    → verify: test/grep — public fetches send no custom headers.
F2. `STOREFRONT_POLL_INTERVAL_MS` 30s → 60s (open pages refresh stock/price within a minute;
    every new page load is still fresh).

## Files touched
Suite: server/index.js, src/hooks/useVisibleInterval.ts (new), src/pages/Dashboard.tsx,
src/hooks/useLiveVisitors.ts, src/hooks/useSidebarAlerts.ts, src/pages/SocialInbox.tsx,
src/components/OrderActivityTimeline.tsx, tests under src/test/.
Storefront: client/src/lib/storefront-products.ts (+ a test).

## Final verify
Both repos: `npm test`, `npm run lint`, `npm run build`. After deploy: re-run Vercel runtime-log
counts grouped by requestPath over 24h and compare with the baseline above.
