# First-Party Website Analytics (PostHog Replacement) — Implementation Plan

**Goal:** Stop paying for PostHog by storing Mango Lover BD's website analytics
in our own Supabase project, and go one step further than PostHog can:
follow each visit through to a **delivered** COD order.

The questions this must answer:
- How many people visited the storefront today / this week, and from where
  (Facebook, Instagram, TikTok, Google, a campaign link, direct)?
- Which pages and products do they look at, and where do they drop off
  (visit → product → cart → checkout → order → **delivered**)?
- Which source or campaign brings visitors who actually pay?

**Explicitly not building:** session recordings, heatmaps, feature flags,
experiments, surveys, a general-purpose query language. Those are where
PostHog's cost and complexity live, and nobody uses them today.

**Repos touched:**
- `mangoloverbd_commerceos` (Merchant-Suite): tracker script, ingestion, schema, rollups, reports.
- `mangoloverbd_storefront`: forward the analytics session cookie at checkout (small).

**Depends on:** nothing. **Pairs with:** `2026-10-02-campaign-links.md`
(shared bot filter, shared UTM naming via `buildCampaignUtm`, and the Marketing
sidebar section). Either can ship first.

---

## 0. What exists today (and why PostHog is expensive)

| Piece | Where | What it does |
|---|---|---|
| Tracker script | `GET /api/tracker.js?org=<orgId>` (`server/index.js:8186`) | Served by Merchant-Suite and already included in the storefront. Keeps a per-tab session id in `sessionStorage`, then pings **on every page change and every 20 seconds** while the tab is visible. `MerchantSuiteTracker.track("cart" \| "checkout" \| "purchased")` sends explicit steps. |
| Ping endpoint | `POST /api/live-visitor/ping` (`server/index.js:8249`) | Updates Redis live-visitor presence (the Dashboard's "live visitors") **and forwards every ping to PostHog** via `capturePostHogEvent` as `merchant_suite_live_visitor`. |
| Report | `GET /api/order-analysis/website-behavior` (`server/index.js:5452`) | Runs 3 HogQL queries against PostHog (funnel, product demand, traffic sources, 7–90 day lookback). Shown in `WebsiteBehaviorPanel` on `src/pages/OrderAnalysis.tsx`. |
| Settings copy | `src/components/IntegrationSettings.tsx` ~1388 | Says "PostHog-powered analytics". |

**The cost driver:** the 20-second heartbeat is sent to PostHog as a full event.
One visitor reading a page for 3 minutes = ~10 billable events, while the report
only needs 1 page view. Most of the PostHog bill is heartbeats.

---

## 1. Decisions (confirm before building)

| # | Decision | Proposal |
|---|---|---|
| A1 | Storage | Supabase Postgres (same Mango Lover BD project). No ClickHouse, no new vendor. |
| A2 | What is stored | Page views and funnel steps only. **Heartbeats are never stored**; they only update Redis live presence, as today. |
| A3 | Visitor identity | Anonymous first-party ids: `ms_vid` (visitor, 1 year) and `ms_sid` (session, ends after 30 min idle). No names, phones, raw IPs or fingerprints. |
| A4 | Raw data retention | Raw events kept **90 days**; sessions kept **13 months**; daily summary tables kept forever. |
| A5 | Who can see it | Admin only, like Business Report and Campaign Links. |
| A6 | Days and times | Dhaka days, using the existing `toDhakaInterval` helpers. |
| A7 | PostHog shutdown | Run both side by side for 2 weeks, compare numbers, then remove PostHog code and cancel the subscription. |

---

## 2. Phase 0 — Cut the PostHog bill now (1 small PR, before anything else)

Independent of the rest; ships in a day and cuts most of the bill immediately.

1. `tracker.js`: add `kind` to every ping: `"pageview"` (first load and each
   `locationchange`), `"heartbeat"` (the 20s interval, focus, visibilitychange)
   or `"step"` (`MerchantSuiteTracker.track(...)`).
2. `/api/live-visitor/ping`: keep updating Redis for every kind, but call
   `capturePostHogEvent` **only** for `pageview` and `step`. Pings without `kind`
   (old cached scripts, `Cache-Control: max-age=300`) keep the current behaviour
   for at most 5 minutes after deploy.
3. Test: `src/test/liveVisitorTracking.test.ts` — heartbeat updates presence but
   doesn't capture; pageview and step capture; missing `kind` captures (back-compat).

**Verify:** PostHog event volume drops sharply within a day; the Order Analysis
panel numbers stay the same (it counts distinct visitors, not events).

---

## 3. How it works end to end (Phases A–D)

```
Visitor opens www.mangolover.com.bd/product/katimon-mango?utm_campaign=katimon-reel
  → tracker.js (served by Merchant-Suite) reads/creates ms_vid + ms_sid cookies
  → POST /api/live-visitor/ping { kind: "pageview", url, referrer, ids }
      → Redis live presence (unchanged)
      → upsert analytics_sessions (first hit stores entry page, source, UTM, device, city)
      → insert analytics_events (pageview)
  → later pings: heartbeat → Redis only; cart/checkout steps → analytics_events
Visitor places an order
  → storefront api/orders.ts reads the ms_sid cookie and forwards analyticsSessionId
  → Merchant-Suite verifies the session (same org, recent) and stores orders.analytics_session_id
Nightly Vercel cron
  → rolls up yesterday into analytics_daily_* tables, deletes raw events > 90 days
Admin opens Marketing › Website
  → traffic, sources, campaigns, pages and the funnel down to delivered orders
```

---

## 4. Phase A — Database (Merchant-Suite)

Invoke the `supabase` skill first, then `supabase-postgres-best-practices` for the
indexes. Run `npm run verify:supabase-project` before any linked command and
`npm run verify:supabase-baseline` before proposing the migration.

**Migration:** `supabase/migrations/20261003120000_first_party_analytics.sql`

```sql
create table if not exists public.analytics_sessions (
  id uuid primary key,                 -- ms_sid, generated by the tracker
  org_id uuid not null,
  visitor_id uuid not null,            -- ms_vid
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  entry_path text,                     -- first page of the visit (product, /step/ landing page, home…); not the /step/ landing-page attribution
  referrer_host text,
  source text not null,                -- facebook | instagram | tiktok | google | youtube | campaign_link | direct | <host>
  utm_source text, utm_medium text, utm_campaign text,
  campaign_link_id uuid,               -- set when utm_medium = campaign_link and the slug matches (FK added once campaign_links exists)
  device text,                         -- mobile | desktop | tablet | unknown
  city text,                           -- from Vercel x-vercel-ip-city; never store IP
  pageviews integer not null default 0,
  reached_product boolean not null default false,
  reached_cart boolean not null default false,
  reached_checkout boolean not null default false
);
create index on public.analytics_sessions (org_id, started_at desc);
create index on public.analytics_sessions (org_id, visitor_id);

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  session_id uuid not null references public.analytics_sessions(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  kind text not null,                  -- pageview | cart | checkout | purchased
  path text not null,
  product_handle text                  -- parsed from /product/<handle> (also /products/), else null
);
create index on public.analytics_events (org_id, occurred_at desc);
create index on public.analytics_events (session_id);

create table if not exists public.analytics_daily_sources (
  org_id uuid not null, day date not null, source text not null, utm_campaign text not null default '',
  sessions integer not null, visitors integer not null, product_views integer not null,
  carts integer not null, checkouts integer not null, orders integer not null,
  primary key (org_id, day, source, utm_campaign)
);

create table if not exists public.analytics_daily_pages (
  org_id uuid not null, day date not null, path text not null,
  views integer not null, visitors integer not null, carts integer not null, checkouts integer not null,
  primary key (org_id, day, path)
);

alter table public.orders
  add column if not exists analytics_session_id uuid references public.analytics_sessions(id) on delete set null;
alter table public.abandoned_checkouts
  add column if not exists analytics_session_id uuid references public.analytics_sessions(id) on delete set null;

alter table public.analytics_sessions enable row level security;
alter table public.analytics_events enable row level security;
alter table public.analytics_daily_sources enable row level security;
alter table public.analytics_daily_pages enable row level security;
-- No policies: service-role (Express) access only.
```

Notes:
- Orders are **not** stored in the daily tables' outcome columns: delivered /
  cancelled / returned change for weeks after the visit, so reports join
  `orders.analytics_session_id` live and classify with the Business Report outcome
  rules (same as Campaign Links). The daily `orders` count is "orders placed".
- **Volume check:** a busy mango-season day of ~5,000 visitors × ~5 pages ≈ 25k
  event rows/day ≈ 2.3M rows over the 90-day window. Fine for Postgres with these
  indexes; reports for ranges older than "yesterday" read the small daily tables.
- Regenerate `src/integrations/supabase/types.ts` after applying.

---

## 5. Phase B — Ingestion (Merchant-Suite backend)

Invoke `plan-eng-review` on this section before coding.

### B1. `server/analytics.js` (pure, unit-tested; no Express/Supabase/clock)
- `parseTrackerHit(body, headers, now)`: validates and normalises a ping:
  `kind`, ids (UUID only), `url` (storefront path + query, ≤ 500 chars),
  referrer host, device from UA, city from `x-vercel-ip-city`. Returns `null` for
  anything invalid.
- `classifyTrafficSource({ url, referrer })`: replaces `extractPostHogTrafficSource`.
  UTM first, then referrer host, else `direct`. `utm_medium=campaign_link` →
  `campaign_link`. Facebook in-app browser traffic with `fbclid` and no referrer →
  `facebook`.
- `productHandleFromPath(path)`: storefront product pages are `/product/<handle>`
  (e.g. `/product/katimon-mango`); also accept `/products/<handle>` like today's
  `productNameFromUrl` (`server/index.js:5302`). `/step/<slug>` landing pages are
  reported as landing pages, not products.
- `funnelStepFromPath(path)` (keeps today's
  thank-you / cart / checkout regexes from `liveVisitorBucketFromUrl`).
- `buildDailyRollup({ sessions, events, orders, day })` for the nightly job.
- Bot filter: reuse `isBotUserAgent` from `server/campaignLinks.js` if it exists,
  otherwise create it here and have Campaign Links import it (one definition).

### B2. `tracker.js` changes (served from Merchant-Suite, so no storefront deploy)
- Keep `kind` from Phase 0.
- Replace the `sessionStorage` id with first-party cookies on the storefront domain:
  `ms_vid` (UUID, `Max-Age=31536000`) and `ms_sid` (UUID, renewed on every hit,
  `Max-Age=1800`, so it expires after 30 minutes idle). `SameSite=Lax; Secure; Path=/`.
  Cookies (not storage) so the storefront's own server can read `ms_sid` at checkout.
- Send `visitor_id` alongside `session_id`.
- New snippet uses `?handle=<storefront handle>`; `?org=` stays accepted for the
  already-deployed storefront (see B3).

### B3. `POST /api/live-visitor/ping` (extend, don't add a new endpoint)
- Resolve the workspace: `handle` → `resolveStorefrontHandle`, or legacy `org_id`
  accepted **only if it equals the deployment's Mango Lover BD workspace**. Never
  record data for an arbitrary org id from a visitor.
- Rate limit per IP (`rateLimitPublicRead` style); drop bot UAs before any write.
- `heartbeat` → Redis only (as Phase 0).
- `pageview` / `step` → upsert `analytics_sessions` (insert on first hit with the
  entry data; afterwards bump `last_seen_at`, `pageviews`, `reached_*`), then
  insert the `analytics_events` row. One round trip each; failures are logged and
  **never** change the response the tracker sees.
- PostHog capture stays in place until Phase D.

### B4. Order and abandoned-checkout intake
- `handlePublicHandleOrderSubmit` (`server/index.js` ~14132) and the abandoned-checkout
  upsert accept optional `analyticsSessionId`. If it's a UUID and the session exists with
  `.eq("org_id", orgId)` and was seen in the last 24 hours, store it. Invalid or unknown
  ids are ignored silently and **must never fail the order**.
- When an abandoned checkout converts into an order, carry `analytics_session_id` across.

### B5. Nightly job
- `GET /api/internal/analytics-rollup`, guarded by `isAuthorizedCronRequest(..., CRON_SECRET)`
  like the existing maintenance jobs. Add to `vercel.json` `crons` at `"45 3 * * *"`.
- Rebuilds **yesterday and the day before** (idempotent upsert, so late events are
  included), then deletes `analytics_events` older than 90 days and
  `analytics_sessions` older than 13 months (orders keep working via `on delete set null`).

**Verify:** `npm test` for `server/analytics.js` and the ping route (heartbeat writes
nothing to Supabase; pageview creates session + event; bot dropped; foreign org id
rejected; bad payload still returns `ok`), and the order-submit tests with
valid / unknown / foreign / malformed `analyticsSessionId`.

---

## 6. Phase C — Reports (Merchant-Suite)

### C1. Swap the existing panel's data source (no UI change)
- Re-implement `GET /api/order-analysis/website-behavior` on our tables, returning the
  **same response shape** (`funnel`, `dropOff`, `productDemand`, `trafficSources`), so
  `WebsiteBehaviorPanel` keeps working untouched. `purchases` becomes real orders with
  an `analytics_session_id` instead of thank-you-URL guessing.
- `configured` is always `true` once the migration is live.
- Behind `ANALYTICS_SOURCE=posthog|first_party` (default `first_party`) during the
  two-week comparison, so either can be checked.

### C2. New page: **Marketing › Website** (`/marketing/website`, `AdminRoute`)
Invoke `brainstorming` / `plan-design-review` for the visual pass; follow CLAUDE.md §8
and the `dataviz` skill for charts.
- `DateRangePicker` (Business Report defaults). Tiles: Visitors · Sessions ·
  Orders · Delivered · Visit-to-delivered rate.
- Daily visitors + orders chart.
- Funnel: visit → product view → cart → checkout → order → **delivered**
  (delivered / cancelled / returned from the Business Report outcome classifier).
- Sources & campaigns table: sessions, orders, delivered, delivered revenue (৳) per
  source and per `utm_campaign`; rows for campaign links link to the Campaign Links detail page.
- Top pages and top products with view → cart → order rates.
- Live visitors stays on the Dashboard as today.
- Endpoint: `GET /api/analytics/website?from&to` (admin, `org_id`-scoped), reading daily
  tables for closed days and raw tables for today.

### C3. Settings copy
- `IntegrationSettings.tsx`: replace "PostHog-powered analytics" with first-party wording,
  and show the snippet with `?handle=`.

**Verify:** component tests in `src/test/` (page renders tiles, funnel and ৳ values;
hidden for team members), `npm run lint`, `npm run build`.

---

## 7. Phase D — Storefront + PostHog removal

**Storefront (`mangoloverbd_storefront`, separate PR):**
1. Confirm the storefront loads `tracker.js`; if it passes `?org=`, switch to `?handle=`.
2. `server/order-service.ts` / `api/orders.ts` and `api/abandoned-carts.ts`: read the
   `ms_sid` cookie and forward it as `analyticsSessionId` (optional uuid in the zod
   schema). Same pattern as Campaign Links' `ml_cclick`; if both plans ship, do it in one PR.
3. Tests: cookie forwarded; absent cookie → field omitted.

**PostHog removal (after 2 weeks of side-by-side numbers that roughly agree):**
- Delete `capturePostHogEvent`, `queryPostHogHogql`, `extractPostHogTrafficSource`,
  the `ANALYTICS_SOURCE` switch, and their tests
  (`src/test/orderAnalysisPostHogBehavior.test.ts` becomes a first-party test).
- Remove `POSTHOG_*` env vars from Vercel, then cancel the PostHog subscription.

---

## 8. Rollout order

1. **Phase 0** (PostHog bill cut) — ship immediately.
2. Phase A migration (additive; safe with old code running).
3. Phase B ingestion. Data starts accumulating; nothing visible changes yet.
4. Phase C1 behind `ANALYTICS_SOURCE`; compare with PostHog for 2 weeks.
5. Phase C2 new page and C3 copy.
6. Phase D storefront PR, then PostHog removal.

Before each PR: `review` skill (public endpoint abuse, workspace guard, no personal data),
`verification-before-completion`, then `ship`.

---

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Database grows too fast in mango season | Heartbeats never stored; 90-day raw retention; reports read daily tables; volume estimate in §4 |
| Public endpoint spammed with fake hits | Per-IP rate limit, UUID-only ids, payload size limits, bot UA filter, workspace check; worst case is noisy analytics, never data access |
| Recording data for an arbitrary org | Handle-based resolution; legacy `org_id` accepted only if it is the fixed Mango Lover BD workspace |
| Analytics failure slows or breaks the storefront | Tracker is fire-and-forget (`keepalive`, errors swallowed); ingestion errors are logged, not returned; order submit ignores bad ids |
| Numbers differ from PostHog during comparison | Expected for "purchases" (real orders vs URL guess); document the definitions on the page; investigate only visitor-count gaps > ~10% |
| Personal data | No IPs, names or phones in analytics tables; anonymous random ids; city only |
| Facebook in-app browser drops the referrer | `fbclid` and UTM checks in `classifyTrafficSource`; Campaign Links' automatic UTM tags label those visits |

---

## 10. Out of scope (later)

- Session recordings and heatmaps.
- Custom events beyond the funnel steps (add `MerchantSuiteTracker.track` names only when a report needs them).
- Cross-device identity (linking a visitor to a customer profile by phone after they order).
- Sending events to Meta Conversions API (separate plan; must go through the GTM-owned Pixel/CAPI setup).
- Google/TikTok ad spend next to sources.
