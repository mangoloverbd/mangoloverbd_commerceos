# Telesales Staff Performance Report (Phase 2) Implementation Plan

> **For agentic workers:** Required skills before implementation: `plan-eng-review`, `test-driven-development`, `review`, and `verification-before-completion`. Work in the existing isolated feature worktree. Do not apply the Phase 1 Supabase migration, push, or create a PR unless the user explicitly asks.

**Goal:** Make Phase 1 human-attribution data visible in a role-safe Staff Performance report, with reliable regular-order and social-inbox-order metrics across Dhaka-local date ranges.

**Architecture:** Add a pure `server/reports.js` aggregator that accepts already workspace-scoped rows and returns a stable report payload. A thin authenticated Express route queries only the current Mango Lover BD workspace, limits team members to their own user ID, and passes the results into that pure module. A protected React page uses TanStack Query and renders separate regular-order and social-inbox sections from the same payload.

**Tech stack:** Node 20 ESM, Express, Supabase service-role reads, React 18, React Router v6, TanStack Query v5, Tailwind, shadcn UI, Phosphor icons, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-18-telesales-performance-design.md`

## Scope and invariants

- No schema migration is required for Phase 2. It reads the unapplied Phase 1 attribution schema; do **not** apply it remotely as part of this work.
- Every database query in the route must be filtered by the resolved `orgId`; the client never supplies an organisation identifier.
- The route starts with `getToken(req)` → `getUser(token)` → a 401 guard → `getUserOrg(supabase, user.id)`.
- An admin may select any staff member in the resolved workspace. A `team_member` is always restricted server-side to `[user.id]`, regardless of the `users` query parameter.
- Report dates are inclusive calendar dates in `Asia/Dhaka`. Query intervals use an inclusive lower bound and the next Dhaka midnight as an exclusive upper bound, avoiding the existing `23:59:59` fractional-second edge case.
- Attribution columns, not mutable order status, are the source of human work. Courier returns remain Return/RTO results and never count as human cancellations.
- Regular orders use `orders.price` and `orders.weight_kg`. Social inbox orders use `total_price` and `weight_kg`; their source data is kept in a visibly separate table because `total_price` may include delivery.
- Product detail is attached to confirmations in the selected date range. Regular orders use `order_items`; social orders use their JSON `items` array. Product matching is exact by ID first, then normalized catalog name; it never uses fuzzy matching for reporting.

## Response contract

`GET /api/reports/staff?from=YYYY-MM-DD&to=YYYY-MM-DD&users=<uuid,uuid>` returns:

```ts
{
  range: { from: string | null; to: string | null },
  available_staff: Array<{ user_id: string; display_name: string }>,
  selected_user_ids: string[],
  rows: Array<{
    user_id: string;
    display_name: string;
    orders: StaffMetrics;
    social_inbox_orders: StaffMetrics;
  }>;
  missing_weight_products: Array<{ id: string; name: string }>;
}
```

`StaffMetrics` is flattened for simple table rendering:

```ts
{
  assigned_count: number;
  confirmed_count: number;
  confirmed_assigned_count: number;
  confirmed_value: number;
  confirmed_kg: number;
  confirmation_rate: number | null;
  average_order_value: number | null;
  cancelled_count: number;
  cancelled_assigned_count: number;
  cancelled_value: number;
  cancellation_rate: number | null;
  delivered_count: number;
  delivered_value: number;
  delivered_rate: number | null;
  returned_count: number;
  returned_value: number;
  telesales_confirmed_count: number;
  telesales_confirmed_value: number;
  telesales_confirmed_kg: number;
  products: Array<{ product_id: string | null; product_name: string; packs: number; kg: number }>;
}
```

For social inbox rows, the telesales fields are structurally present and zero; the social table does not render that irrelevant column group.

## File map

| File | Change | Responsibility |
|---|---|---|
| `server/overview.js` | Modify | Export the existing Dhaka `toDayKey` helper for shared report use. |
| `server/reports.js` | Create | Pure date filtering, aggregation, courier classification, product detail, and missing-weight detection. |
| `server/index.js` | Modify | Import the report builder and add the authenticated, workspace-scoped staff-report route next to Overview/Analytics. |
| `src/components/DateRangePicker.tsx` | Modify | Add Bangladesh-week `This Week` and calendar-correct `Last Month` presets. |
| `src/pages/StaffPerformance.tsx` | Create | Query, staff filter, quality warning, grouped report tables, expandable product detail, and loading/error states. |
| `src/App.tsx` | Modify | Lazy-load and route `/reports/staff` inside the protected dashboard layout. |
| `src/components/AppSidebar.tsx` | Modify | Add a collapsible Reports section with a Phosphor `ChartLineUp` Staff Performance link. |
| `src/test/staffReport.test.ts` | Create | Pure report aggregation fixtures and date/rate/data-quality coverage. |
| `src/test/staffReportRouteWiring.test.ts` | Create | Endpoint auth, role restriction, parameter validation, and workspace query guard coverage. |
| `src/test/staffPerformancePage.test.tsx` | Create | Single, multi-staff, all-staff, quality-warning, and expandable product UI coverage. |
| `src/test/dateRangePicker.test.tsx` | Modify or create if no focused coverage exists | Verify the two added presets select the intended ranges. |

## Task 1: Specify report aggregation with failing pure tests

**Files:** `src/test/staffReport.test.ts`

1. Build deterministic fixtures for two staff members, catalog products with known and null `weight_kg`, regular orders, social inbox orders, and regular `order_items`.
2. Cover Dhaka-local date inclusion for `created_at`, `confirmed_at`, and `cancelled_at` separately; an order must be counted by the timestamp appropriate to each metric.
3. Assert all regular metrics: assigned, confirmed total and assigned-only, values, kg, rates, AOV, telesales subset, delivered, returned, and per-product packs/kg.
4. Include a confirmed-then-cancelled order, a courier return with no `cancelled_by`, and an unassigned order confirmed by a staff member. Assert courier outcome does not create a human cancellation and the unassigned confirmation does not affect either rate denominator.
5. Assert rate fields are `null` when their denominators are zero, and that missing product weights are deduplicated and exposed in the output.
6. Cover social-inbox `items` product detail and its separate metrics object.
7. Run the targeted test and observe the expected red failure before creating implementation code.

## Task 2: Implement the pure report builder

**Files:** `server/overview.js`, `server/reports.js`

1. Change `toDayKey` in `server/overview.js` to a named export without altering its existing behavior.
2. Create `server/reports.js` with `buildStaffReport(orders, inboxOrders, orderItems, products, staff, { since, until })`.
3. Normalize numbers defensively and normalize courier strings by lowercasing/trimming/separator collapse. Classify only `delivered`/`partial_delivered` as delivered and any status containing `return` as Return/RTO. Do not treat courier `cancelled` or `rejected` as Return/RTO or staff cancellation.
4. Filter assigned counts by `created_at`, confirmation and outcome metrics by `confirmed_at`, and cancellation metrics by `cancelled_at`, using the exported Dhaka day key. `null` bounds mean all attributed history.
5. Aggregate only the specified staff list. Each row begins at zero, preserves `null` rates when there is no denominator, and returns products sorted by descending packs then name.
6. For regular confirmed orders, add the stored order-level `weight_kg`; resolve product rows from `order_items` and catalog products to calculate packs/kg. For social confirmed orders, use its stored `weight_kg`, resolve product rows from JSON items, and use the same product aggregation rules.
7. Track only catalog products referenced by a confirmed item whose `weight_kg` is null in `missing_weight_products`; dedupe by product ID and sort by name.
8. Re-run the targeted pure tests until green, then commit this isolated implementation as `feat: build staff performance report data`.

## Task 3: Add the role-safe report endpoint

**Files:** `server/index.js`, `src/test/staffReportRouteWiring.test.ts`

1. Write static route-wiring tests following the existing `staffRosterRouteWiring.test.ts` pattern. Require the standard auth flow, `getUserOrg`, role-aware selected IDs, org guards on every source table, and rejection/normalization of invalid date and user parameters.
2. Import `buildStaffReport` at the server module top and add `GET /api/reports/staff` immediately after `/api/overview`.
3. Parse `from`/`to` as an all-or-nothing pair of real `YYYY-MM-DD` values; reject malformed dates and inverted ranges with 400. Omitted bounds mean All Time.
4. Load the workspace staff roster (`user_id`, `display_name`), retaining soft-deleted staff role rows so historical attribution remains named. For admins, validate a requested comma-separated, deduplicated UUID list is a subset of the roster; for team members, ignore client selection and use only the authenticated user.
5. Fetch only rows relevant to the selected staff and date bounds: separate assigned/confirmed/cancelled reads for `orders` and `social_inbox_orders`, each explicitly constrained by `org_id`; merge the three result sets by ID before aggregating.
6. Fetch `order_items` only for regular orders confirmed in the requested range, batching IDs through the existing `chunkIds` helper and preserving the org guard. Fetch `id`, `name`, and `weight_kg` from workspace products.
7. Pass results to the pure builder and return the documented contract. Use `sendError` for unexpected failures.
8. Run pure and route-wiring tests; commit as `feat: add staff performance report API`.

## Task 4: Build the protected report page test-first

**Files:** `src/test/staffPerformancePage.test.tsx`, `src/pages/StaffPerformance.tsx`

1. Mock `apiFetch` and `DateRangePicker`; render through a `QueryClientProvider` and `MemoryRouter`.
2. Add tests for one staff row, multiple rows, the default all-staff state, an all-staff selector that narrows the request, the missing-weight Products link, and expanding a product-detail row.
3. Implement the page with a Dhaka-current-month default range and TanStack Query. Build the request via `URLSearchParams`; use `apiFetch` only.
4. Render a compact staff multi-select using existing shadcn Popover, Button, and Checkbox primitives. An empty selection represents All Staff. Hide the selector when the route exposes only one available staff member; the server remains the authority either way.
5. Render a visible header, date picker, data-quality warning, and two horizontally scrollable grouped tables: **Orders** and **Social Inbox**. Use grouped headers for Assigned, Confirmed, Cancelled, Delivered, and Return/RTO; regular orders also show Telesales. Use `—` for null rates, `৳` for values, and `kg` labels for weights.
6. Place per-product packs/kg in an expandable row under each staff row, with an empty-state sentence when no confirmed product items exist. Use only Phosphor icons at `weight="light"` for new icons.
7. Provide concise loading, empty, retryable error, and refresh states consistent with the existing Overview page.
8. Run the page test suite and commit as `feat: add staff performance report page`.

## Task 5: Wire navigation and date presets

**Files:** `src/components/DateRangePicker.tsx`, `src/App.tsx`, `src/components/AppSidebar.tsx`, focused date-picker/nav tests as needed

1. Add `This Week` using a Sunday start (Bangladesh calendar convention) and `Last Month` using the complete prior calendar month. Do not change existing preset behavior.
2. Lazy-load `StaffPerformance` and add `/reports/staff` under `ProtectedRoute` and `DashboardLayout`.
3. Add the collapsible Reports sidebar section with a `ChartLineUp` Phosphor icon (`weight="light"`); it must remain visible to every authenticated member.
4. Add or update focused tests for the route/navigation and new date presets if the existing suite has appropriate seams.
5. Run affected frontend tests and commit as `feat: expose staff performance reporting`.

## Task 6: Review and verify

1. Invoke the `review` skill with the completed diff. Address any auth, workspace, parameter-validation, or reporting-semantic findings.
2. Invoke `verification-before-completion` and run:

   ```bash
   npm test -- --run src/test/staffReport.test.ts src/test/staffReportRouteWiring.test.ts src/test/staffPerformancePage.test.tsx
   npm test
   npm run lint
   npm run build
   npm run verify:supabase-baseline
   npm run verify:supabase-project
   ```

3. Start the local app and manually verify `/reports/staff` as an admin and, if a test account is available, as a team member. Do not apply the migration or deploy during this task.
4. Summarize verification evidence and leave the branch ready for user-directed migration application, push, and PR creation.
