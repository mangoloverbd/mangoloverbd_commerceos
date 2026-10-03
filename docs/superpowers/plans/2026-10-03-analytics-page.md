# Analytics Page (replaces Order Analysis and PostHog) — Implementation Plan

**Goal:** Rename Order Analysis to **Analytics** and make it Mango Lover BD's one place for website,
acquisition, product, funnel and forecast reporting, using first-party data in our own Supabase so
PostHog can be cancelled.

**Approved design:** mockup at https://claude.ai/artifact/E3E8A43EjFt8eZir5cmp4m (sample data).

**Metric rules:** follow `2026-10-02-first-party-analytics-revised.md` §4–§7 (identity, sessions,
counting, date basis, attribution, outcome adapter, storage). That plan is the specification; this
document sets the page design, scope split and build order. Where they differ, this document wins on
**sequencing and page layout only**.

---

## 1. Decisions (confirmed by the user, 2026-10-03)

| # | Decision |
|---|---|
| A1 | Page name **Analytics**. Sidebar position unchanged: **Intelligence** section, directly below **Ask Edith**, same icon, still disabled for non-admins. Route `/analytics`; `/order-analysis` redirects there. |
| A2 | **Admin only** (`AdminRoute`), as Order Analysis is today. |
| A3 | Tabs: Overview · Acquisition · Products & pages · Funnel & checkout · Customers (Release 2) · AI forecast · Data health. Tab kept in the URL (`?tab=`). |
| A4 | **AI forecast** is its own tab containing every current Order Analysis feature (signals, executive summary, recommended actions, revenue trend, stock-out risks, product health). |
| A5 | Retention: raw events **90 days**; session and per-session facts **25 months** (previous-year comparison); daily summaries kept indefinitely. |
| A6 | Charts reuse Business Report / Staff Performance components (`EChart`, `chartTheme`, sparkline tiles, intake-rhythm dot grid, source donut, outcome sankey, gauge, leaderboard bars, product rings). The funnel uses the existing `src/components/ui/funnel-chart.tsx` (`FunnelChart`), curved, 3 layers, Delivered stage green. |
| A7 | Two releases. Release 1 replaces PostHog without touching the four storefront checkout components. Release 2 adds checkout instrumentation, customers/retention, ad spend (shared with Campaign Links Phase E), alerts and exports. |

---

## 2. Phases

### Phase 0 — Cut the PostHog bill (no UI change)
The tracker pings every 20 seconds and every ping is captured in PostHog; reports only need page views
and explicit steps.
- `tracker.js` (served by `server/index.js`) sends `kind`: `pageview` (first load and each navigation),
  `heartbeat` (20 s interval, focus, visibility) or `step` (`MerchantSuiteTracker.track`).
- `/api/live-visitor/ping` keeps updating Redis presence for every ping, but forwards to PostHog only when
  `shouldForwardTrackerHit(kind)` allows it: `heartbeat` is never forwarded; `pageview`, `step` and
  legacy pings without `kind` (open tabs on the old script) still are.
- Pure helper in `server/trackerHits.js`, unit tested. Storefront needs no change: it loads
  `/api/tracker.js` from Merchant-Suite.
- **Verify:** tests; PostHog event volume drops within a day; Dashboard live visitors unchanged.

### Phase 1 — Rename and page shell
- Sidebar title, route `/analytics`, redirect from `/order-analysis`, page title.
- Tab bar (A3) with URL state. **AI forecast** tab hosts the existing forecast UI restyled to the
  Business Report panel language. Other tabs temporarily show the existing PostHog-backed Website
  Behavior data (Overview) or "collecting data" states.
- **Verify:** route/redirect/admin tests; sidebar position test; forecast content unchanged.

### Phase 2 — First-party collection (Release 1 core)
Per revised plan §4.1–4.2, §7 and Tasks 2–3, limited to events available without editing checkout components:
- Supabase migration (supabase skill, `verify:supabase-project`, `verify:supabase-baseline`):
  `analytics_sessions`, `analytics_events` (stable `event_id`), `analytics_session_pages`,
  `analytics_session_products`, `analytics_order_facts`, daily summary tables; RLS on, service-role only.
- Tracker: first-party `ms_vid` / `ms_sid` cookies, 30-minute inactivity sessions, `page_view` and
  `product_view` (product pages identified from the catalog path), engagement flushes; heartbeats stay Redis-only.
- Ingestion on the existing ping route, workspace-checked (handle, or legacy `org` only if it equals
  the fixed workspace), rate limited, bots and team/test traffic excluded.
- Order linkage: storefront proxies forward `ms_sid` (same pattern as the Campaign Links `ml_cclick`
  cookie); order intake writes one durable `analytics_order_facts` row with frozen first/last-touch
  attribution. Missing or invalid context never fails an order.
- Nightly rollup + retention job (`/api/internal/analytics-rollup`, `CRON_SECRET`), rebuilding a
  rolling 7-day window.
- **Verify:** pure-module tests, real-PostgreSQL migration tests, ingestion/order-link route tests.

### Phase 3 — Fill the tabs (Release 1 reports)
Admin endpoints per revised plan §11 (`/api/analytics/website?view=…`, drill-down), Dhaka dates,
previous-period comparison, coverage metadata, "—" for unknown money.
- **Overview:** six tiles with sparklines and change, traffic chart (bars + previous period), visit
  rhythm dot grid, source donut, compact `FunnelChart`, live visitors and data-health pills in the header.
- **Acquisition:** delivered revenue by source (last non-direct / first touch), source → outcome sankey,
  source table including Campaign Links rows.
- **Products & pages:** most-viewed leaderboard (view → order → delivered), revenue rings, entry pages
  including `/step/` landing pages.
- **Funnel & checkout:** full-width `FunnelChart` (Visits → Product → Cart → Checkout → Order → Delivered),
  step rates with biggest drop highlighted, device and direct-buy/cart charts. Cart/checkout stages use
  existing tracker steps until Release 2 instrumentation.
- **Data health:** freshness, matched-order coverage, unknown source, filtered bot/team visits, rollup
  status, and the PostHog side-by-side chart during switch-over.
- Keep `/api/order-analysis/website-behavior` response-compatible while it still exists.
- **Verify:** report-contract tests, component tests, `npm test`, `npm run lint`, `npm run build`, browser QA.

### Phase 4 — Switch-over and PostHog removal
- `ANALYTICS_SOURCE=posthog|first_party`; run both for at least two weeks after Phase 2 is live.
- Visitor/session counts within about 10% (purchases intentionally differ: real orders vs thank-you URLs).
- Switch default, then remove PostHog capture/query code and env vars; cancel the subscription only
  after explicit approval. **Release 1 complete.**

### Phase 5 — Release 2
- Checkout tab extras: opened/input/submitted/failed/review-pending events via a shared storefront
  wrapper in the four checkout components; failure reasons; abandoned-checkout recovery.
- **Customers** tab: new vs returning buyers, repeat delivered-purchase gauge, monthly cohorts.
- Ad spend and delivered ROAS: one Meta spend pipeline shared with Campaign Links Phase E (not before
  2–4 weeks of verified attribution data, i.e. late October 2026).
- Alerts, CSV export and order drill-down lists.

---

## 3. Rollout order and rollback
0 → 1 → 2 → 3 → (2 weeks) → 4 → 5. Each phase is its own PR. Schema changes are additive; rollback
reverts the application change and leaves data in place.

Before each PR: `review`, `verification-before-completion`, then `ship`.
