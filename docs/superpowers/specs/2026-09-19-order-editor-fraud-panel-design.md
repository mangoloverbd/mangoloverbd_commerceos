# Order Editor FraudShield Panel — Design

**Date:** 2026-09-19
**Status:** Approved
**Scope:** Surface full FraudShield customer risk data on every order editing surface, backed by a phone-keyed cache.

---

## 1. Problem

FraudShield is already integrated, but the order editing surfaces show almost none of it.

- `checkFraudStatus()` (`server/index.js:785`) calls `POST https://fraudshield.bd/api/customer/check` and then discards most of the response. It retains only `total_parcels`, `total_delivered`, `total_cancel`, `success_rate`, `fraud_risk`, and a flattened `apis{}`. It drops `reviews[]`, `fraudRiskScore.score`, `fraudRiskScore.label` (Bangla), `fraudRiskScore.breakdown`, per-courier `success_ratio`, and courier `logo`.
- The rich presentation exists only as a hover card in the orders table (`src/components/OrdersTable.tsx:238`, `FraudCell`).
- `src/components/order-editor/CustomerPanel.tsx:316` renders `<DetailField label="Fraud" value={order.fraud_data?.risk_level} />`. The stored object uses the key `fraud_risk`, never `risk_level`, so this field has always rendered `—`.
- `src/pages/NewOrder.tsx:293` offers a "Run fraud check" checkbox that fires the check *after* order creation. The operator never sees the result on that page.
- `src/pages/AbandonedDetail.tsx:259` passes `order={{}}` to `CustomerPanel`, so no fraud data is available at all.
- Nothing in the codebase calls `GET /api/usage/daily-limit`, so daily quota consumption is invisible.

At the target volume of **1200 orders/day**, per-order checking without deduplication would exceed any purchasable FraudShield tier. The documented Professional tier is 100 requests/day.

## 2. Approach

A phone-keyed read-through cache holding the **full raw FraudShield response**, warmed by a cron drain shortly after order ingest, and rendered by one shared panel component on all four order editing surfaces.

Rejected alternatives:

- **Order-scoped only, auto-fetch on editor open.** No repeat-customer deduplication, operators wait on first open, and `NewOrder`/`AbandonedDetail` cannot work because they have no order id. Cost model fails at 1200 orders/day.
- **Unified customer risk profile** blending FraudShield with internal order history into a house score. Genuinely better signal, but a separate product decision. It belongs on top of this work, not instead of it. Out of scope here.

## 3. Data model

New migration: `supabase/migrations/20260919000000_fraud_checks_cache.sql`

```sql
create table if not exists fraud_checks (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  phone         text not null,          -- normalized 11-digit, via normalizeBdPhone()
  status        text not null,          -- 'pending' | 'ok' | 'error'
  payload       jsonb,                  -- full raw /api/customer/check response
  summary       jsonb,                  -- derived shape, identical to today's orders.fraud_data
  error_message text,
  checked_at    timestamptz not null default now(),
  unique (org_id, phone)
);
create index if not exists fraud_checks_org_checked_at_idx
  on fraud_checks (org_id, checked_at desc);
```

One row per phone, upserted. No revision history — the current snapshot plus a manual re-check is sufficient.

`payload` is what unlocks reviews, the score breakdown, per-courier ratios, and logos.

`summary` preserves the exact shape written to `orders.fraud_data` today, so `OrdersTable.FraudCell`, `server/ai-actions.js:5304`, and the analytics text dump continue working unchanged.

`orders.fraud_data` and `orders.fraud_checked` keep being written on every check. No downstream consumer changes.

**Freshness window: 30 days**, as a named constant `FRAUD_CACHE_TTL_DAYS`. Courier history moves slowly and a manual re-check is always available; shorter windows spend requests without improving the decision.

**Error rows** cache with `status = 'error'` and a **1-hour** retry window (`FRAUD_ERROR_RETRY_HOURS`), so a transient FraudShield outage does not poison a phone for 30 days.

## 4. Server — cache service

New file `server/fraudShield.js`. Move `checkFraudStatus()` and `parseFraudShieldError()` out of `server/index.js` (~12k lines) into it, and widen `checkFraudStatus()` to return the full response body alongside the derived summary.

Exported functions:

- **`lookupCached(supabase, orgId, phone)`** — cache read only. Never issues a FraudShield request. Returns `{ status, payload, summary, checkedAt, stale }` or `null` when the phone has never been checked.
- **`checkPhone(supabase, orgId, phone, { force = false })`** — read-through. Returns the cached row when it is inside the freshness window and `force` is false. Otherwise calls FraudShield, upserts, and returns.
- **`getUsage(supabase, orgId)`** — proxies `GET /api/usage/daily-limit`, memoized for 5 minutes in `app_settings` under `{orgId}:fraudshield_usage_cache`.

**Double-call guard.** Before issuing a request, `checkPhone` upserts a row with `status = 'pending'`. A caller that observes a `pending` row younger than 60 seconds waits for it rather than issuing a second request. This prevents the cron drain and an operator's click from both paying for the same phone.

The API key continues to come from `process.env.FRAUDSHIELD_API_KEY`, never from `app_settings` and never from the client.

## 5. Server — endpoints

All new routes live in the Fraud domain section of `server/index.js`. Every one is guarded with `getToken(req)` → `getUser(token)` → `if (!user) return 401`, resolves `orgId` from `user_roles`, and filters `fraud_checks` by `org_id`. The phone is accepted from the client but normalized server-side with `normalizeBdPhone()` before use. No organization identifier is ever accepted from the client.

| Route | Spends quota | Purpose |
|---|---|---|
| `GET /api/fraud/lookup?phone=` | No | Cache-only read. Called by every editor page on load. |
| `POST /api/fraud/check` `{phone, force}` | Yes | The Check / Re-check button. |
| `GET /api/fraud/usage` | No (5-min cached) | Daily limit meter for Settings and for disabling the button at zero. |
| `GET /api/internal/fraud-warm` | Yes | Cron drain. |
| `POST /api/check-fraud` *(existing)* | Yes | Rerouted through `checkPhone`. |
| `POST /api/inbox-orders/check-fraud` *(existing)* | Yes | Rerouted through `checkPhone`. |

The GET/POST split is the load-bearing safety property: **opening an order editor can never consume a FraudShield request.** Only an explicit button press can.

The two existing routes keep their request and response contracts so `OrdersTable` and `InboxOrders` continue to work during and after the change.

## 6. Warming

`GET /api/internal/fraud-warm`, registered in `vercel.json` with schedule `*/5 * * * *`.

Each run:

1. Reads usage. If `remaining_today < 100`, return without draining.
2. Selects up to 40 orders created in the last 7 days, newest first, whose normalized phone has no fresh `fraud_checks` row. The work list is derived from `orders` against `fraud_checks` — no queue table. Distinct phones only, so one burst of repeat orders cannot fill a batch.
3. Calls `checkPhone` sequentially with ~400ms spacing (~16s total, inside the serverless function limit).

Capacity is ~480 phones/hour against an average of ~50 orders/hour, leaving substantial burst headroom.

**Vercel plan dependency.** Sub-daily cron schedules require Vercel Pro. On Hobby, the fallback is to warm inline inside `POST /api/fetch-shopify-orders` (already a long-running sync request) and rely on read-through plus the manual button elsewhere. Confirm the plan before implementation; the fallback is a configuration change, not a redesign.

## 7. Quota management

- A reserve of **100 requests/day** (`FRAUD_QUOTA_RESERVE`) is held back from the cron drain for interactive re-checks.
- Settings shows a meter: used today, remaining, and reset time, from `GET /api/fraud/usage`.
- A 429 from FraudShield surfaces as "Daily FraudShield limit reached — resets at {limit_resets_at}" and disables the Check button until reset.

Expected steady-state consumption at 1200 orders/day with a 20–40% repeat-customer rate is roughly 700–950 requests/day.

## 8. UI

New component: `src/components/order-editor/FraudPanel.tsx`, with `variant="full" | "compact"`.

Design language per `CLAUDE.md` §8: background `bg-[#FAFAF8]`, labels `text-[8px] font-medium tracking-[0.3em] text-black uppercase`, hero values `text-2xl font-light`, Phosphor Icons with `weight="light"`, `৳` for currency, borderless panels.

### Content (full variant)

- Risk pill — Safe / Caution / High risk, driven by `fraudRiskScore.level`, with the Bangla `fraudRiskScore.label` as subtitle and `fraudRiskScore.score` out of 100.
- Hero: success ratio. Below it, Total / Delivered / Cancelled counts.
- Per-courier rows: courier `logo`, `name`, `success_parcel/total_parcel`, `success_ratio`, and a thin progress bar. Only couriers present in the response are rendered.
- Score breakdown chips from `fraudRiskScore.breakdown`: success, reports, cancel, volume.
- Reviews — collapsible list of rating, comment, and date, with the reviewer phone masked (`018****0000`). Rendered only when `reviews` is present; the API omits the key entirely when there are none.
- Footer: relative "Checked N days ago" plus a Re-check button.

The compact variant renders the risk pill, success ratio, and counts, and expands to the full content on demand.

### States

1. **Not checked** — "Not checked yet" plus a Check button.
2. **Loading** — spinner.
3. **OK** — full content.
4. **New customer** — `summary.total_parcels === 0`: "New customer — no courier history".
5. **Error** — the parsed message plus Retry.
6. **Quota exhausted** — button disabled with the reset time as the reason.

### Placement

| Page | Change |
|---|---|
| `src/pages/OrderDetail.tsx` | Full variant inside `CustomerPanel`, after the "Last orders" block. Deletes the permanently blank `<DetailField label="Fraud" value={order.fraud_data?.risk_level} />` at `CustomerPanel.tsx:316` and the dead `risk_level` entries in the `CustomerOrder` type (`CustomerPanel.tsx:37`) and the `Order` type (`OrderDetail.tsx:42`). |
| `src/pages/NewOrder.tsx` | Compact variant under the phone input, with a debounced cache-only lookup on a valid 11-digit BD number. Removes the write-only "Run fraud check" checkbox and its `runFraudCheck` state, so the operator sees the risk *before* creating the order. |
| `src/pages/AbandonedDetail.tsx` | Pass the checkout's phone through to `CustomerPanel` so the panel resolves. |
| `src/pages/InboxOrders.tsx` | Full variant in the detail view, replacing the bare fraud check button. |

`OrdersTable.FraudCell` is left exactly as-is.

## 9. Error handling

`parseFraudShieldError` keeps its existing 502 / 504 / BdCourierService handling and gains:

- **400** — invalid phone. Surface plainly, do not schedule a retry.
- **401 / 403** — invalid or expired key. Point the operator at Settings.
- **429** — quota exhausted. Include `limit_resets_at` in the message.

Network failures and non-JSON responses continue to map to their current messages. All failures write `status = 'error'` with a 1-hour retry window.

## 10. Testing

- `server/fraudShield.js` unit tests: full payload retention; response with `reviews` absent; response with most per-courier keys absent; 400 / 401 / 429 / 502 / 503 shapes; freshness window honored; stale row triggers a call; `force` bypasses a fresh row; `pending` row younger than 60s suppresses a second call.
- Quota guard halts the cron drain at the reserve threshold.
- `FraudPanel` component tests covering all six states.
- Route tests: `GET /api/fraud/lookup` never calls FraudShield; `POST /api/fraud/check` does; both return 401 without auth; both filter `fraud_checks` by `org_id`.
- Regression: the `summary` object written to `orders.fraud_data` is shape-identical to today's, verified against the existing `FraudCell` rendering.

## 11. Out of scope

- Blending FraudShield data with internal order history into a combined house risk score.
- Auto-blocking, auto-cancelling, or gating confirmation on high-risk customers. The panel is informational in this phase.
- Mobile card surfaces (`MobileOrderCards`).
- Writing reviews back to FraudShield.

## 12. Open item

Confirm the purchasable FraudShield daily request ceiling and the Vercel plan tier before implementation. If the ceiling lands below ~1000/day, the cron drain narrows to a subset of orders (for example COD above a value threshold) — a change to the drain's selection query, not to the architecture.
