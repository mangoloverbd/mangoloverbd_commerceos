# Staff Performance Card Redesign

**Status:** Approved for implementation (2026-09-18)

## Goal

Make the Staff Performance report feel consistent with the Customers and
Warehouses pages: a concise page header, an at-a-glance team snapshot, and a
ranked set of staff performance cards. Keep regular-order performance useful
without making users scan the current wide report table.

## Scope

### In scope

- Hide all Social Inbox performance content from the Staff Performance UI.
- Preserve the existing report API response and Social Inbox calculations for
  future reporting work.
- Keep the current Dhaka-local date range, staff filter, refresh action,
  missing-weight disclosure, loading state, and error retry behavior.
- Add a four-card team snapshot for the selected filters:
  - Confirmed value
  - Confirmed orders
  - Confirmation rate
  - Delivered rate
- Replace the regular-order report table with staff performance cards ranked by
  confirmed value, descending.
- Expand a staff card inline to reveal the existing operational detail and
  confirmed-product breakdown.
- Match the white surfaces, restrained rounded metric trays, queue-like
  hierarchy, light motion, and responsive behavior used by Customers and
  Warehouses.

### Out of scope

- Backend route, database, migration, attribution, or metric-semantic changes.
- Changing the Social Inbox API data or deleting any Social Inbox reporting
  code from the server.
- Export, charting, staff-management, or drill-through order-list features.

## Experience

### Header and controls

Use the Customers/Warehouses page rhythm:

- `Staff Performance` heading with a short explanation of human-attributed
  regular-order work.
- Staff filter, date range picker, and refresh button aligned at the right on
  larger screens and wrapped naturally below the title on smaller screens.
- No Social Inbox label, table, note, or disclosure appears on this page.

### Team snapshot

Render four small, equal-height metric trays below the header. They use the
same visual weight as the Customers and Warehouses stat cards.

Metric aggregation is calculated across the returned regular-order rows:

- **Confirmed value:** sum of `orders.confirmed_value`.
- **Confirmed orders:** sum of `orders.confirmed_count`.
- **Confirmation rate:** sum of `orders.confirmed_assigned_count` divided by
  sum of `orders.assigned_count`; show `—` when no orders were assigned.
- **Delivered rate:** sum of `orders.delivered_count` divided by sum of
  `orders.confirmed_count`; show `—` when nothing was confirmed.

Rates are weighted from their underlying numerators and denominators. They are
not averages of the staff-level percentages.

### Staff performance cards

- Sort all returned staff rows by `orders.confirmed_value` descending; use
  display name as a stable tie-breaker.
- Each card shows the staff member name, former-staff marker when appropriate,
  confirmed order count, confirmation rate, and confirmed value as the primary
  ranking figure.
- Include a compact row of color-coded BoardUI chips for assigned (blue),
  delivered (lime), cancelled (rose), and RTO (yellow) work so operators can
  compare staff without expanding every card.
- A card is an accessible disclosure control. Activating it expands details
  inline in the same card, with `aria-expanded` and a meaningful label.
- The inline detail reveals the regular-order operational metrics already
  supported by the report: assigned work, confirmed work/value/weight/AOV,
  cancellation work/value/rate, delivery work/value/rate, and RTO work/value.
- Product rows remain in the inline detail and show confirmed packs and kg.
  Empty product detail says there are no confirmed product items in the range.
- More than one card may remain expanded, matching the current report’s
  independent row-expansion behavior.

### Responsive and motion behavior

- Keep the team performance cards in one vertical queue at every screen width,
  so each staff member has a full-width row and expanded detail remains easy
  to scan.
- Do not create horizontal page overflow. Long names and monetary values must
  truncate or wrap gracefully within a card.
- Use the restrained Framer Motion entrance pattern used by Customers and
  Warehouses. Respect reduced-motion preferences.

### States

- Preserve the existing centered loading and retryable error states.
- Preserve the missing-weight advisory because it applies to regular-order
  product reporting.
- The empty state says that no staff attribution is available for the selected
  range; it must not refer to Social Inbox.

## Data and compatibility

This is a frontend-only presentation change. `StaffReportResponse`, the
authenticated `/api/reports/staff` request, query keys, and server-side
workspace guards remain unchanged. The page continues to call `apiFetch()`.

## Acceptance criteria

1. The Staff Performance page does not render `Social Inbox` or any social
   metrics, descriptions, or tables.
2. The existing `/api/reports/staff` response remains unchanged and the page
   continues to render regular-order results from it.
3. The page has a Customers/Warehouses-style header, four team snapshot cards,
   and regular-order staff cards ranked by confirmed value.
4. Snapshot rates use aggregated numerators and denominators rather than an
   average of per-staff rates.
5. A staff card expands inline, accessibly, to show full regular-order metrics
   and confirmed-product detail.
6. Date and staff filtering, refresh, missing-weight disclosure, loading,
   error, empty, mobile, and reduced-motion behavior continue to work.
7. Tests cover Social Inbox removal, weighted snapshot metrics, confirmed-value
   ranking, and inline card expansion.
