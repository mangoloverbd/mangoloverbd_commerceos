# First-party merchant analytics: revised implementation plan

> **For agentic workers:** Use the `executing-plans` skill to implement approved tasks in dependency order. Steps use checkbox syntax for tracking. Read both repositories' `AGENTS.md` before editing them.

**Goal:** Give Mango Lover BD reliable website, acquisition, product, checkout, delivered-profitability, and repeat-customer reporting so daily merchant decisions no longer require PostHog.

**Architecture:** Extend the existing Merchant-Suite tracker and ingestion endpoint, instrument the dedicated storefront's shopping flows, and connect anonymous visits to authoritative server-side orders. Store events and compact reporting facts in the existing Supabase project. Reuse the current customer, order, recovery, courier, and Meta integrations; keep report routes in `server/index.js` and put aggregation rules in focused modules.

**Tech stack:** React 18, React Router v6, TanStack Query v5, Express, Supabase Postgres, existing Redis presence, Vercel, Vitest, and the storefront's existing test runner.

**Status:** Proposed revision for approval. This document does not authorize implementation, migrations, deployment, or subscription cancellation. Local application code and the original plan were inspected; the remote database was not inspected.

**Original:** [First-party analytics plan at commit f81d612](https://github.com/mangoloverbd/mangoloverbd_commerceos/blob/f81d61219d0fadc052406368309e1d1066cf0a0d/docs/superpowers/plans/2026-10-02-first-party-analytics.md).

**Companion:** [Campaign Links plan](2026-10-02-campaign-links.md). Preserve its confirmed decisions for shared link management and automatic UTM defaults. The local revised Campaign Links draft informed this comparison; reconcile the two implementation plans before building their shared attribution and spend features.

## 1. Recommendation: what belongs in the first build

Build the complete merchant baseline below as one release delivered through small, independently tested PRs. The heartbeat cost reduction can ship first. It is not the finished analytics product.

The first release is enough for Mango Lover BD's daily acquisition, conversion, COD delivery, and repeat-purchase decisions once the acceptance gates pass. It does not replace Shopify's storefront, checkout, inventory, or other commerce operations. Those already have their own homes in Merchant-Suite and the dedicated storefront.

Three possible scopes were considered:

| Approach | Result | Recommendation |
|---|---|---|
| Implement only the original plan | Lower PostHog usage and basic traffic reports; weak profitability, retention, and checkout diagnosis | Useful intermediate milestone, insufficient final scope |
| Add the merchant essentials in this revision | Enough information to decide what to advertise, fix, stock, and sell again | Recommended first release |
| Rebuild the wider PostHog product suite | Adds replay, experimentation, arbitrary event exploration, and much more maintenance | Outside this release |

Meta campaign spend, basic retention cohorts, exports, tracking health, and period comparisons are included in release one. They are not deferred to a later phase. Rich replay, heatmaps, general-purpose report builders, predictive lifetime value, and additional ad-platform connectors can wait.

## 2. Scope and coverage

All rows marked release one must have implementation and acceptance coverage before calling this a complete merchant analytics replacement.

| Capability | Original coverage | Revised release-one requirement |
|---|---|---|
| Visitors, sessions, pageviews, live visitors | Included | Preserve; define counting and exclude staff/test traffic |
| Traffic sources and campaigns | Included | Source, medium, campaign, content, term; paid/organic/unknown; first touch and last non-direct attribution |
| Page and product demand | Included | Separate entry pages from viewed pages; explicit product/variant events and order-item joins |
| Funnel through delivered orders | Included | Session-based open funnel plus checkout-path breakdown; explicit server-backed outcomes |
| Delivered revenue by source | Included | Placed value, delivered value, AOV, revenue/session, returns, refunds, and completeness |
| PostHog cost reduction | Included | Heartbeats update live presence only; no raw heartbeat event storage |
| Existing Website Behavior panel | Included | Preserve response compatibility while documenting corrected metric meanings |
| Daily summaries and retention | Included | Exact range visitors within a declared window; durable order attribution after session expiry |
| Date comparisons | Missing | Previous period and previous year, with percentage and absolute changes |
| Segmentation | Partial | Source, medium, campaign, creative, entry page, product/variant, device, location, new/returning browser |
| Paid acquisition economics | Separate later phase | Meta campaign/ad spend, manual fallback, cost/order, cost/delivered order, delivered ROAS, contribution after ads |
| Checkout abandonment and recovery | Session linkage only | Opens, input, attempts, failures, captured drafts, recovered orders, delivered recovery value |
| Customer retention | Missing | New/returning buyers, repeat purchase, time to second delivered purchase, realized value, monthly cohorts |
| Traffic quality | Missing | Engaged sessions, bounce rate, pages/session, active engagement duration |
| Health and alerts | Missing | Data freshness, order-match coverage, ingestion failures, spend/rollup status, checkout and conversion alerts |
| Export and reconciliation | Missing | Filtered CSV, metric definitions, paginated order drill-down |
| Settings and migration | Included | Handle-based snippet, readiness states, parallel verification, reversible source switch |

### Existing capabilities to reuse

- `server/index.js` already serves `/api/tracker.js`, `/api/live-visitor/ping`, `/api/live-visitors`, and `/api/order-analysis/website-behavior`.
- `server/businessReport.js` and `server/reports.js` provide reporting/date conventions. The Business Report classifier returns approved/cancelled/returned/pending; it must not be treated as a delivered classifier.
- `server/customerOutcomes.js` and `server/customerProfile.js` already distinguish delivered, partial delivery, returns, and customer history. Review their rules when building the analytics outcome adapter.
- `server/customers.js` contains phone-based customer grouping and basic lifecycle summaries. Its total order value is not automatically delivered customer value.
- `server/abandonedCheckouts.js` already accepts all five standard UTM fields and owns draft validation. Preserve existing capture/recovery behavior.
- `order_items` already exists with product/variant ownership and discount handling. Use authoritative item records, not parsed order text, for new product sales reports.
- The analytics route already retrieves Meta account spend and has currency handling. Reuse credentials and account selection; account totals alone cannot support campaign or creative ROAS.
- `server/orderAttribution.js` handles staff ownership of status changes. Do not overload it with marketing attribution.

## 3. Global constraints

- This is a single-merchant Mango Lover BD deployment. Resolve the fixed workspace server-side and preserve `org_id` on all user-data reads, writes, joins, and cache keys.
- Dashboard APIs require JWT validation and an admin role for the new Website analytics page. Campaign Links retains its own confirmed team-access rules; this plan does not widen or reduce those permissions.
- Public tracking endpoints are intentionally public, scoped by the assigned storefront handle and permitted origins. Legacy `org`/`org_id` is accepted only when it equals the fixed workspace.
- Frontend API calls use `apiFetch()`. Use React Router, existing shadcn controls, Phosphor light icons, Geist, warm backgrounds, and `৳`.
- Commerce prices, stock, orders, costs, refunds, and delivery outcomes are server-authoritative. Browser events never create sales or overwrite commerce values.
- Analytics must not reject a valid order, change stock, bypass Order Protection, or add courier/payment side effects.
- No new raw phone, name, address, email, IP, complete referrer URL, form value, or fingerprint fields in website analytics. Customer reports resolve identities server-side from existing commerce records.
- Sanitize paths and allowlist attribution parameters before persistence. Remove arbitrary query strings, fragments, tokens, and personal data. Persist structured failure categories rather than error text or form contents.
- Supabase migrations are additive, versioned, and never executed at startup. Inspect the actual schema before creating a migration. Run `verify:supabase-project` before linked commands and `verify:supabase-baseline` before proposing deployment.
- Analytics tables use RLS and explicit browser-role revocation. Service-only functions revoke execution from `PUBLIC`, `anon`, and `authenticated`. No direct browser commerce/analytics-table access.
- Use `supabase`, `supabase-postgres-best-practices`, and `plan-eng-review` before implementing the database/backend design. Review integration credentials with the applicable security workflow.
- Keep all new HTTP handlers in `server/index.js`; focused analytics modules own pure rules or standalone jobs.

## 4. Metric contract

### 4.1 Identity and sessions

- `ms_vid`: random first-party visitor UUID, up to one year. It identifies a browser, not a verified person. Blocked storage, deleted cookies, different browsers, and different devices create measurement gaps.
- `ms_sid`: random first-party session UUID. A session expires after 30 minutes without meaningful activity. Meaningful activity is navigation, a shopping action, or a throttled user interaction while visible.
- Heartbeats, focus, and visibility changes alone do not renew activity indefinitely. After expiry, the next real action creates a new session and fresh entry attribution.
- Cookies use `Secure`, `SameSite=Lax`, and `Path=/` in production on the canonical storefront host. Test local development explicitly.
- Tabs read the shared session state before sending. Backend inactivity checks remain authoritative; tab races must not multiply one action or revive an expired session.
- New versus returning browser uses first observed visit, not order count. Customer new/returning status comes from commerce records separately.
- Every logical event has a stable `event_id`. Transport retries reuse that ID. Enforce workspace/event uniqueness atomically before increasing counters.

### 4.2 Event and purchase contract

Persist these bounded event types:

| Event | Meaning and required evidence |
|---|---|
| `page_view` | Normalized path, page type, navigation ID; one view per actual navigation |
| `product_view` | Explicit product ID and optional variant ID displayed to the visitor |
| `add_to_cart` | Product/variant IDs and quantity added, after a successful cart action |
| `checkout_opened` | Checkout actually opens; includes checkout surface and anonymous checkout ID |
| `checkout_input_started` | First interaction with checkout details; no input values |
| `checkout_submitted` | Submission attempt with unique attempt ID |
| `checkout_failed` | Attempt ID and bounded category: validation, stock, protection, network, or server |
| `checkout_review_pending` | Order Protection held the submission; not a purchase or technical failure |

Orders and recovered orders are counted from committed commerce records. A browser `purchased` call or thank-you page is a diagnostic signal only. It cannot add revenue or duplicate a server purchase. Keep legacy tracker calls compatible during rollout.

Capture `checkout_surface` for the general order dialog, honey, honey-nut, and kalojira flows. Discover any newer checkout surface at implementation preflight and include it in the same contract.

Collect active engagement as monotonic, bounded session-summary updates, not one raw event per heartbeat. Flush on navigation, a shopping action, or page hide. Account for retries and avoid summing overlapping active time from multiple tabs. Passive presence remains Redis-only.

### 4.3 Counting and funnel definitions

- Visitors: distinct observed visitor IDs in the selected traffic cohort. Never sum daily or source-level distinct counts into a global unique total.
- Sessions: distinct session IDs whose start time is in the selected range. Count one converting session even if it creates two orders.
- Primary funnel: sessions that viewed a product, added to cart, opened checkout, created an order, or produced a delivered order. This is an open funnel; steps can be skipped.
- Provide direct-buy and cart-path breakdowns. A landing-page purchase must not be labeled a failed product-page/cart conversion.
- Session conversion rate = sessions with at least one accepted order / sessions. Delivered conversion uses sessions with at least one full or partial terminal delivery, with partials shown separately.
- Stage rates show both the all-session denominator and the previous eligible stage denominator. Do not imply a sequential funnel when events occurred out of order.
- Checkout abandonment = opened checkouts with no accepted order after 24 hours / eligible opened checkouts. More recent checkouts are provisional. Pending reviews are shown separately.
- Captured drafts are a narrower subset requiring existing capture eligibility; never label them all checkout starts.
- Recovered orders require an explicit draft-to-order link and recovery action after abandonment. Merely having an autosaved draft is not evidence of recovery.
- Engaged session = at least 10 seconds of measured active time, two pageviews, or an accepted order. Bounce rate = non-engaged sessions / sessions. This is our documented definition, not claimed parity with every vendor.
- Pages/session = pageviews / sessions. Average active engagement = measured active seconds / measurable sessions; report measurement coverage.

### 4.4 Date basis and comparison

Use Dhaka calendar days and half-open UTC intervals. The page defaults to the last 30 days including today; today and incomplete delivery cohorts carry provisional labels. Cap one request at 366 days.

Each view has a fixed, visible date basis:

1. **Traffic and conversion:** sessions started in the selected dates, plus their later attributed order outcomes. Daily series group by session start day.
2. **Acquisition economics:** credited marketing touch in the selected dates, plus the orders attributed to that touch. Spend uses the same campaign and touch-date range. Recent results mature as delivery completes.
3. **Customer retention:** month of first delivered purchase, followed by later delivered purchases.
4. **Order drill-down:** inherits the parent report's order set. A separate operational-order comparison is labeled order-created-date based and excluded from traffic conversion totals.

This separation is necessary. For example, a September 29 ad click followed by an October 2 direct visit and October 6 delivery belongs to September acquisition economics and October traffic conversion. Do not divide October-attributed revenue by September-unrelated spend.

Previous-period comparison uses an adjacent equal-length period. Previous-year comparison uses matching calendar dates, mapping February 29 to February 28. For today's partial day, compare through the same Dhaka time. Preserve identical filters and attribution models. A zero comparison denominator yields a null percentage change with the absolute change shown.

## 5. Attribution and Campaign Links

- Store each session's entry source separately from the marketing touch credited to an order.
- Preserve the first qualifying touch and latest non-direct touch within a rolling 30-day pre-order lookback. The default revenue model is last non-direct; first-touch is a comparison option. Credit each order once per model.
- A direct revisit does not replace a still-valid non-direct touch. A truly direct journey stays direct. Missing evidence stays unknown/unattributed.
- Preserve `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and `utm_term`. Add bounded campaign/ad IDs where available; labels can change while IDs remain stable.
- Classify source and medium independently. Facebook/Instagram traffic may be organic or paid. `fbclid` alone is not proof of paid advertising.
- Campaign Links are an additional dimension, not a replacement for source. A Facebook campaign link should still appear under Facebook traffic.
- Integrate validated campaign-click evidence if Campaign Links is installed. UTM slug text alone is not proof that a recorded campaign click exists.
- Freeze order attribution at successful submission. Review approval, courier updates, later direct visits, and staff edits cannot rewrite it. Held orders retain original submission evidence.
- Recovered abandoned checkouts keep a separate original-acquisition snapshot and recovery marker. Apply the 30-day window at actual conversion; expired evidence is not credited as a new paid conversion.
- Snapshot first/last touch metadata, credited touch time, model version, entry path, and confidence on the durable order analytics record. Session deletion must not destroy this record.
- Attribution is observed same-browser evidence, not guaranteed cross-device identity or proof of causation. Customer retention can still use server-side customer grouping without joining anonymous histories across devices.
- Campaign Links' click-date reports and Website's session-date reports may differ. Reconcile using the same order IDs, model, and date basis rather than demanding matching headline totals.

## 6. Financial and customer definitions

### 6.1 Delivery economics

Create an explicit outcome adapter with pending, approved, dispatched, delivered, partially delivered, cancelled, returned, and unresolved states. Reuse validated courier/customer rules without changing the Business Report's existing contract. Pending return requests are not completed returns.

| Metric | Definition |
|---|---|
| Placed merchandise value | Authoritative order-line value after discounts, excluding shipping and tax |
| Delivered merchandise value | Actual fulfilled merchandise value; full deliveries use net line values, partial deliveries require an actual amount |
| Refunds | Recorded merchandise refunds, not merely a return request or returned status |
| Net delivered merchandise value | Delivered merchandise value less recorded merchandise refunds, without double-subtracting a return adjustment |
| AOV | Placed merchandise value / accepted orders in the same cohort |
| Delivered AOV | Net delivered merchandise value / terminal delivered orders in the same cohort |
| Revenue/session | Net delivered merchandise value / sessions in the traffic cohort |
| Merchandise contribution | Net delivered merchandise value minus cost of fulfilled goods and recorded courier fees across the cohort, including RTO fees |
| Contribution after ads | Merchandise contribution minus matched ad spend |
| Cost/order | Matched spend / attributed accepted orders |
| Cost/delivered order | Matched spend / attributed terminal delivered orders |
| Delivered ROAS | Net delivered merchandise value / matched spend |

Show shipping charged, tax, and any payment/packaging costs separately when recorded. The contribution metric above excludes these and business overhead; label it as contribution, not net profit. A shipped or delivered order is not evidence that the courier remitted cash.

For new orders, preserve authoritative item price/discount and available unit-cost snapshots. Staff item changes need versioned adjustments, not silent changes to prior financial history. Legacy orders with missing historical costs show estimated contribution based on explicitly labeled current costs, or unavailable contribution; never imply historical precision.

Every financial response carries coverage: known/unknown cost, courier fee, partial-delivery value, refund completeness, currency conversion, and spend mapping. Missing values are not zeros. Known subtotals can be displayed, but an incomplete total must be labeled and must not produce an apparently complete ROAS/profit ranking.

At implementation preflight, map the authoritative partial-delivery and refund fields. Where no recording mechanism exists, add a small admin-only adjustment record linked to the order, with amount, currency, type, reason, actor, idempotency key, and reversal reference. Require an explicit recording-coverage start date; do not invent refunds or assume old orders had none. This is a reporting adjustment, not a new payment/refund execution system.

### 6.2 Meta and manual spend

- Reuse the connected Meta account and credential handling. Fetch paginated daily spend at ad level and aggregate upward; never sum account, campaign, and ad totals together.
- Store account/campaign/ad IDs, names, source currency, source timezone, date, converted BDT amount, conversion-rate provenance, and sync watermark.
- Use Meta hourly data where supported to align Dhaka reporting days. If only account-day data is available for a non-Dhaka account, label the date mismatch and disable same-day precision comparisons rather than inventing hourly allocations.
- Map stable ad/campaign IDs to UTM evidence. Support `utm_content` for creative labels. Unmapped spend remains visible in a separate row and stays in account spend totals.
- A spend row is allocated once. If several links share one ad, report spend/ROAS at the common ad or campaign level; do not copy the full spend onto each link.
- Supply admin-only manual daily spend entry/import for unavailable connections and small non-Meta campaigns. Record provenance and corrections; reject duplicate keys. An explicit manual override replaces a source row rather than adding to synced spend.
- Show acquisition cost for new delivered customers only where customer identity and attribution are available. Keep this distinct from cost per order.
- Meta API-reported conversions are a separate diagnostic metric. Merchant-Suite orders and delivery outcomes remain the revenue source.
- The first release uses one spend pipeline shared with Campaign Links. This deliberately brings forward the companion plan's postponed Meta phase; update both plans before implementation approval.

### 6.3 Retention

- Reuse normalized-phone grouping and explicit order links from existing customer features. Do not infer deduplication between inbox and regular orders from name, amount, or time.
- Label phone-based profiles honestly; shared or missing phones limit unique-customer accuracy.
- Show new and returning buyers, repeat delivered-purchase rate, median days to second delivered purchase, and realized delivered value per customer.
- A new delivered buyer has their first terminal delivered purchase in the selected period. Returning means an earlier terminal delivered purchase exists. Exclude cancelled-only customers from delivered retention.
- Build monthly first-delivered-purchase cohorts with month 0 through month 12. Cells show repeat buyers, repeat rate, and realized delivered value. Future/unobserved cells are blank, never zero.
- Reuse first acquisition snapshots to compare retention by source/campaign where known. Pre-tracking customers remain in an unattributed cohort.
- Call value-to-date realized value, not predicted lifetime value. Surface VIP, repeat, inactive, and high-return segments through the existing Customers experience with consistent definitions.
- Default to regular orders for financial aggregation. Include social orders only where authoritative amounts and explicit conversion/deduplication evidence exist; report excluded-channel coverage.

## 7. Storage, aggregation, and retention

These are proposed responsibilities, not executable migrations. Inspect existing tables before selecting exact alterations and generate migration names through the Supabase CLI.

| Data | Responsibility and retention |
|---|---|
| `analytics_events` | Validated raw shopping events, stable event IDs, workspace/session, server receive time, bounded client event time, product/variant and checkout references; 90 days |
| `analytics_sessions` | Compact session facts: visitor, start/end, entry attribution, device/location, engagement, stage timestamps, first-seen classification; 25 months |
| `analytics_session_pages` | Deduplicated per-session/path facts, entry marker, view count; 25 months |
| `analytics_session_products` | Per-session/product/variant views, cart additions, and quantity facts; 25 months |
| `analytics_order_facts` | One durable record per authoritative order, frozen attribution and financial snapshot references; retained with commerce records |
| `analytics_checkout_facts` | Anonymous checkout/attempt state, capture/recovery link, failure category and terminal result; 25 months |
| `analytics_spend_daily` | Canonical ad-level/manual spend facts and provenance; retained for historical economics |
| `analytics_daily_totals`, `analytics_daily_sources`, `analytics_daily_pages`, `analytics_daily_products` | Additive summaries with definition version and refresh watermark; retained indefinitely |
| `analytics_job_state`, `analytics_alerts` | Checkpoints, bounded job errors, active/resolved alert state, acknowledgement and cooldown |

The original 13-month session retention becomes 25 months to support a full prior-year comparison. This increases storage and must pass representative-volume testing. Raw events still expire after 90 days. No heartbeat rows are stored.

Keep exact distinct visitor/session calculations and combined filters on compact facts within 25 months. Daily summaries accelerate additive metrics; their visitor counts are not summed. For older periods, return supported additive totals and durable commerce economics, with explicit availability metadata for unsupported uniqueness or segmentation. The API must never silently substitute daily visitor sums.

Page, product, source, and device filters select session IDs first. Aggregate events and order facts independently before joining to avoid multiplying revenue when a session visited multiple pages or contained multiple items. Page/product rows are not generally additive for unique sessions.

Index workspace/time selectors, `(org_id, session_id)` joins, order/checkout links, and product filters used by real reports. Use workspace-aware foreign keys where possible. Enforce event uniqueness and transactional counter updates. Use decimal money types or integer minor units, never floating-point accumulated money.

Rollups use bounded database-side aggregation, job locks, checkpoints, and idempotent replacement/upsert. Rebuild a rolling seven-day window and record dirty older dates for late recovery, delivery, return, refund, or staff correction. Read current commerce outcomes or refreshed durable facts, not frozen yesterday-only delivery counts.

Implement backfill/catch-up after missed cron runs and bounded retention deletion. Preserve facts before deleting their source records. Deleting session detail cannot cascade into commerce order attribution. Test the plan against 25,000 events/day and a seasonal burst at 5 times that rate; these are synthetic sizing assumptions, not observed traffic.

## 8. Reports and user experience

One admin page, **Marketing > Website**, at `/marketing/website`, with six tabs using the same filter state:

1. **Overview:** visitors, sessions, pageviews, conversion, placed/delivered value, AOV, contribution, date comparisons, and trend charts.
2. **Acquisition:** source/medium/campaign/creative, first versus last non-direct attribution, Meta/manual spend, cost/order, delivered ROAS, and unmatched spend.
3. **Products and pages:** entry-page performance, viewed pages, product/variant conversion, quantities, and delivered product value. Product conversion requires the same product to be viewed and purchased; session-wide conversion is labeled separately.
4. **Checkout:** open funnel, direct-buy/cart paths, surface/device breakdown, failure categories, abandonment, captured drafts, recovery rate, and recovered delivered value.
5. **Retention:** new/returning buyers, repeat purchase, time to second purchase, realized value, monthly cohorts, and links to Customers.
6. **Data health:** freshness, matched-order coverage, unknown attribution, ingestion failures, spend sync, rollup lag, and actionable alerts.

Filter by date, source, medium, campaign/content, landing page, product/variant, device, approximate country/city, and new/returning browser where the view supports that dimension. Unsupported filters are disabled with an explanation, never silently ignored. Geo from visitor IP-derived headers is approximate and is not the shipping destination.

Every report includes metric definitions, date basis, last refresh, provisional state, and coverage. Use a side panel or existing order view for paginated underlying orders. Provide CSV with the same filters, dates, model, totals, and completeness labels; escape spreadsheet formula prefixes. Protect financial exports with the same server authorization as the UI.

Reuse chart/date-picker components already in the repo. Query keys include user, resolved permissions, view, filters, and attribution model; clear cached financial data on auth transitions. Use loading, retry, empty, partial-data, not-yet-instrumented, and stale states. Do not show zeros for an unavailable migration or failed ingestion.

Retain the existing Dashboard live visitor feature. Preserve `WebsiteBehaviorPanel` compatibility at its existing endpoint and add definitions/coverage without turning a URL visit into a purchase.

## 9. Data health and alert rules

Track accepted/dropped events, ingestion errors, last accepted event, rollup/spend success time, session-linked website orders, excluded/test traffic, and unknown attribution. Keep transient infrastructure counters outside the failed database write path so a database outage does not erase its own evidence.

Initial alert defaults are tunable product settings, not claims about existing traffic:

- Tracking interruption: no valid event for 30 minutes while Redis still reports human activity or new website orders exist. Quiet stores do not alert just because traffic is zero.
- Checkout errors: at least 20 attempts in 30 minutes and a technical failure rate of at least 10%. Protection rejections and review holds are separate business outcomes.
- Conversion deterioration: at least 100 sessions in the observation window and conversion down at least 40% against the same weekday/time baseline from four completed weeks. Before enough history exists, show insufficient history.
- Attribution deterioration: at least 20 new website orders and session-link coverage falls by 20 percentage points against its seven-day baseline.
- Job failure: missed expected rollup by two hours, or Meta spend not successfully refreshed for 24 hours.

Show active alerts as dashboard/page badges with evidence, timestamp, suggested inspection, acknowledgement, and resolved state. Deduplicate repeated alerts with a six-hour cooldown. Email/SMS delivery and scheduled digests are optional follow-up work; in-app monitoring is release-one scope.

## 10. Proposed module and file map

All new names below are proposed. Verify collisions before implementation.

| File | Responsibility |
|---|---|
| `server/websiteAnalyticsTracking.js` | Validate event payloads, normalize paths/source, session activity and bot/test rules |
| `server/websiteAnalyticsAttribution.js` | First/last touch selection, lookback, immutable order attribution and recovery rules |
| `server/websiteAnalyticsCommerce.js` | Outcome adapter, item-level financial calculations, coverage and retention definitions |
| `server/websiteAnalyticsReports.js` | Report request/response contracts, filters, date basis, comparisons and CSV projection |
| `server/websiteAnalyticsJobs.js` | Rollup/checkpoint/retention orchestration, reconciliation and health alerts |
| `server/websiteAnalyticsSpend.js` | Meta pagination, currency/timezone handling, mapping and manual spend reconciliation |
| `server/index.js` | Existing tracker/ping/panel integration; auth/admin report handlers; protected cron handlers |
| `server/abandonedCheckouts.js` | Optional analytics fields and explicit recovery linkage |
| `server/orderProtectionStore.js`, `server/orderProtectionPipeline.js` | Preserve original attribution through holds and approval retries |
| `src/pages/WebsiteAnalytics.tsx` | Page composition and URL filter state |
| `src/components/website-analytics/` | Six tab views, filters, definitions, completeness and drill-down components |
| `src/lib/websiteAnalytics.ts` | Typed API client and shared response types |
| `src/App.tsx`, `src/components/AppSidebar.tsx`, `src/components/DashboardLayout.tsx` | Admin route, Marketing navigation and breadcrumbs |
| `src/components/IntegrationSettings.tsx` | Handle-based snippet and instrumentation/readiness status |
| `supabase/migrations/`, `src/integrations/supabase/types.ts`, `vercel.json` | Reviewed schema, generated types, scheduled jobs |
| `src/test/websiteAnalytics*.test.*` | Domain, handler, job, compatibility and component tests |

Storefront files confirmed in the repository tree:

- `api/orders.ts`, `api/abandoned-carts.ts`, and `server/order-service.ts` forward optional analytics context.
- `client/src/components/order-dialog.tsx`.
- `client/src/features/sundarbans-honey/honey-checkout.tsx`.
- `client/src/features/honey-nut/honey-nut-checkout.tsx`.
- `client/src/features/kalojira-mixed/kalojira-checkout.tsx`.

Add a shared `client/src/lib/merchant-analytics.ts` wrapper for typed shopping events and checkout correlation. Discover the current product/cart renderers and local Express entry point in that repository before modifying them. Instrument behavior at successful actions, not by scraping button text or relying on URL regexes.

## 11. API and job contracts

Extend existing public tracking endpoints instead of introducing a second tracker. A valid event is acknowledged quickly; downstream analytics failures remain non-blocking. Rate limits and bounded payload validation still apply. Do not call browsers' tracking IDs proof of identity or authorization.

Proposed authenticated admin endpoints:

```text
GET  /api/analytics/website?view=overview|acquisition|products|checkout|retention&from=YYYY-MM-DD&to=YYYY-MM-DD
GET  /api/analytics/website/orders?view=...&from=...&to=...&cursor=...
GET  /api/analytics/website/export?view=...&from=...&to=...
GET  /api/analytics/website/health
POST /api/analytics/website/alerts/:id/acknowledge
POST /api/analytics/website/spend
POST /api/analytics/website/spend-mappings
POST /api/analytics/website/orders/:id/adjustments
```

Report requests also accept a bounded allowlist of filters, `compare=previous_period|previous_year|none`, and `attribution=last_non_direct|first_touch`. Reject unknown dimensions, malformed IDs, mixed date pairs, future dates, and ranges above 366 days with 400. Return 401 for missing auth, 403 for non-admin, and 503 with a stable readiness code when required schema is missing.

Responses contain `range`, `date_basis`, `filters`, `attribution_model`, `definitions_version`, `generated_at`, `coverage`, `availability`, `provisional`, and the requested view data. Financial cells have a nullable value and completeness status. Pagination uses stable cursors; exports use bounded reads and disclose truncation or fail explicitly rather than returning a partial file as complete.

Use `GET /api/internal/analytics-rollup` and `GET /api/internal/analytics-health`, protected by the existing cron-secret helper. A Meta sync job uses the same secret guard. Inspect the deployment's allowed scheduling frequency before adding cron entries. Daily rollup at `45 3 * * *` is acceptable; health evaluation should run at least every 15 minutes, or run on authenticated dashboard refresh until a scheduler with that cadence is available. Display the actual evaluation freshness.

## 12. Implementation sequence

For each code task: write the named behavioral cases first, run them to demonstrate the missing behavior, implement the smallest working change, rerun the focused suite, review the diff, and commit only that task's files. Start on a branch from main. Do not execute this sequence merely because this plan exists.

### Task 1: Reduce heartbeat capture and establish the baseline

**Files:** `server/index.js`, `src/test/liveVisitorTracking.test.ts`.

- [ ] Record current tracker, panel, checkout surfaces, ingestion volume, PostHog usage, and field/schema readiness. Confirm which costs and refunds are actually recorded.
- [ ] Add explicit pageview/heartbeat/step kinds while preserving Redis presence and legacy payload handling.
- [ ] Test that a heartbeat updates presence but never calls PostHog; a view and explicit step do; a legacy payload remains compatible.
- [ ] Keep old open tabs in mind: a five-minute script cache does not force already-open pages to reload. Measure legacy payload usage and document the compatibility sunset.
- [ ] Verify website-behavior definitions before claiming unchanged counts. Measure event-volume reduction rather than assuming a specific cost saving.

**Deliverable:** A small independently deployable cost-reduction change.

### Task 2: Lock metric contracts with executable fixtures

**Files:** new tracking/attribution/commerce/report modules and `src/test/websiteAnalyticsMetrics.test.ts`.

**Interfaces:** `normalizeAnalyticsEvent(input, context)`, `selectMarketingTouches(touches, effectiveAt)`, `classifyAnalyticsOutcome(order)`, `calculateAnalyticsMoney(order, items, adjustments)`, and `parseWebsiteAnalyticsRequest(query, now)`. Functions are pure; callers supply time, workspace, and source data.

- [ ] Cover two orders in one session, direct-buy skipping cart, multi-item orders, partial delivery, pending returns, refunds, null costs, and zero denominators.
- [ ] Cover September click/October purchase attribution, expiry, future touches, direct revisits, paid-versus-organic classification, and held-order approval after the lookback window.
- [ ] Implement explicit metric/coverage results, leaving existing Business Report behavior intact.

Example required fixture assertions:

```text
One session -> two accepted orders -> one fully delivered:
  sessions=1, orders=2, converting_sessions=1, delivered_sessions=1
  session_conversion_rate=1, delivered_session_conversion_rate=1

Partial delivery with no authoritative partial amount:
  partial_delivered_orders=1, delivered_value=null, value_complete=false

Same browser on Monday and Tuesday:
  Monday visitors=1, Tuesday visitors=1, whole-range visitors=1
```

### Task 3: Add durable storage and atomic ingestion

**Files:** reviewed migration, generated types, tracking module, `server/index.js`, `src/test/websiteAnalyticsIngestion.test.ts`.

**Interface:** service-only `recordAnalyticsEvent` operation accepts validated workspace-scoped events and updates compact facts only when the event insert is new.

- [ ] Inspect remote tables read-only, verify the project/baseline, and map existing orders/items/refunds/cost fields before authoring DDL.
- [ ] Add the facts, retention indexes, uniqueness, grants, and workspace constraints described in section 7. Keep migrations reversible without dropping commerce data.
- [ ] Test duplicate retries, concurrent first events, cross-workspace session IDs, unknown product IDs, oversized payloads, staff/bot exclusion, and revoked browser access in local Postgres.
- [ ] Integrate ingestion with bounded error reporting and a Redis-only heartbeat branch. Server timestamps control session eligibility; client timestamps are bounded evidence.
- [ ] Verify a failed analytics write does not change checkout availability or report a fabricated successful purchase.

### Task 4: Instrument the storefront and session lifecycle

**Files:** tracker in `server/index.js`; shared storefront wrapper, product/cart call sites and all checkout components; tracker and storefront tests.

**Interface:** `trackShoppingEvent(name, properties)` creates a stable event ID and sends only allowlisted anonymous data. Checkout context contains `sessionId`, `visitorId`, `checkoutId`, and `attemptId` where applicable.

- [ ] Test first visit, navigation, same-URL history changes, two tabs, 30-minute inactivity, cookie denial, return navigation, and bounded engagement flushing.
- [ ] Instrument product views/cart actions with product/variant IDs and quantities. Preserve legacy tracker calls without double-recording an event during transition.
- [ ] Test each checkout surface for opened/input/submitted/failed/review-pending outcomes. No form values or raw exception text may enter analytics.
- [ ] Exclude staff/test traffic through an explicit preview/test marker and server-side filtering; do not use merchant IP as a customer identity.

### Task 5: Connect accepted orders, recovery, reviews, and adjustments

**Files:** storefront API/local Express paths, `server/order-service.ts`; Merchant-Suite `server/index.js`, abandoned/protection modules, commerce module; order submission and analytics linkage tests.

**Interface:** `buildOrderAnalyticsFact(order, validatedContext, submittedAt)` produces one durable attribution record per committed order. Optional tracking context never becomes a required checkout field.

- [ ] Forward analytics context through both Vercel and local storefront paths before beginning any PostHog conversion comparison.
- [ ] Test cookie absent, malformed/unknown session, cross-workspace session, duplicate submit, failed order, stock failure, held approval/rejection, and explicit abandoned recovery.
- [ ] Preserve original submission attribution through holds; freeze successful order attribution and record recovery separately.
- [ ] Add financial snapshots and, only where existing recording is absent, the admin adjustment contract from section 6. Test reversal and retry idempotency.
- [ ] Reconcile authoritative orders against optional analytics facts in a retryable job. A post-commit analytics failure leaves an order marked temporarily unmatched; it never rolls back the accepted order or invents missing attribution.

### Task 6: Implement rollups, retention, and historical correctness

**Files:** jobs module, cron handlers, `vercel.json`, `src/test/websiteAnalyticsJobs.test.ts`, database fixtures.

**Interface:** `runWebsiteAnalyticsRollup({ orgId, now, cursor })` returns checkpoint, processed range, dirty dates remaining, and coverage. Batches are resumable and idempotent.

- [ ] Test cron auth, overlapping runs, missed days, late delivery/refund, stale checkpoints, retention boundaries, and reruns.
- [ ] Preserve exact distinct counts and combined-filter facts for 25 months. Preserve order attribution and retained additive history after session deletion.
- [ ] Verify before/after raw-event deletion produces identical supported reports. Unsupported older dimensions return availability metadata.
- [ ] Use representative seasonal data to inspect query plans and measure ingestion/report load. Do not assume Postgres capacity from row count alone.

### Task 7: Deliver Meta and manual acquisition economics

**Files:** spend module, `server/index.js`, reviewed spend migration, spend/mapping UI, `src/test/websiteAnalyticsSpend.test.ts`.

**Interfaces:** `normalizeSpendRow(row, account, conversion)`, `resolveSpendMapping(row, mappings)`, and `calculateAcquisitionEconomics(touches, orderFacts, spendRows)`.

- [ ] Reuse existing Meta token/account resolution; test pagination, expired access, retries, missing conversion rates, non-Dhaka account dates, and fresh/stale data.
- [ ] Test two links sharing one ad, campaign/ad overlapping mappings, unmapped spend, changed campaign labels, and manual override versus synced duplicates.
- [ ] Implement admin manual daily spend and explicit mapping controls; no arbitrary credential entry in the analytics page.
- [ ] Calculate first/last touch economics on matching touch-date cohorts. Suppress falsely precise profit/ROAS where required money or spend is unknown.
- [ ] Reconcile account spend to the sum of mapped and unmapped canonical rows and share that dataset with Campaign Links.

### Task 8: Implement reports, comparison, exports, and compatibility

**Files:** report/commerce modules, `server/index.js`, `src/lib/websiteAnalytics.ts`, `src/test/websiteAnalyticsReports.test.ts`, `src/test/websiteAnalyticsRoutes.test.ts`.

**Interface:** the request/response contract in section 11, shared by view, drill-down, and CSV endpoints.

- [ ] Test all six views' data contracts, previous-period/year comparisons, Dhaka boundaries, partial current day, leap day, and null percentage changes.
- [ ] Test combined product/source/device filters without multiplying order values; verify distinct counts across pages/sources/days.
- [ ] Build retention from authoritative delivered history, with unobserved cohort cells and identity/legacy coverage.
- [ ] Test route auth, role downgrade/cache separation, all workspace guards, pagination, CSV formula escaping, and export/drill-down reconciliation.
- [ ] Adapt `/api/order-analysis/website-behavior` with contract tests for `funnel`, `dropOff`, `productDemand`, and `trafficSources`. Purchase means server-backed order, not thank-you URL.

### Task 9: Build the six-tab merchant page

**Files:** Website analytics page/components/client, routing/sidebar/breadcrumbs/settings, `src/test/websiteAnalyticsPage.test.tsx`.

- [ ] Test filter persistence, comparisons, null/incomplete money, provisional cohorts, empty/stale states, unauthorized access, and order/CSV actions.
- [ ] Compose the views in section 8 with existing design patterns, responsive tables, accessible controls, and readable metric explanations.
- [ ] Keep unsupported filter combinations explicit. Display acquisition dates separately from traffic dates.
- [ ] Verify mobile, keyboard navigation, and all four checkout surfaces in browser QA across both repositories.

### Task 10: Add actionable health alerts

**Files:** jobs/report modules, protected health/acknowledgement handlers, health UI and tests.

- [ ] Test quiet-store suppression, minimum sample thresholds, cooldowns, missing baseline, acknowledgement, recovery, and stale evaluation timestamps.
- [ ] Expose session-match coverage and spend/financial completeness alongside headline numbers.
- [ ] Implement the rules in section 9 with in-app badges and actual scheduler capability. Do not promise 15-minute detection from a once-daily job.

### Task 11: Verify, compare, and retire PostHog

**Files:** existing PostHog helpers and tests, source-switch configuration, settings copy, operational documentation.

- [ ] Keep `ANALYTICS_SOURCE=posthog|first_party` with PostHog as the initial default. Enable first-party collection separately so collection does not depend on report selection.
- [ ] Deploy additive storage, ingestion, storefront instrumentation, and order forwarding before switching reports or starting the observation window.
- [ ] Run both for at least two weeks after complete instrumentation. Compare pageviews/sessions only after accounting for session and bot-filter differences. A persistent gap above 10% triggers investigation, not automatic rejection or automatic acceptance.
- [ ] Reconcile orders and money against commerce records. PostHog's URL-based purchase count is not the correctness reference.
- [ ] Pass section 13, then switch the default to first-party. Retain the rollback switch during the agreed observation period.
- [ ] Remove PostHog capture/query code, replace compatibility tests, remove unused secrets, and cancel the subscription only after explicit approval and verified first-party health.

## 13. Release acceptance gates

### Counting and business correctness

- [ ] Every checkout surface creates the correct event sequence, including direct-buy, failed submit, held review, retry, and recovery.
- [ ] Each accepted order appears once; two orders from one session do not create two converting sessions.
- [ ] Order totals, authoritative line values, cancellations, returns, and financial adjustments reconcile for the same order set. Missing data is visible.
- [ ] Full/partial delivery is separate from approval and courier settlement. Pending returns do not become completed returns.
- [ ] First-touch/last-non-direct attribution survives direct revisits, recovery rules, approval retries, and session retention.
- [ ] Meta spend sums reconcile with the source account; no duplicated allocation across links or levels. Unknown mappings and currencies remain explicit.
- [ ] Customer cohorts use delivered history and never treat an unobserved month as zero retention.
- [ ] Exports, drill-down, chart totals, and comparison cards agree under identical scope.

### Reliability and operation

- [ ] Automated unit, component, API, and database tests pass. Run `npm test`, `npm run lint`, and `npm run build`; run the storefront's discovered test/build commands separately.
- [ ] Migration readiness, browser-role revocation, service-only functions, and fixed-workspace guards pass local integration tests and review.
- [ ] Under representative load, target p95 warm 30-day report response below two seconds and a 366-day report below five seconds. Treat these as acceptance targets to measure, not existing performance claims.
- [ ] Tracking does not block navigation or checkout. Failed analytics storage leaves checkout outcomes intact.
- [ ] In fully instrumented synthetic journeys, all accepted orders link correctly. Production shows observed coverage and explains blockers instead of promising universal tracking.
- [ ] Alert rules, missed-job catch-up, currency failures, retries, and rollback work in controlled tests.
- [ ] Raw event deletion and session expiry preserve the supported historical reports and durable order attribution.
- [ ] At least two weeks of complete-instrumentation observation show no unresolved material counting or financial discrepancy.

Use `review`, `verification-before-completion`, and browser `qa` before shipping. Use `ship` for PRs and `land-and-deploy` when an approved release is merged.

## 14. Follow-up scope

These are useful additions after the baseline proves reliable:

- Search terms, zero-result searches, and search-to-purchase conversion where storefront search is used.
- Discount-code, recommendation, bundle, and upsell effectiveness beyond existing item/discount totals.
- Page-speed/Core Web Vitals correlation with mobile conversion.
- Additional native ad connectors for Google, TikTok, and other channels; manual spend already covers small campaigns in release one.
- Scheduled summaries and external alert delivery.
- Optional sampled replay/heatmaps with explicit data handling, advanced attribution, experiment reporting, or custom dashboards.

Inventory sell-through and days-of-stock reporting belong with the existing inventory/warehouse domain. Payment settlement belongs with courier/payment reconciliation. Link to those reports as they become available rather than making website analytics a second owner of their data.

## 15. Reference material

- [PostHog web analytics](https://posthog.com/docs/web-analytics)
- [PostHog product analytics](https://posthog.com/docs/product-analytics)
- [PostHog marketing analytics](https://posthog.com/docs/web-analytics/marketing-analytics)
- [Shopify behavior reports](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/behaviour-reports)
- [Shopify marketing reports](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/marketing-reports)
- [Shopify customer reports](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/customers-reports)
- [Customer profile design](../specs/2026-09-30-customer-profile-design.md)
- [Business Report implementation plan](2026-09-20-business-report.md)

These sources informed the feature comparison. This plan defines Mango Lover BD's own metric semantics; it does not promise identical numbers to vendors with different session, attribution, and order definitions.
