# Business Report Design

**Status:** Approved for implementation (2026-09-19)

## Goal

Give Mango Lover BD admins an operational financial view of **regular orders**
created in a Dhaka-local reporting period. The page should make today's intake,
current outcome mix, source performance, landing-page performance, and delivery
economics easy to scan without departing from the Staff Performance page's
card-led visual language.

## Scope

### In scope

- An admin-only Business Report page at `/reports/business`.
- An authenticated, admin-enforced `GET /api/reports/business` endpoint.
- Regular `orders` only. `social_inbox_orders` remain out of scope.
- A Today default and the existing Dhaka-aware `DateRangePicker`, including
  custom ranges and All Time.
- Summary metrics for intake, order value, approved/progressing outcomes, and
  cancellations.
- A finance band showing delivery charged to customers, recorded courier fees,
  net delivery position, and courier-fee coverage.
- An hourly intake chart for a one-day range and a daily intake chart for a
  multi-day range.
- Stacked, expandable source cards for every source represented in the selected
  range. The Website card includes a landing-page breakdown.
- Staff Performance's warm background, metric trays, controls, inline expansion,
  BoardUI chips, restrained Framer Motion, reduced-motion support, loading,
  retry, and empty states.

### Out of scope

- Social Inbox metrics, social order fees, or a merged cross-table total.
- Database migrations, new persistence, data backfills, exports, charts beyond
  the compact intake series, or order drill-through lists.
- Cash settlement, COD reconciliation, profit, COGS, ad spend, or accounting
  ledger claims. The underlying order data does not establish those facts.

## Product Decisions

| Topic | Decision |
| --- | --- |
| Audience | Admins only, enforced in both React routing and the API. |
| Order scope | `orders` only, never `social_inbox_orders`. |
| Default period | Today in `Asia/Dhaka`. |
| Date meaning | Filter by `orders.created_at`: this is an intake report. |
| Outcome timing | Report each selected intake order's **current** outcome, rather than status changes made during the range. |
| Source scope | All regular-order source categories represented in the range. |
| Landing pages | Website orders are broken down by `landing_page_path`; non-landing Website orders appear as `Other website`. |
| Delivery economics | Show delivery charged, courier fees recorded, and their difference. Do not call delivery revenue “collected.” |
| Visual direction | Balanced hybrid: Staff Performance-style summary and source cards plus a compact finance band and intake chart. |

## Metric Semantics

The report reads only rows created in the selected interval. For an inclusive
`from` / `to` date pair, the server queries `created_at >=` Dhaka-local midnight
of `from` and `<` midnight following `to`. Omitted dates mean All Time.

### Intake and value

- **Intake**: count of selected regular orders.
- **Order value**: sum of `orders.price` for all selected intake orders. It is
  shown as intake value before delivery and is not a collected-revenue claim.
- Each outcome's value is the sum of the same `price` field within that current
  outcome bucket.

### Current outcome buckets

Outcome buckets are mutually exclusive and use the order's present status plus
the current courier/return fields:

1. **Cancelled**: business status or courier status normalizes to `cancelled`,
   `canceled`, or `rejected`.
2. **Returned / RTO**: a terminal order/courier return (`returned`, a courier
   status containing `return`, or `return_status` of `returned` or `completed`)
   that is not already cancelled/rejected.
3. **Approved / progressing**: business status is `approved`, `confirmed`,
   `print`, `processing`, `fulfilled`, `delivered`, or `partial_delivered`.
   This preserves the approved outcome as an order advances through dispatch.
4. **Pending**: all remaining selected orders, including pending and on-hold
   work.

The summary shows Intake, Order Value, Approved / progressing, and Cancelled.
Source cards also show Pending and Returned / RTO chips so those orders never
disappear into an approved or cancelled total.

### Delivery economics

- **Delivery charged**: sum of `delivery_rate` for approved/progressing orders.
  It is an order-level charge, not proof of COD settlement.
- **Courier fees recorded**: sum of non-null `courier_fee` values on selected
  intake orders, including returned work where a courier cost was incurred.
- **Net delivery position**: delivery charged minus courier fees recorded.
- **Fee coverage**: `orders with courier_fee / selected intake orders`. The UI
  must show this count wherever courier fees or net delivery position appear.
  This prevents incomplete courier data from looking like a reconciled margin.

## Source and Landing-Page Semantics

Server-side source normalization mirrors the existing canonical client mapping:

- Legacy `custom_store`, `custom_website`, `custom_website_tracker`,
  `storefront`, `storefront_review`, `webhook`, and `website` values become
  **Website**.
- Canonical `facebook`, `instagram`, `whatsapp`, `phone`, `telesales`, and
  `manual_other` values retain their existing labels.
- Unknown, blank, or malformed historical values become **Manual / Other**.

Only sources with selected intake orders produce a card. Cards rank by order
value descending, then intake count, then label. Every card contains source
intake, order value, net delivery position, outcome chips, delivery economics,
and fee coverage in its expandable detail.

The Website card additionally lists landing pages. A valid stored
`/step/...` path is its own landing-page row; Website orders without one are
grouped as **Other website**. Each landing-page row shows intake, value, and its
own current outcome counts.

## Experience Design

### Header and controls

The page follows `StaffPerformance.tsx` directly:

- Heading: **Business Report**.
- Supporting text: regular-order intake and operating totals using Asia/Dhaka
  dates.
- Existing `DateRangePicker` plus a refresh icon button.
- No staff filter because the report is merchant-wide.

### Summary and finance band

Four animated snapshot cards appear first:

1. Intake
2. Order value
3. Approved / progressing
4. Cancelled

Below them, a two-column finance band displays delivery economics on one side
and the intake series on the other. On narrow screens it stacks vertically.
The series shows 24 hourly buckets for a single date, daily buckets for a
bounded multi-day range, and the most recent 30 active Dhaka days for All Time.
The All Time summary still covers all selected orders; its chart is explicitly
labelled **Recent intake activity**.

### Source cards

Source cards stay vertically stacked at every breakpoint, like Staff Performance
cards. Their compact state shows the source, source-specific intake, value, net
delivery position, and BoardUI outcome chips. Tapping a card expands an inline
detail section with delivery economics and fee coverage. The Website card adds
the landing-page block in the same expanded section.

The page respects `useReducedMotion()` by disabling entry/exit transforms while
preserving state changes and accessibility semantics. Expand controls use native
buttons with `aria-expanded` and `aria-controls`.

### States

- **Loading**: Staff Performance-style centered spinner.
- **Error**: concise error message and retry action.
- **Empty**: explains that no regular orders were created in the selected range.
- **Partial courier data**: the finance band and source detail expose fee
  coverage rather than emitting a warning toast or estimating a fee.

## API and Data Flow

### Endpoint

`GET /api/reports/business?from=YYYY-MM-DD&to=YYYY-MM-DD`

The handler is located in the reports area of `server/index.js` and performs:

1. `getToken(req)` → `getUser(token)` → 401 guard.
2. `getUserOrg(supabase, user.id)` to resolve the fixed Mango Lover BD
   workspace and role.
3. A 403 response for every non-admin role.
4. Date validation through a pure request helper. Dates are all-or-nothing,
   valid calendar days, and ordered `from <= to`.
5. Stable, paginated reads of `orders`, always including
   `.eq("org_id", orgId)`, selecting only fields needed for the report:
   `id`, `created_at`, `source`, `landing_page_path`, `status`, `price`,
   `delivery_rate`, `courier_fee`, `courier_status`, and `return_status`.
6. JSON output from a pure business-report aggregation module.

No client-provided organisation identifier is accepted. No schema or migration
work is required.

### Response shape

```ts
{
  range: { from: string | null; to: string | null },
  summary: {
    intake_count: number,
    order_value: number,
    approved_count: number,
    approved_value: number,
    cancelled_count: number,
    cancelled_value: number,
    returned_count: number,
    returned_value: number,
    pending_count: number,
    pending_value: number,
    delivery_charged: number,
    courier_fees_recorded: number,
    net_delivery_position: number,
    courier_fee_order_count: number,
  },
  series: {
    granularity: "hour" | "day",
    label: string,
    buckets: Array<{ key: string; label: string; intake_count: number; order_value: number }>,
  },
  sources: Array<{
    source: string,
    label: string,
    intake_count: number,
    order_value: number,
    approved_count: number,
    cancelled_count: number,
    returned_count: number,
    pending_count: number,
    delivery_charged: number,
    courier_fees_recorded: number,
    net_delivery_position: number,
    courier_fee_order_count: number,
    landing_pages: Array<{
      path: string | null,
      label: string,
      intake_count: number,
      order_value: number,
      approved_count: number,
      cancelled_count: number,
      returned_count: number,
      pending_count: number,
    }>,
  }>,
}
```

`landing_pages` is populated only for the Website source; all other sources
return an empty array.

## Implementation Boundaries

| File | Responsibility |
| --- | --- |
| `server/businessReport.js` | Pure date-request validation, source and outcome normalization, aggregation, landing-page grouping, fee coverage, and series construction. |
| `server/index.js` | Thin authenticated, admin-only, paginated endpoint with the required workspace guard. |
| `src/pages/BusinessReport.tsx` | Query, report presentation, compact series, metric trays, expandable source cards, and UI states. |
| `src/App.tsx` | Lazy-load and protect `/reports/business` with `AdminRoute`. |
| `src/components/AppSidebar.tsx` | Add the admin-only Business Report item below Staff Performance in Reports. |
| `src/components/DashboardLayout.tsx` | Add the Business Report breadcrumb label. |
| `src/test/businessReport.test.ts` | Pure aggregation and request-helper coverage. |
| `src/test/businessReportRouteWiring.test.ts` | Auth, admin, pagination, select fields, and `org_id` guard coverage. |
| `src/test/businessReportPage.test.tsx` | Page rendering, today default, controls, expansion, data quality, loading, retry, and empty states. |
| `src/test/businessReportRouting.test.ts` | Route, admin protection, sidebar item, and breadcrumb coverage. |

## Acceptance Criteria

1. Admins can open `/reports/business`; team members cannot retrieve report data
   or reach the page through a forged route.
2. Today defaults to the current Dhaka calendar day and all selected orders are
   filtered by their creation timestamp.
3. Regular orders are aggregated without Social Inbox data.
4. Every active source in the range appears in the source breakdown, with
   historical source values normalized consistently.
5. The Website card accurately groups valid landing pages and Other website
   intake.
6. Approved/progressing, cancelled, returned, and pending orders are mutually
   exclusive and remain visible.
7. Delivery charged, courier fees recorded, and net delivery position expose fee
   coverage instead of making cash-settlement claims.
8. The page uses the Staff Performance visual and interaction language at desktop
   and mobile sizes.
9. `npm test`, `npm run lint`, and `npm run build` pass before shipping.
