# Telesales / User Performance Report Design

**Status:** Draft — pending user review (2026-09-18)

## Goal

Track which staff member created, was assigned, confirmed, or cancelled every order, and report per-staff performance over daily / weekly / monthly / custom date ranges.

Today the system records *what* happened to an order but never *who* did it. `public.orders` has no user columns at all, and `orders.status` is a single mutable field with no history. Nothing about staff performance can be reconstructed retroactively — every day before Phase 1 ships is a day of permanently lost data.

## Scope

**In scope**
- Staff attribution on `public.orders` and `public.social_inbox_orders`
- A new `telesales` order source
- Staff display names
- A telesales-staff selector on the New Order form
- A Staff Performance report page

**Out of scope (Feature A, a later spec)**
- The admin Business Report (today's intake, by-source breakdown, approved/cancelled totals, courier charge). It consumes the same attribution layer but ships separately.

**Decided against (2026-09-18)**
- Assigning a staff member to a storefront or Shopify order after it arrives. Those orders stay unassigned permanently. Confirmation Rate measures manually created work only. The schema still supports it if this is revisited.

## Agreed decisions

| Question | Decision |
|---|---|
| How is a telesales order identified? | New canonical order source `telesales` |
| Does a courier-driven cancel count against a staff member? | No. `cancelled_by` is human clicks only; courier returns/RTO are reported as their own metrics |
| kg vs litre | Everything reported in kg. No unit field is added |
| Where do the reports live? | Two new sidebar pages. This spec builds the Staff one |
| Pre-launch orders | Attribution starts at launch. Older orders show `—` and are excluded from staff metrics |
| Social inbox orders | Covered, but shown as a separate group in the UI |
| How is `assigned_to` set? | On the New Order form at creation time, defaulting to the logged-in user |

## Phases

Phase 1 ships invisibly and starts collecting data immediately. Phase 2 reads it. Ship Phase 1 first and don't wait on Phase 2.

---

# Phase 1 — Attribution foundation

## 1.1 Schema

**Migration:** `supabase/migrations/<ts>_staff_attribution.sql`

Added to **both** `public.orders` and `public.social_inbox_orders`:

```sql
add column if not exists created_by   uuid references auth.users(id),
add column if not exists assigned_to  uuid references auth.users(id),
add column if not exists confirmed_by uuid references auth.users(id),
add column if not exists confirmed_at timestamptz,
add column if not exists cancelled_by uuid references auth.users(id),
add column if not exists cancelled_at timestamptz;
```

All nullable. No backfill — a blank column is honest, a fabricated one is not.

Indexes for the report's access pattern (org + staff + time):

```sql
create index if not exists orders_org_confirmed_by_idx
  on public.orders (org_id, confirmed_by, confirmed_at desc)
  where confirmed_by is not null;
create index if not exists orders_org_assigned_to_idx
  on public.orders (org_id, assigned_to, created_at desc)
  where assigned_to is not null;
```

Mirror both on `social_inbox_orders`.

**New table `public.order_status_events`** — append-only:

```sql
create table if not exists public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  order_id uuid not null,
  order_table text not null check (order_table in ('orders', 'social_inbox_orders')),
  from_status text,
  to_status text not null,
  actor_id uuid references auth.users(id),
  actor_kind text not null check (actor_kind in ('user', 'courier_webhook', 'system')),
  created_at timestamptz not null default now()
);

create index if not exists order_status_events_org_order_idx
  on public.order_status_events (org_id, order_table, order_id, created_at);
create index if not exists order_status_events_org_actor_idx
  on public.order_status_events (org_id, actor_id, created_at desc)
  where actor_id is not null;
```

RLS enabled, matching the pattern used by the other tables in the canonical migration.

**Why both columns and an event log.** The columns answer "who confirmed this order" in one indexed read, which is what the report needs. The log exists for two reasons the columns can't cover:

1. The Steadfast webhook sets `status = "confirmed"` when a parcel is delivered (`server/index.js:7946`). Any attempt to derive the confirmer from the status column would be silently rewritten by every delivery.
2. An order can be confirmed → cancelled → re-confirmed, possibly by different people. A single column keeps only the last writer; the log keeps the sequence.

**`user_roles.display_name`:**

```sql
alter table public.user_roles add column if not exists display_name text;
```

Staff currently have no name anywhere in the system — the only identifier is the Supabase auth email. Without this, the New Order dropdown and every report row read `salesman1@gmail.com`. Falls back to the email when null.

## 1.2 New order source `telesales`

- `server/index.js:743` — add `"telesales"` to `ORDER_SOURCE_VALUES`
- `src/lib/orderSource.ts:1` — add `{ value: "telesales", label: "Telesales" }` to `ORDER_SOURCE_OPTIONS`

`normalizeOrderSource` needs no remapping: unknown legacy values already fall through to `manual_other`, and no existing value should become `telesales`.

→ verify: `npm test` — a case asserting `normalizeOrderSource("telesales") === "telesales"` and that existing sources are unchanged.

## 1.3 Staff roster endpoint

`GET /api/team-members` is admin-only (`requireAdmin`, `server/index.js:1234`). A telesales team member filling the New Order form cannot call it.

**New `GET /api/staff`** — any authenticated member of the org. Returns only what the dropdown needs:

```json
{ "staff": [{ "user_id": "...", "display_name": "Rakib" }] }
```

No emails, no roles, no `created_at`. Standard guard: `getToken` → `getUser` → 401 → `getUserOrg` → filter by `org_id`.

## 1.4 Write path

**`POST /api/orders` (`server/index.js:7158`)**
- Stamp `created_by = user.id`
- Accept `assigned_to` from the body. Validate it is a `user_roles` row in this org — reject with 400 otherwise. Never trust the client's id blindly.
- Default `assigned_to` to `user.id` when omitted
- When the order is created directly as approved (the existing `#direct-approved` flow), also stamp `confirmed_by = user.id` and `confirmed_at = now()`, and write a `pending → approved` event
- Write a creation event: `from_status = null`, `to_status = <initial status>`, `actor_kind = 'user'`

**`PATCH /api/orders/:id` (`server/index.js:7253`)**

This is the single choke point for status changes from the UI, and `user` is already in scope. On a transition where the normalized status actually changes:

- Write an `order_status_events` row with `actor_kind = 'user'`
- Entering approved/confirmed → set `confirmed_by`, `confirmed_at`
- Entering cancelled → set `cancelled_by`, `cancelled_at`
- Re-entering approved after a cancel → overwrite `confirmed_by`/`confirmed_at`, and clear `cancelled_by`/`cancelled_at` (the order is no longer cancelled; the log retains the history)

**Steadfast webhook (`server/index.js:7899`)**

Writes an event row with `actor_id = null`, `actor_kind = 'courier_webhook'`. **Never writes `confirmed_by`, `confirmed_at`, `cancelled_by`, or `cancelled_at`.** This is the rule that keeps delivery from corrupting attribution, and it needs a regression test.

**Inbox order paths** — the same treatment for the `social_inbox_orders` mutation routes (`server/index.js:7707`, `7726`, `8943`).

**Extraction:** the stamping logic goes in a new `server/orderAttribution.js` as pure functions (`buildAttributionPatch(fromStatus, toStatus, actorId)` → patch object, and `buildStatusEvent(...)`), called from the routes. `server/index.js` is already 12,955 lines; this keeps the logic unit-testable without loading Express.

## 1.5 New Order form

`src/pages/NewOrder.tsx` gains a **Telesales Staff** field next to the existing Order source select (`src/pages/NewOrder.tsx:258`).

- Always visible, defaults to the logged-in user
- Options from `GET /api/staff`, via TanStack Query
- Submitted as `assigned_to`
- Follows the design language in CLAUDE.md §8: `text-[10px] font-medium uppercase tracking-[0.16em]` label matching the adjacent source field

## 1.6 Team Management

`src/components/TeamManagement.tsx` gains an editable **Name** field per member, persisted to `user_roles.display_name` through a new `PATCH /api/team-members/:id` (admin-only). Members without a name display their email.

## Phase 1 success criteria

1. Migration applies cleanly to the canonical project with no data loss → verify: `npm run verify:supabase-baseline`
2. Creating an order stores `created_by` and `assigned_to` → verify: route test asserting both columns
3. Approving an order stores `confirmed_by` + `confirmed_at` and appends one event → verify: unit test on `buildAttributionPatch` + route test
4. A Steadfast `delivered` webhook leaves `confirmed_by` untouched and appends a `courier_webhook` event → verify: regression test, the highest-value test in this phase
5. A non-admin team member can load the staff dropdown → verify: route test calling `/api/staff` with a `team_member` token
6. `assigned_to` pointing at a user outside the org is rejected with 400 → verify: route test
7. Build and lint clean → verify: `npm run build && npm run lint`

---

# Phase 2 — Staff Performance report

## 2.1 API

`GET /api/reports/staff?from=YYYY-MM-DD&to=YYYY-MM-DD&users=<id,id>`

- Auth: standard guard, org-filtered
- `users` omitted → all staff
- Day boundaries in Asia/Dhaka, reusing `toDayKey` from `server/overview.js:4`
- Admin sees all staff; a `team_member` sees only their own row

**New module `server/reports.js`** — a pure `buildStaffReport(orders, inboxOrders, orderItems, products, staff, { since, until })` plus a thin route in `index.js`. Same shape as the existing `server/overview.js`, and unit-testable without a database.

## 2.2 Metrics per staff member

Grouped exactly as the requirement lists them:

| Metric | Derivation |
|---|---|
| Assigned orders | `assigned_to = user`, created in range |
| Confirmed count (total) | `confirmed_by = user`, `confirmed_at` in range |
| Confirmed count (of assigned) | the above, also `assigned_to = user` |
| Confirmed value | Σ `price` of confirmed-total orders |
| Confirmed kg | Σ `weight_kg` of confirmed-total orders |
| Confirmation rate | confirmed-of-assigned ÷ assigned |
| Average order value | confirmed value ÷ confirmed count (total) |
| Cancelled count | `cancelled_by = user`, `cancelled_at` in range |
| Cancelled value | Σ `price` of those orders |
| Cancellation rate | cancelled-of-assigned ÷ assigned |
| Per-product packs + kg | Σ `order_items.quantity`, and Σ `quantity × products.weight_kg` |
| Telesales confirmed count / value / kg | The above, filtered to `source = 'telesales'` |
| Delivered count + value | Confirmed-by-user orders whose courier status is delivered/partial_delivered |
| Return / RTO count + value | Confirmed-by-user orders whose courier status is a return |
| Delivered rate | delivered ÷ confirmed |

**Rulings on ambiguous terms**
- "Pack" = sum of `order_items.quantity`
- Order-level kg = `orders.weight_kg`, already auto-computed by `resolveOrderRouting` at creation
- Per-product kg = `order_items.quantity × products.weight_kg`
- "Value" = `orders.price`, which is merchandise total after discount and excludes delivery charge (see the discount handling at `server/index.js:7288`). Courier charge is reported separately in the Business Report, not folded into staff value
- Delivered and Return/RTO are credited to `confirmed_by`, not to the courier
- Rates return `null`, not `0`, when the denominator is zero, so the UI can render `—` instead of a misleading `0%`

**Rates are computed over assigned orders only — decided 2026-09-18.** Storefront and Shopify orders arrive with `assigned_to = null` and are deliberately never assigned. Only orders created by hand through the New Order form carry a staff name.

The report therefore shows **three** counts rather than a single misleading ratio:
- `assigned` — orders assigned to them (manually created orders)
- `confirmed_assigned` — confirmations among their assigned orders
- `confirmed_total` — all their confirmations, including unassigned storefront orders they picked up

Confirmation rate = `confirmed_assigned ÷ assigned`. Cancellation rate = `cancelled_assigned ÷ assigned`. Both are therefore always a real ratio between 0 and 1.

`confirmed_total` sits beside the rate so work on unassigned storefront orders stays visible instead of either distorting the rate or vanishing from the report.

**Ruling on non-telesales manual orders.** The staff dropdown is on the New Order form, so it applies to every manually created order regardless of source — Facebook, WhatsApp, Phone, Manual/Other all get an `assigned_to` too, at no extra cost. Telesales is reported both inside these totals and as its own filtered column group (`source = 'telesales'`). Cost if this reading is wrong: the rate denominator is slightly wider than intended, fixable by adding one `source` filter in `buildStaffReport` with no schema or UI change.

## 2.3 Page

New route `/reports/staff` in `src/App.tsx` (React Router v6), inside `ProtectedRoute` → `DashboardLayout`.

**Sidebar:** a new collapsible `Reports` section in `src/components/AppSidebar.tsx`, added as a fourth `NavSection` alongside the existing `Intelligence` and `Social Inbox` groups. It holds `Staff Performance` now and gains `Business Report` when Feature A ships.

**Visibility (decided 2026-09-18):** the page is open to every authenticated member, but a `team_member` receives only their own row from the API. Admins see all staff. The filter is enforced server-side in the route, not in the UI — a team member editing the request cannot widen it.

- Date range: reuse `src/components/DateRangePicker.tsx`, which already has Today / Last 7 / Last 30 / This Month presets and Dhaka-correct boundaries. Add **This Week** and **Last Month** presets to cover the daily/weekly/monthly requirement.
- Staff selector: multi-select, defaults to all
- One row per staff member, columns grouped under Assigned · Confirmed · Cancelled · Delivered headers
- Per-product packs/kg in an expandable row — too wide for the main table
- Storefront and inbox orders shown as separate row groups
- Design language per CLAUDE.md §8: `bg-[#FAFAF8]`, `text-[8px] tracking-[0.3em] uppercase` labels, `text-2xl font-light` values, `৳` for currency, Phosphor icons at `weight="light"`

## 2.4 Data quality warning

`products.weight_kg` is nullable and likely empty on many rows. Every kg figure silently under-reports until it is filled.

The report header shows `N products missing weight` with a link to Products when any product referenced in the range has a null `weight_kg`. A wrong total that looks right is worse than no total.

## Phase 2 success criteria

1. `buildStaffReport` returns correct counts, values, kg, and rates for a fixture covering: an order confirmed then cancelled, a courier-cancelled order, an unassigned order, a null-weight product → verify: `npm test` on `src/test/staffReport.test.ts`
2. Rates return `null` on a zero denominator → verify: unit test
3. A courier return does not increment Cancelled count but does increment Return/RTO → verify: unit test
4. A `team_member` requesting another user's row gets only their own → verify: route test
5. The page renders for a single staff member, several, and all → verify: component test
6. Build and lint clean → verify: `npm run build && npm run lint`

## Risks

| Risk | Handling |
|---|---|
| `products.weight_kg` is null on many rows, under-reporting every kg figure | Explicit warning in the report header (2.4) |
| `orders.status` is written from several places; a missed one loses attribution | All status writes funnel through `PATCH /api/orders/:id` and the webhook. The event log makes any gap visible in audit rather than silently wrong |
| Legacy `source` values (`shopify`, `inbox`, `custom_website_tracker`) exist alongside the canonical set | `normalizeOrderSource` already collapses them; telesales filtering uses the exact `telesales` value only |
| Staff who confirm orders but have no suite login cannot be measured | Out of scope — attribution requires an auth user. Flagged for the operator |
