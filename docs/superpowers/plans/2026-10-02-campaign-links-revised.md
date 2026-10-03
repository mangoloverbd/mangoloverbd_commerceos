# Campaign Links with Delivered-Revenue Reporting: Revised Implementation Plan

> **For agentic workers:** Use the `executing-plans` skill to implement this plan task-by-task after approval. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create branded campaign links, attribute storefront purchases, and report clicks, captured checkouts, order outcomes, delivered revenue, and estimated profit for Mango Lover BD.

**Architecture:** Keep redirects and cookies in the dedicated storefront; keep attribution validation, persistence, and reporting in Merchant-Suite. Extend existing checkout, recovery, and Order Protection paths so campaign attribution follows the same purchase through its lifecycle. Use one explicitly defined reporting date basis.

**Tech Stack:** Existing React, React Router, TanStack Query, Express, Supabase/Postgres, Vercel serverless functions, Vitest, and storefront Node tests.

**Status:** Proposed replacement for comparison, not approval to implement or deploy. Repository code was inspected on 2026-10-02; the remote database was not inspected for this revision.

**Original:** [2026-10-02-campaign-links.md](2026-10-02-campaign-links.md).

**Reconciliation source:** [Confirmed original at GitHub commit `f81d61219d0fadc052406368309e1d1066cf0a0d`](https://github.com/mangoloverbd/mangoloverbd_commerceos/blob/f81d61219d0fadc052406368309e1d1066cf0a0d/docs/superpowers/plans/2026-10-02-campaign-links.md). The first draft of this revision used an older local original with admin-only access and no automatic UTM defaults. Those were stale assumptions, not intentional reversals. This revision preserves confirmed D4 (shared link management, admin-only costs/profit) and D8 (automatic fill-missing UTM tags in the first build). The local original may still predate that commit; use the pinned confirmed source for these decisions.

## Global constraints

- Follow each repository's `AGENTS.md`; use the fixed Mango Lover BD workspace and preserve `org_id` guards.
- Merchant-Suite frontend API calls use `apiFetch()`. Staff link routes validate JWT, resolve `user_roles`, and permit both admins and team members in the fixed workspace. Costs/profit are admin-only through server-side response projection; the later Meta ad picker remains admin-only.
- The public click route resolves the workspace from the assigned storefront handle. It is a deliberately public storefront integration, not an admin JWT endpoint.
- Browser clients have no direct campaign-table access. Supabase service-role credentials remain server-side.
- Keep routes in `server/index.js`, with pure campaign logic in the two originally proposed modules.
- Keep `source: "website"`; campaign attribution is separate from order source and landing-page attribution.
- Use existing shadcn components, Phosphor icons with `weight="light"`, Geist Sans, warm backgrounds, Framer Motion where needed, and `৳` amounts.
- Keep Phases A–D as the first release. Phase E remains the existing Meta-spend follow-up after 2–4 weeks of checked data.
- Automatic UTM defaults are part of the confirmed first-build scope. An interactive UTM builder/templates, link-organization tags/folders, QR generation, preview editor, exports, shared dashboards, affiliate system, A/B tests, new reporting modes, and new checkout-start tracking remain outside this revision.

---

## 1. Comparison with the original

| Area | Original | Revised proposal | Reason |
|---|---|---|---|
| Feature scope | Links, reports, storefront attribution; Meta spend later | Same | Correctness work, not a Dub feature expansion |
| Team access (confirmed D4) | Admins and team members can view, create, edit, and archive any workspace link; costs/profit admin-only | Same, enforced with role-aware server responses on every campaign surface | Restores the confirmed decision omitted by the stale local baseline |
| Automatic UTMs (confirmed D8) | Fill missing source/medium/campaign tags; incoming parameters win | Same, including fallback tagging and preservation of all incoming parameters | Restores first-build behavior while retaining redirect validation |
| Attribution | Last click, 30 days | Same, with explicit validation time and recovery rules | Holds and recovery must retain the correct evidence |
| Checkout metric | Abandoned checkouts + orders called “checkouts started” | Deduplicated **captured checkouts** | Existing capture requires a valid phone; it is not an opening event |
| Delivery classification | Reuse Business Report classifier | Reuse existing helpers with an explicit campaign outcome adapter | Business Report returns approved, not delivered |
| Partial delivery | Unspecified | Count terminal partial delivery but never assume full merchandise revenue | Prevent overstating COD collections |
| Reporting dates | Dhaka dates, unspecified event basis | Click-date groups with subsequent attributed outcomes | Keep conversion numerator and denominator connected |
| Profit | “Delivered profit” from current COGS | Same formula, explicitly estimated merchandise contribution | Current catalog costs are not historical cost snapshots |
| Unique visitors | Distinct daily IP/UA hashes | Label the same measure **estimated visitor-days** | Daily rotation cannot identify unique people over a month |
| Archive | Old links become 404/home redirects | Hide archived links from active management; preserve redirects | Published posts should retain their destinations |
| Slug editing | Lock after clicks, no concurrency rule | Lock after any recorded click, enforced atomically | A first click and rename must not race |
| Storefront wiring | Vercel functions and order service | Cover Vercel and local Express paths | They currently have separate validation/forwarding code |
| Tracking outage | Fall back to destination or home | Distinguish lookup failure from click-write failure | A logging failure should not discard a known destination |
| Meta spend | Ad/campaign mapping, unspecified overlap | Exclusive mapping and distinct spend accounting | Avoid charging the same spend more than once |

The D4 and D8 rows preserve confirmed decisions, not new proposals. Other behavior changes in this table remain correctness proposals to compare against the original.

## 2. Product rules for the same scope

### 2.0 Confirmed staff access and financial visibility (D4)

- Both `admin` and `team_member` roles may view, create, edit, archive, and unarchive **any link in the fixed workspace**, including links created by another member. Record `created_by` server-side as provenance, never as an ownership restriction.
- Both roles see link metadata, clicks, captured checkouts, orders/order values, outcomes, delivered revenue, and non-financial conversion/loss rates. No client-supplied role or workspace can widen access.
- Team responses must **omit**, not null out, `delivered_cogs`, `courier_fees`, `delivered_profit`, the revised alias `estimated_delivered_profit`, and Phase E `spend`, `roas_delivered`, and `profit_after_ads`. Also omit cost/fee coverage, cost-only missing-data reasons, margins, and any equivalent derived financial fields.
- Apply the pure `redactCampaignFinancials(report)` projection to every team-facing campaign response: list rows, detail, totals, unattributed comparison, daily series, nested recent-order data, metadata, and any create/edit response containing metrics. Build it from an explicit allowlist of team-visible fields; do not return raw joined rows or rely on hiding columns in React.
- Preserve delivered-revenue completeness explanations for both roles, such as an unknown partial-delivery amount. Separate those from admin-only COGS/fee/profit completeness metadata.
- Resolve role afresh server-side before choosing the response shape. Shared full reports must never bypass projection through a cache; staff responses are private/no-store. Frontend query identity and auth/role transitions must prevent a previously cached admin response appearing in a team session.
- In Phase E, the Meta ad picker and spend-mapping fields are admin-only. This exception does not restrict team editing of ordinary link metadata or archive actions.

### 2.1 Links and attribution

- Link format stays `https://www.mangolover.com.bd/go/<slug>`.
- Slugs use `^[a-z0-9]+(-[a-z0-9]+)*$`, length 3–60. Names are 1–120 characters.
- Channels stay `facebook`, `instagram`, `tiktok`, `youtube`, `whatsapp`, `influencer`, `print`, `sms`, `other`.
- The newest valid human campaign click available in the same browser wins. A direct visit does not clear attribution.
- The window is exactly `0 <= effectiveAt - clicked_at <= 30 * 24 * 60 * 60 * 1000` milliseconds. Reject future clicks, invalid timestamps, bots, missing clicks, and workspace mismatches.
- `effectiveAt` is generated server-side. It is the original submission time for a held order, and the actual conversion time for a staff-converted abandoned checkout. A draft captured inside the window does not extend that window indefinitely.
- Freeze attribution on a successfully created order. Later edits, status changes, or review retries never move it to another campaign.
- Existing social, phone, and independent manual orders remain outside scope. Staff recovery of an originally captured website checkout is included.
- Malformed/expired attribution or a campaign lookup outage must not reject a valid order or bypass Order Protection. Continue without new attribution and emit a bounded diagnostic without customer data.
- Archive is organizational: preserve slug, destination, click logging, and historical reporting. There is no new disable action in this release.

### 2.2 One reporting date basis

Use **click date** for attributed campaign reports. A click-date group means the non-bot clicks made during the selected Dhaka date range, plus the captured checkouts/orders attributed to those clicks.

1. Convert inclusive Dhaka dates into a half-open UTC interval, using the existing date helpers. Default to the Business Report's default range; bound requests to 366 days.
2. Select non-bot clicks in that interval and the chosen link scope.
3. Load attributed orders by those click IDs, regardless of their order creation or delivery dates. Eligibility was checked at intake; a held order can be approved after the window ends.
4. Derive current outcomes from those orders. Recent periods remain provisional as customers order and couriers complete deliveries.
5. Plot daily clicks and their attributed orders against **the click's Dhaka day**. Label the order series “Orders from these clicks,” not “Orders placed that day.”
6. Keep the original unattributed comparison row, but label it “Unattributed website orders placed in this period.” It has an order-created date basis and is excluded from campaign totals, funnel rates, and campaign ROAS.

Example: a September 29 click produces an October 2 order delivered October 6. Its campaign results belong to September 29. October's unattributed comparison includes only October orders with no campaign attribution.

This is one date basis, not a new report selector. Business Report remains order-created-date based. Compare shared value calculations on the same order IDs; do not assert that differently scoped headline totals must match.

### 2.3 Captured checkout counting

Keep the existing capture mechanism; name the metric honestly.

- Start with every persisted order attributed to the selected clicks. Each order proves at least one captured checkout, including when browser capture failed.
- Add each captured draft attributed to the selected clicks **only if no order in the workspace is linked to that draft**, including an order attributed to another click or no campaign.
- Check both `abandoned_checkout_id` and the durable `abandoned_draft_key_hash` for late-arriving/reconciled captures. Never deduplicate by phone or product name.
- Use the order's final attribution for a recovered checkout. A draft first linked to campaign A and subsequently ordered through campaign B must not remain a checkout for both campaigns.
- Count retained expired/dismissed capture records as historical captured checkouts. Keep their non-personal campaign IDs/timestamps through existing PII scrubbing.
- A protection hold is not an order. Before approval, it contributes a captured checkout only if an abandoned-checkout record exists; do not introduce another event stream.

Metric formulas:

```text
captured_checkouts = attributed orders + distinct unconverted captured drafts
click_to_order     = count(distinct campaign_click_id on selected orders) / clicks
order_to_delivered = terminal delivered order count / order count
loss_rate          = (terminal cancelled count + terminal returned count) / order count
```

Return `null`, displayed as “—”, for a zero denominator. A click can generate more than one order; `click_to_order` measures the share of clicks producing an order, not orders divided by clicks. Funnel counts therefore need not strictly decrease; do not clamp them to manufacture a funnel shape.

### 2.4 Outcomes and amounts

Use `customerOrderOutcome`/`customerReturnPending` from `server/customerOutcomes.js` for delivery/partial/return uncertainty, with a campaign adapter in `server/campaignReport.js`. Use the already-exported `classifyBusinessReportOutcome` for the approved-versus-pending distinction and its terminal-return aliases.

Adapter precedence:

1. Completed return (`return_status` is `returned`/`completed`) → `returned`.
2. Approval-pending return or delivery markers → unresolved; `confirmed` for an already-approved order, otherwise `pending`. Never recognize full delivery revenue from these markers.
3. Terminal cancellation/return from the existing helpers → `cancelled`/`returned`.
4. Terminal full or partial delivery → `delivered`, with `delivery_kind: full | partial`.
5. Business Report `approved` → `confirmed`; otherwise → `pending`.

The five outcome counts are mutually exclusive and sum to `orders`. Partial deliveries are identified in the existing detail outcome display; they are not silently valued as full deliveries.

- `order_value`: sum of merchandise `orders.price`, excluding `delivery_rate`, matching Business Report's monetary basis.
- `delivered_revenue`: merchandise value of fully delivered orders. For terminal partial deliveries, use an authoritative delivered-merchandise amount only if inspection confirms one exists and defines its semantics. Otherwise the affected link's revenue is `null`, with a partial-delivery explanation; never use the full order price or zero as its replacement.
- `delivered_cogs`: use the existing `computeOrderCogs` against current product costs. Feed quantities from `order_items` through `parseLineItems`-compatible input rather than losing quantities in recovered-order summary strings. Keep the original product summary as a legacy fallback.
- Missing/unmatched costs or unknown partial-delivery quantities make COGS/profit incomplete, not zero. Return coverage metadata from the existing cost helper.
- `courier_fees`: recorded courier fees on **all selected orders**, including returns/cancellations. A null fee is not a recorded zero; return recorded-fee coverage.
- Preserve the original formula: `estimated_delivered_profit = delivered_revenue - delivered_cogs - courier_fees`.
- UI label: **Estimated delivered profit**. Explain that this is merchandise contribution before ads, using current catalog costs and recorded courier fees. It excludes collected shipping income, packaging, overhead, and unrecorded adjustments. Do not call it settled cash, net profit, or historical accounting profit.
- When known data is insufficient to calculate revenue/COGS, return `null` for the dependent value and totals, with a reason. Missing courier fees retain a recorded-fees-only estimate with its coverage disclosed.
- Current cost edits can restate historical estimates. Historical cost snapshots and a new accounting system are not part of this revision.

### 2.5 Click quality and availability

- Persist bot flags, exclude bots from metrics/attribution, and never replace a human campaign cookie on a preview fetch.
- Test known preview agents separately from real Facebook/Instagram/WhatsApp in-app browsers. A social-app marker alone is not sufficient to classify a human as a bot.
- Keep the original daily hash concept, but use a domain-separated keyed HMAC with the existing server-only context secret and Dhaka day, IP, and bounded user agent. Store no raw IP in campaign tables. Do not modify unrelated Order Protection retention.
- Call distinct hashes **estimated visitor-days**. For totals, deduplicate hashes across links rather than summing per-link estimates. A missing trustworthy IP yields no hash, not one shared “unknown visitor.”
- Use existing signed client context for trustworthy forwarded IP/UA. Referrer host is a bounded, untrusted hint, not an authorization signal.
- Redirect lookup and click recording have separate error handling. Once a destination is known, a click-write failure returns `{ clickId: null, destinationPath, utm }`; the storefront still redirects there with the known defaults from §2.6.
- A total lookup outage/time-out falls back to `/`. This keeps navigation available but cannot guarantee the original landing page without additional infrastructure, which is outside this scope.

### 2.6 Confirmed automatic UTM tags (D8)

Merchant-Suite defines the defaults once in `buildCampaignUtm(link)`:

```js
{
  utm_source: link.channel,
  utm_medium: "campaign_link",
  utm_campaign: link.slug,
}
```

- The click endpoint returns `{ clickId, destinationPath, utm }` for a resolved link. Return the same defaults when click recording fails or a recognized bot receives `clickId: null`. Generating UTMs does not depend on issuing an attribution cookie.
- Both Vercel and Express redirects preserve **all incoming query parameters**, not only `utm_*`: this includes `fbclid`, Meta URL parameters, and hand-written campaign values.
- Use URL APIs and this precedence per key: **incoming URL > existing destination query > generated defaults**. Carry destination-only parameters and the destination fragment. Add each default only when the merged query does not already contain that key; never overwrite an incoming value or introduce a duplicate key.
- Presence is checked with `URLSearchParams.has`, so even an explicitly empty incoming value wins. For duplicate incoming keys, keep the first value deterministically and emit one occurrence; never replace it with a generated tag. Apply the same first-value rule to duplicate destination-only keys.
- If the upstream call fails before returning usable link metadata, preserve incoming parameters on the fallback URL and add **only** `utm_campaign=<locally validated slug>` if missing. Do not guess the channel or generate `utm_source`/`utm_medium`. An invalid slug redirects to `/` without a generated campaign tag.
- Incoming query parameters are data, never a source of redirect destinations. Validate the path/origin independently before merging; encode query values through URL APIs rather than concatenating a `Location` string.
- Existing landing-page attribution must continue normalizing paths independently of their query strings. Existing abandoned-checkout UTM capture continues receiving these tags without a new analytics feature or checkout event.

Required examples:

| Input / condition | Expected redirect query behavior |
|---|---|
| Facebook link `himsagar-reel`, no incoming query | `utm_source=facebook&utm_medium=campaign_link&utm_campaign=himsagar-reel` |
| `?utm_source=fb_ads&fbclid=abc` | Preserve both values; add only medium and campaign defaults |
| `?utm_source=custom&utm_medium=cpc&utm_campaign=launch&ad_id=42` | Preserve all four values; no default overwrites or duplicate keys |
| Destination has `utm_source=instagram&variant=large`; incoming has `utm_source=fb_ads` | Incoming source wins; destination-only variant survives; missing medium/campaign are added |
| Upstream timeout, valid slug, `?fbclid=abc` | Homepage fallback retains `fbclid=abc`, adds only `utm_campaign=himsagar-reel` |
| Upstream failure, incoming `utm_campaign=manual` | Preserve `manual`; do not add a second campaign tag |
| Link resolved but click insert failed | Known destination and all missing defaults still apply; no new cookie |

---

## 3. File map and implementation interfaces

### Merchant-Suite

| File | Responsibility |
|---|---|
| `supabase/migrations/` | One new additive campaign migration, CLI-generated name; service-role-only RPCs/constraints if needed for concurrency |
| `src/integrations/supabase/types.ts` | Regenerated types |
| `server/campaignLinks.js` (new) | Slug/channel/path validation, canonical UTM defaults, bot classification, attribution validation, visitor hashing |
| `server/campaignReport.js` (new) | Outcome adapter, checkout deduplication, click-date metrics, money completeness, team-safe response projection |
| `server/index.js` | Staff/public routes, server-side role resolution/redaction, paginated reads, intake/recovery/detail integration |
| `server/abandonedCheckouts.js` | Optional internal attribution input and preservation during capture/PII scrubbing |
| `server/risk/pipeline.js`, `server/orderProtectionStore.js` | Persist server-validated attribution with held reviews |
| `src/pages/CampaignLinks.tsx`, `src/pages/CampaignLinkDetail.tsx` (new) | Original list/detail pages |
| `src/components/campaign-links/CampaignLinkDialog.tsx` (new) | Original create/edit form |
| `src/hooks/useCampaignLinks.ts`, `src/lib/campaignLinks.ts` (new) | Query hooks, typed response contracts, form helpers |
| `src/App.tsx`, `src/components/AppSidebar.tsx`, `src/pages/OrderDetail.tsx` | Original route, navigation, and order chip |

Existing report, cost, date, and chart modules are reused. Do not change other dashboards' outcome definitions as part of this work.

### Dedicated storefront

| File | Responsibility |
|---|---|
| `vercel.json`, `api/go.ts` (new) | Production `/go/:slug` rewrite and handler |
| `server/campaign-links.ts` (new) | Shared redirect logic, destination validation, fill-missing UTM/query merge, cookie parsing/signing |
| `api/orders.ts`, `api/abandoned-carts.ts` | Production cookie-to-upstream forwarding |
| `server/routes.ts` | Equivalent local Express redirect, order, and capture behavior |
| `server/order-service.ts`, `server/abandoned-cart-service.ts` | Local service forwarding |
| Existing `server/client-context.ts` | Reuse signing contract; do not casually change its strict v1 schema |

Backend interfaces to implement:

```js
// Invalid normalization returns undefined; attribution returns {} when unusable.
normalizeCampaignSlug(value)
slugFromName(name)
normalizeCampaignChannel(value)
normalizeDestinationPath(value)
buildCampaignUtm(link)
// Returns { utm_source: link.channel, utm_medium: "campaign_link", utm_campaign: link.slug }.
isBotUserAgent(userAgent)
resolveCampaignAttribution({ click, orgId, effectiveAt })
// Returns campaign_link_id, campaign_click_id, campaign_attributed_at when valid.
buildCampaignVisitorHash({ ip, userAgent, dhakaDay, secret })
classifyCampaignOutcome(order)
// Returns { outcome, delivery_kind, amount_incomplete_reason }.
buildCampaignReport({ links, clicks, checkouts, orders, unattributedOrders, checkoutOrderLinks, orderItems, products, request })
// Returns { rows, totals, unattributed, daily, meta }.
redactCampaignFinancials(report)
// Returns a new team-safe response using the allowlist in §2.0; never mutates the full report.
```

`orders` contains orders attributed to the selected clicks. `unattributedOrders` contains website orders with no campaign attribution whose creation dates fall in the selected interval. `checkoutOrderLinks` contains workspace-wide draft-ID/hash linkage needed to exclude recovered captures, even when the linked order is outside the selected click group. Full admin `meta` includes `date_basis: "click"`, `as_of`, attribution-window days, cost/fee coverage, and missing-amount reasons. Team metadata retains date basis, `as_of`, attribution window, and revenue-completeness reasons but omits cost/fee/profit metadata. Never return visitor hashes or cookie signatures to the dashboard.

## 4. Phase A: additive database support

**Task A1. Inspect and implement storage without destructive reconciliation.**

- [ ] Invoke Supabase guidance; inspect actual columns, constraints, role privileges, retention routines, and canonical migrations before writing DDL. Run `npm run verify:supabase-project` before linked commands and `npm run verify:supabase-baseline` before proposing deployment.
- [ ] Generate the campaign migration using the installed CLI's documented migration command; do not preselect the original timestamp or apply archived migrations.
- [ ] Create `campaign_links` with the original fields. Bound `creator_name` to 120, `post_url` to 2048, and `notes` to 2000 characters. Validate `post_url` as HTTP(S); it is metadata, never a redirect destination. Validate the channel enum in the database too.
- [ ] Create `campaign_link_clicks` with the original fields plus an internal request UUID for idempotency. A repeated proxy request with the same workspace/request UUID returns its existing click; it must not attach it to another link.
- [ ] Add nullable `campaign_link_id`, `campaign_click_id`, and `campaign_attributed_at` to `orders`, `abandoned_checkouts`, and `order_protection_reviews`. The review columns are internal support for the existing held-order flow, not a new feature.
- [ ] Use composite references to ensure a click, its link, and each attributed row share the same `org_id` and link ID. Constrain the attribution triple to be either all null or complete. Avoid independent foreign keys that allow a valid click to be paired with the wrong link.
- [ ] Prevent campaign/link deletion from erasing history. Prefer restrictive references; there is no hard-delete endpoint. The 30-day attribution window is not a click-log retention policy. Preserve non-personal campaign linkage through existing draft/review scrubbing.
- [ ] Add named indexes for `(org_id, clicked_at, id)`, `(org_id, link_id, clicked_at, id)`, each referencing `(org_id, campaign_link_id, campaign_click_id)`, and `(org_id, campaign_click_id)` on orders/captures. Verify existing indexes for draft ID/hash reconciliation; add missing indexes rather than duplicates.
- [ ] Enable RLS on new tables, revoke `anon`/`authenticated` table privileges, explicitly grant required service-role access. Restrict any new RPC execution to service role; default `PUBLIC` execution must be revoked. Scope every RPC's reads/writes to its trusted server-resolved workspace.
- [ ] Make first-click insertion and slug rename acquire the same link-row lock in service-role-only database operations. The rename transaction rejects a changed slug if any click exists, including a bot click. No check-then-update race in Express.
- [ ] Regenerate types. Verify old unattributed inserts still work, mismatched workspace/link/click writes fail, anonymous reads fail, duplicate request IDs do not create extra clicks, and concurrent rename/first-click operations serialize correctly.

**Evidence:** local/test-database integration tests in `src/test/campaignLinksSchema.test.ts`, baseline verification, and a reviewed additive migration. Do not claim schema readiness from a regex-only migration test.

## 5. Phase B: Merchant-Suite backend

### Task B1. Implement validation and attribution primitives

**Files:** `server/campaignLinks.js`, `src/test/campaignLinks.test.ts`.

- [ ] Write boundary tests first, then implement the interfaces in §3.
- [ ] Implement `buildCampaignUtm(link)` as the sole Merchant-Suite naming source. Test every allowed channel, the fixed `campaign_link` medium, and the stored slug as campaign value. The storefront consumes this response rather than maintaining a second channel mapping.
- [ ] Canonicalize paths using a fixed storefront origin. Require a leading single slash, at most 200 characters, and the same parsed origin. Reject backslashes, control characters, protocol-relative URLs, malformed/encoded redirect tricks, and normalized `/go` or `/go/...` paths. Check after decoding/normalization so dot segments cannot conceal a loop. Preserve valid destination queries/fragments.
- [ ] Reject invalid dates and future clicks; apply the inclusive 30-day millisecond boundary. Validate the whole click/link/workspace association, not just UUID syntax.
- [ ] Implement daily keyed hashing and bot rules as in §2.5. Never log secrets, cookie values, or raw visitor data.

Concrete first test:

```ts
import { expect, it } from "vitest";
import { resolveCampaignAttribution } from "../../server/campaignLinks.js";

it("does not extend the window for a captured checkout", () => {
  const click = {
    id: "11111111-1111-4111-8111-111111111111",
    link_id: "22222222-2222-4222-8222-222222222222",
    org_id: "33333333-3333-4333-8333-333333333333",
    clicked_at: "2026-09-01T00:00:00.000Z",
    is_bot: false,
  };
  expect(resolveCampaignAttribution({
    click, orgId: click.org_id,
    effectiveAt: new Date("2026-10-01T00:00:00.001Z"),
  })).toEqual({});
});
```

Run `npm test -- src/test/campaignLinks.test.ts`; observe the new tests fail before implementation and pass after it.

### Task B2. Wire attribution through all existing purchase paths

**Files:** `server/index.js`, `server/abandonedCheckouts.js`, `server/risk/pipeline.js`, `server/orderProtectionStore.js`.

- [ ] Add route-level behavioral tests in `src/test/campaignAttributionIntegration.test.ts` covering normal submission, capture, conversion, holds, and reconciliation.
- [ ] For `handlePublicHandleOrderSubmit`, resolve optional attribution before risk assessment, bounded by a short tracking lookup timeout. Pass the result as a separate trusted server argument into risk/review storage, never a spread of browser-supplied attribution fields.
- [ ] Require verified storefront context for accepting new campaign attribution on the public order route. Missing attribution/context only removes marketing attribution; existing order-protection checks keep their own behavior.
- [ ] Extend the Suite's strict abandoned-capture allowlist for optional `campaignClickId`. Strip/ignore malformed marketing input before normal capture validation so a bad click ID cannot reject valid capture data. Keep the existing `campaign` UTM object separate.
- [ ] Persist a new valid click on an active draft only if its click timestamp is at least as recent as the saved one. Missing, invalid, or older input does not erase/replace a newer valid draft attribution. Serialize this comparison to handle reordered capture requests.
- [ ] At staff conversion (`/api/abandoned-checkouts/:id/convert`), revalidate the stored click against conversion time. Carry all attribution fields on the created order; outside the window create the order without attribution.
- [ ] At normal submission, prefer the current valid cookie click. Only when no current click ID was supplied may the matching draft's click be used as a fallback, revalidated at submission time. An explicitly expired newer click must not resurrect an older one.
- [ ] For risk holds, persist the validated attribution triple in the original review insert. At approval, carry the saved triple using its original server timestamp, including if approval happens after day 30. Do not read a current browser cookie or rewrite shadow-mode orders that already exist.
- [ ] Preserve `abandoned_checkout_id` on orders created by held-review approval when the review has that link. This enables the existing one-purchase reconciliation and campaign deduplication.
- [ ] Late capture/recovery reconciles linkage without changing an already-created order's campaign. Expiry/PII scrub routines preserve campaign IDs/timestamps needed for aggregate reports.
- [ ] Include a workspace-scoped `{ name, slug, channel }` campaign summary on the existing order-detail response. Both roles can follow the chip to campaign detail; use the existing order-detail permissions for order data and the §2.0 role projection for campaign metrics.

Run `npm test -- src/test/campaignAttributionIntegration.test.ts src/test/abandonedCheckouts.test.ts src/test/orderProtectionIntegration.test.ts src/test/orderProtectionReviewRoutes.test.ts`.

### Task B3. Implement the report contract

**Files:** `server/campaignReport.js`, `src/test/campaignReport.test.ts`.

- [ ] Write tests for the exact date, counting, outcome, money, and missing-data contracts in §2.
- [ ] Build pure functions using maps/sets keyed by IDs, including draft-ID/hash reconciliation and distinct converted click IDs. Normalize line-item quantities before calling the existing COGS helper; do not fuzzy-match an order summary when authoritative items exist.
- [ ] Compute each order's monetary contribution once, in integer poisha, and sum before formatting. Totals recompute ratios from aggregate numerators/denominators, never averages of link percentages.
- [ ] Propagate unknown revenue/COGS into dependent link/totals fields; return completeness reasons. A cost helper's partial known total is not complete COGS.
- [ ] Keep the unattributed comparison separate and do not assign synthetic clicks to it.
- [ ] Implement pure, non-mutating `redactCampaignFinancials(report)` with explicit allowlists for each response shape. Tests must traverse rows, totals, unattributed, daily, recent orders, and metadata; forbidden cost/profit fields and aliases are absent at every depth, while delivered revenue/outcomes remain. Confirm redacting a team response does not remove fields from the original admin report.

Required fixtures with exact expectations:

| Fixture | Expected |
|---|---|
| 10 human clicks, one creates two orders | 2 orders; click-to-order = 10%, not 20% |
| One draft recovered into one order | 1 captured checkout, not 2 |
| Draft A recovered into an order attributed to B | Only B receives the recovered checkout/order |
| Late capture linked only by durable draft hash | Still one captured checkout |
| September click, October order/delivery | Included in September click group, absent from October click group |
| Click on day 0, hold submitted day 29, approved day 31 | Attributed to original click; not expired on approval |
| Click day 0, draft captured day 29, staff conversion day 31 | Order unattributed; draft does not extend attribution |
| Confirmed order, no delivery confirmation | 0 delivered revenue from that order |
| Full delivery price 1000, COGS 400, fee 100; returned order fee 80 | Delivered revenue 1000; estimated delivered profit 420 |
| Same fixture, delivery charge 60 | Same merchandise-contribution result; shipping income excluded by definition |
| Terminal partial delivery with unknown delivered amount | Delivered count includes it; affected revenue/profit = null with reason |
| Missing COGS | Revenue remains usable; profit = null, not inflated |
| Null courier fee | Recorded-fees-only estimate with incomplete coverage, not a claim of zero fee |
| Same daily visitor hash clicks two links | Per-link visitor-days = 1 each, total visitor-days = 1 |
| Same report projected for a team member | Revenue/counts preserved; cost/profit fields, aliases, and private completeness metadata absent throughout |
| Redact a report then serialize the original for an admin | Original financial fields unchanged; no mutation or cache poisoning |

Run `npm test -- src/test/campaignReport.test.ts src/test/businessReport.test.ts src/test/cog.test.ts`.

### Task B4. Add routes and bounded data loading

**Files:** `server/index.js`, `src/test/campaignLinksRoutes.test.ts`.

| Route | Contract |
|---|---|
| `GET /api/campaign-links?from&to&include_archived` | Both workspace roles; role-projected list/report; range validated; default active links; totals use exactly the selected link scope |
| `POST /api/campaign-links` | Both workspace roles; allowlisted fields; server-set `created_by`; 400 validation, 409 slug conflict |
| `PATCH /api/campaign-links/:id` | Both roles can edit/archive/unarchive any workspace link; atomic slug lock; 404 for inaccessible IDs; Phase E financial mapping fields remain admin-only |
| `GET /api/campaign-links/:id?from&to` | Both workspace roles; role-projected metrics, click-day series, newest 50 attributed orders with `has_more`; archived links still have detail |
| `POST /api/public/v1/:handle/campaign-links/:slug/clicks` | Resolve destination; record one idempotent click; return `{ clickId, destinationPath, utm }` using `buildCampaignUtm`; unknown slug 404 with `/` fallback |

- [ ] Resolve membership/role server-side for every staff route. Return 401 for unauthenticated callers, 403 for callers without an allowed workspace role, and 404 for another workspace's link. Do not filter links by `created_by` or require admin for ordinary management.
- [ ] Add behavioral HTTP tests proving both roles can list/view/create links and edit/archive/unarchive another member's link. Test server-side financial omission on list/detail and any mutation response, including nested/totals metadata, admin field retention, role spoofing, workspace isolation, duplicate slugs, archive redirects, rename races, and malformed ranges.
- [ ] Accept only a server-generated request UUID from the proxy for click retry deduplication. Validate signed context before trusting visitor IP/UA; without it return the resolved destination and canonical `utm` defaults with `clickId: null`.
- [ ] Apply the existing shared public rate-limiting infrastructure. An invalid handle or malformed slug never creates a database row. Record recognized bot clicks with `is_bot: true` but return `clickId: null`, so the proxy cannot issue an attribution cookie for them.
- [ ] Load explicit fields with deterministic pagination. Traverse every Supabase page; test more than 1000 clicks and orders. Batch click-ID joins, scope every query by workspace, and retrieve linkage for captured drafts even if their orders lie outside the report range. Load the unattributed comparison separately using website source normalization, null campaign attribution, and the order-created date interval.
- [ ] Budget report data loading at 10 seconds. If a result cannot be completed, return a clear 503/retry response rather than a silently truncated successful report. Do not load every order/product in the workspace for each link row.
- [ ] On destination lookup success but click insertion failure, return the valid destination and `utm` defaults with a null click ID. Unknown lookup/timeout retains the documented homepage fallback and local slug-only tagging in §2.6. Test these response contracts, including bot responses.
- [ ] Project every staff response before serialization and keep it private/no-store. If server computation is cached, apply role projection after cache retrieval; never serve an admin payload directly to a team member. Use the original lightweight TanStack Query refresh model; no new realtime subscription.

Run `npm test -- src/test/campaignLinksRoutes.test.ts` and a local click-to-order request through the actual route handlers.

## 6. Phase C: the original Merchant-Suite UI

**Task C1. Build the existing list, dialog, detail, and chip scope.**

**Files:** the UI files in §3; `src/test/campaignLinksPage.test.tsx`, `src/test/campaignLinkDialog.test.tsx`, `src/test/campaignLinkDetail.test.tsx`.

- [ ] Show Marketing → Campaign Links after Reports to both admins and team members. Put both original routes inside the normal `ProtectedRoute` block, not `AdminRoute`. Use a Phosphor light icon rather than the original plan's conflicting custom-SVG instruction.
- [ ] Keep the original list summary, sortable table, copy action, date range picker, and empty state. Both roles can use create/edit/archive controls for any workspace link. Render cost/profit tiles, columns, tooltips, and cost-completeness explanations only when authorized fields are present in the API response; `useUserRole` assists layout but is not the security boundary. Add the explanatory labels required by §2: click-date basis, captured checkouts, visitor-days, and estimated profit.
- [ ] Keep the original form fields and live URL preview. Home, published-product destinations, and existing `/step/*` routes are selectable only when backed by actual available data. Do not assume the public product catalog contains a landing-page registry; use the existing custom-path field for any landing path not listed by a current API.
- [ ] Auto-suggest a slug from the name; use the same normalization vectors frontend/backend. For names with no ASCII slug characters, require a manually entered valid slug instead of silently saving an empty one.
- [ ] Respect slug-lock responses on the server even if the dialog was opened before the first click. Refetch after a conflict; invalidate both list and detail queries after successful edits.
- [ ] Keep the original funnel, daily chart, outcome breakdown, recent attributed orders, and archive/unarchive action. Use existing ECharts/theme patterns in `src/lib/businessReportCharts.ts`; do not introduce a new visualization dependency.
- [ ] For authorized fields, render unknown money as “—” with its reason; never coerce null to `৳0`. Omitted financial fields mean the entire financial UI is absent for team members, not an “unknown profit” placeholder. Mark partial delivery in the existing outcome display. Show the `as_of` timestamp and explain changing outcomes to both roles; cost-estimate explanations are admin-only.
- [ ] Distinguish empty results, loading, and request failure. Preserve date selection when navigating list/detail. Escape names/notes in chart tooltips using existing conventions.
- [ ] Show the original campaign chip on order detail and allow both roles to navigate to campaign detail.
- [ ] Include authenticated identity and resolved role in campaign query keys and clear campaign caches on sign-out/role change. Test an admin-to-team transition so previous admin financial values never flash while a team report loads.

Test form submission and editing/archiving another member's link for both roles, sidebar/direct-route access, cost/profit UI omission on team-safe payloads, admin null-money formatting, date-basis text, copy behavior, query invalidation, and role-transition cache clearing. Run `npm test -- src/test/campaignLinksPage.test.tsx src/test/campaignLinkDialog.test.tsx src/test/campaignLinkDetail.test.tsx`, then `npm run lint` and `npm run build`.

## 7. Phase D: storefront integration, production and local

**Task D1. Share redirect/cookie logic between Vercel and Express.**

- [ ] Read the storefront's `AGENTS.md` and open a separate branch. Add `/go/:slug` before the production SPA rewrite and the equivalent Express route before its catch-all.
- [ ] In `server/campaign-links.ts`, implement one shared redirect resolver called by both handlers. Generate a UUID per incoming navigation and reuse it for any upstream retry. Enforce a total two-second upstream deadline; abort requests on expiry.
- [ ] Send existing signed client context with the request. Forward only bounded referrer-host metadata; use platform-derived visitor IP through the existing signing helper, not arbitrary browser-supplied forwarding values.
- [ ] Independently validate the upstream destination with the same path contract before emitting `Location`. Implement §2.6 in the shared redirect helper: preserve all incoming parameters (`utm_*`, `fbclid`, Meta parameters, and other hand-written keys), merge destination-only values/fragment, then fill missing keys from the response's canonical `utm` defaults. Incoming values win over destination values and generated defaults; emit no duplicate keys. Do not construct redirects through string concatenation.
- [ ] On upstream lookup failure/timeout for a locally valid slug, preserve incoming parameters and add only a missing `utm_campaign=<slug>` on the fallback destination. Invalid slugs receive no generated campaign tag. When lookup succeeded but click logging failed, use the returned full defaults rather than degrading to slug-only tagging.
- [ ] Keep `ml_cclick` as the sole campaign cookie. Encode the click UUID and an HMAC signature under `STOREFRONT_CONTEXT_SECRET` with a `campaign-cookie-v1` purpose prefix. Backend still validates the referenced click/window; signing is an implementation correction, not a new tracking feature.
- [ ] Set `Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax` only after a valid human click. In local HTTP development only, omit `Secure`. Canonicalize apex/www before setting the host-only cookie so checkout uses the same host.
- [ ] Append campaign cookies to existing `Set-Cookie` values; never replace Order Protection device cookies. Bot requests, invalid slugs, unknown links, and tracking outages do not clear or refresh an existing campaign cookie.
- [ ] Set `Cache-Control: no-store` on every `/go` response, including fallback, bot, and error paths. Respond 302 for navigation; HEAD returns navigation headers without recording a click or setting attribution.

**Task D2. Forward attribution on every existing proxy path.**

- [ ] Implement `readCampaignClickCookie(req)` in the shared helper. Bound header parsing; verify the signature; invalid/duplicate/malformed cookies produce no campaign field and never a checkout validation error.
- [ ] Read attribution server-side after validating ordinary checkout input. Pass `campaignClickId` as an internal service option, not a user-editable checkout form field. Ignore any competing campaign ID in browser JSON.
- [ ] Update **both** production implementations (`api/orders.ts`, `api/abandoned-carts.ts`) and local implementations (`server/routes.ts`, `server/order-service.ts`, `server/abandoned-cart-service.ts`). Production `api/orders.ts` currently has its own validator and service logic; editing only the local zod schema is insufficient.
- [ ] The order proxies continue using `/api/public/v1/:handle/orders`. Capture continues through the existing authenticated `/api/custom-orders/abandoned-checkouts` route. Do not create a duplicate capture endpoint or alter its UTM object.
- [ ] Keep the existing checkout components and their payload requirements. Attribution works through the proxies without new browser event tracking.

**Tests:** add `api/go.test.ts`, `server/campaign-links.test.ts`, and `server/campaign-links-routes.test.ts`; extend `api/orders.test.ts`, `api/abandoned-carts.test.ts`, `server/order-service.test.ts`, and the existing local capture-service tests. Cover signature tampering, direct JSON injection, cookie coexistence, last click, archive, bots versus in-app browsers, timeout, no-store, unsafe upstream paths, and identical Express/Vercel forwarding. Test every UTM example in §2.6, duplicate/empty keys, destination fragments, preserved `fbclid`/Meta parameters, full defaults with click-write failure, and slug-only defaults with lookup failure. Add a regression test proving a UTM-tagged `/step/...` URL still produces the same normalized landing-page path.

Run in the storefront repository:

```bash
npx tsx --test api/go.test.ts api/orders.test.ts api/abandoned-carts.test.ts server/campaign-links.test.ts server/campaign-links-routes.test.ts server/order-service.test.ts
npm run check
npm run build
```

Use local injected clock/context fixtures for 30-day expiry and held-order approval; do not wait for real time or manufacture production orders for those cases.

## 8. Rollout and verification

Deployment order remains A → B → C → D. Backend accepts old storefront payloads throughout.

- [ ] Apply the reviewed additive migration after project/baseline checks. Confirm service-role API access and no browser-table access.
- [ ] Deploy backend; verify a normal unattributed order/capture still works and the new optional fields are tolerated.
- [ ] Deploy UI and create one internal test link to a real destination.
- [ ] Verify both workspace roles can manage another member's link. Inspect actual team JSON on list/detail to confirm financial keys and cost metadata are absent; verify admin JSON retains them. Confirm direct campaign routes work for team members.
- [ ] Deploy storefront. On a phone, open the link inside Facebook, then place one authorized test order. Check attribution and its single captured-checkout count.
- [ ] Verify bare campaign links receive all three UTM defaults; incoming campaign tags, `fbclid`, and Meta parameters survive unchanged; local failure fixtures receive only a missing slug-based campaign default. Recheck landing-page normalization with the tagged URL.
- [ ] Cancel that test order and check the outcome/rate update. Use local fixtures for full delivery, partial delivery, returns, staff recovery, delayed approval, and negative profit.
- [ ] Verify old published links continue redirecting when archived; unarchive restores list visibility. Confirm bot preview requests do not inflate human counts.
- [ ] Test report pagination beyond the default Supabase row limit and ensure a failed page never produces successful partial totals.
- [ ] Run Merchant-Suite `npm test`, `npm run lint`, `npm run build`; run the storefront checks above and all touched capture/route tests. `npm run build` in Merchant-Suite is Vite bundling, not a substitute for any separate TypeScript checks required by the repository at implementation time.
- [ ] Invoke `review`, `verification-before-completion`, and browser QA before the shipping workflow. Use separate PRs for the two repositories.

Rollback: roll back storefront attribution wiring first if necessary, then affected application releases. Leave additive schema/data in place; do not drop campaign tables or remove attribution from existing orders. The first-release report history begins at launch; no backfill.

## 9. Phase E: the existing Meta-spend follow-up

**Timing stays unchanged:** start after 2–4 weeks of verified attribution data, not in Phases A–D.

Keep the original optional Meta ad selection, ad/campaign spend retrieval, BDT conversion, caching, delivered ROAS, and profit-after-ads display for admins. Apply confirmed D4 throughout: team members retain ordinary link management and revenue/outcome reports, while `spend`, `roas_delivered`, `profit_after_ads`, and underlying cost/profit metadata are absent from their API responses. Reuse `convertMetaSpendToBdt` and the existing account-insights behavior; do not change Dashboard P&L semantics.

Corrections to apply when implementing this phase:

- One link maps either to one ad or to one whole Meta campaign. `meta_ad_id` and spend-scope `meta_campaign_id` are mutually exclusive; the latter is not merely the parent ID of an ad-scoped link.
- For a link shared across several ads, the existing optional Meta selection must allow selecting their whole campaign. Explain that this includes all campaign spend; it is accurate only when the campaign consistently uses that link.
- Enforce one owner per spend scope within the workspace, including archived links. Reject assigning the same ad/campaign twice, or a campaign alongside one of its constituent ads, with a 409 explanation. Perform ownership/overlap validation atomically using verified account/campaign relationships.
- Lock a spend mapping once the link has clicks. This avoids silently reassigning historical spend when there is no mapping-history feature. Let an existing unmapped link be connected once; mapping must be reviewed before saving.
- Place `GET /api/campaign-links/meta-ads` before `GET /api/campaign-links/:id` and enforce its confirmed admin-only guard server-side. Show the picker/connection prompt only to admins. Reject team attempts to set or clear `meta_ad_id`/`meta_campaign_id`, including mixed PATCH payloads, before any write; ordinary link edits and archive actions remain available. Use existing org-scoped credentials; paginate Meta results and verify selected IDs belong to the connected account.
- Fetch spend for the report's selected click-date interval using an explicit Meta account-timezone check. When its reporting day differs from Dhaka and cannot be aligned, mark spend comparison unavailable with a reason rather than mixing boundaries silently.
- Cache by workspace, account, currency/conversion settings, date interval, level, and selected IDs. An API failure is unknown spend, never zero.
- Sum each spend scope once. Unmapped/failed rows show “—”; totals with missing required spend remain incomplete rather than silently claiming total profit after ads.
- `roas_delivered = delivered_revenue / spend` only when revenue and spend are known and spend is positive. Zero spend yields undefined ROAS (“—”); known zero spend still permits a profit-after-ads calculation.
- `profit_after_ads = estimated_delivered_profit - spend`; retain the estimate/missing-cost qualifications from Phase B.
- Explain that click attribution excludes untracked/view-through/Messenger purchases and is not a causal measure of advertising lift. Do not claim the true return must be higher or that Ads Manager always counts every order; Meta reporting depends on event configuration and attribution settings.

Required tests: duplicate/overlapping spend mapping, first mapping after clicks, locked reassignment, archived-scope collision, Graph pagination, account mismatch, timezone mismatch, BDT conversion, cache-key separation, zero/unknown spend, partial delivery, incomplete COGS, and unchanged Dashboard account-level behavior. Also test admin-only picker access, team financial-field omission at every response level, forbidden team mapping writes without partial mutation, continued team metadata/archive access, and no admin financial cache leakage to team responses.

Google/TikTok spend, automatic budget changes, inbox attribution, and sending delivered outcomes to Meta remain outside this phase, exactly as in the original scope.

## 10. Comparison verdict

This revision keeps the confirmed original product surface and phased rollout, including shared link management with server-side financial redaction (D4) and automatic fill-missing UTM tags in the first build (D8). The additional work is internal support for accurate attribution, trustworthy counting, and failure-safe integration.

The main tradeoffs are explicit: reports follow click dates rather than order dates; “checkouts” means captured checkouts; current-cost profit is an estimate; partial-delivery revenue can be unavailable; archived links continue to work. Those are the decisions to compare before choosing this revision over the original.
