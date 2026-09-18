# Telesales Staff Performance Report (Phase 2) Implementation Plan

> **For agentic workers:** Required skills before implementation: `plan-eng-review`, `test-driven-development`, `supabase`, `supabase-postgres-best-practices`, `review`, and `verification-before-completion`. Work in the existing isolated feature worktree. Do not apply the migration, push, or create a PR unless the user explicitly asks.

**Goal:** Make Phase 1 human-attribution data visible in a role-safe Staff Performance report, with reliable regular-order and social-inbox-order metrics across Dhaka-local date ranges.

**Architecture:** Add a pure `server/reports.js` module that validates report filters and staff selection, produces precise Dhaka query intervals, and aggregates already workspace-scoped rows. A thin authenticated Express route reads only the resolved Mango Lover BD workspace, paginates every unbounded query, and passes the results to that pure module. A protected React page uses TanStack Query and renders regular orders and social-inbox orders as deliberately separate tables.

**Tech stack:** Node 20 ESM, Express, Supabase service-role reads, React 18, React Router v6, TanStack Query v5, Tailwind, shadcn UI, Phosphor icons, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-18-telesales-performance-design.md`

## Migration safety gate

Completed read-only on 2026-09-18 before this plan is amended:

- The live project's migration history ends at `20260914180257_add_order_landing_page_path`; it does **not** include `20260918000000_staff_attribution`.
- The live `orders`, `social_inbox_orders`, and `user_roles` tables likewise do not yet have the Phase 1 attribution/display-name columns.
- It is therefore safe to amend the local, unapplied Phase 1 migration. No remote DDL, migration application, push, or PR has occurred.

This work intentionally uses that read-only history check rather than introducing an unverified new deployment script. Repeat `npm run verify:supabase-project`, inspect remote migration history read-only, and run `npm run verify:supabase-baseline` immediately before changing the migration file. If the migration appears remotely at that point, stop: create a new forward-only migration instead of editing history.

## Scope and invariants

- Amend the still-unapplied Phase 1 migration; do not create or apply a separate Phase 2 migration. It gains the two cancellation-report indexes and the small active/former-staff lifecycle support described below.
- Every database query in the route is filtered by resolved `orgId`; the client never supplies an organisation identifier.
- The route starts with `getToken(req)` → `getUser(token)` → 401 guard → `getUserOrg(supabase, user.id)`.
- An admin may select any current or former staff member in the resolved workspace. A `team_member` is always restricted server-side to `[user.id]`, ignoring any forged `users` parameter.
- Date inputs are all-or-nothing inclusive calendar dates in `Asia/Dhaka`. The route queries `>=` local midnight on `from` and `<` next local midnight after `to`, never an imprecise `23:59:59` sentinel.
- Attribution columns, not mutable order status, are the source of human work. Courier/system events never produce a staff cancellation.
- Regular orders use `orders.price` and stored `orders.weight_kg`. Social inbox orders use `total_price` and stored `weight_kg`; social value is labelled as including delivery because `total_price` can include it.
- Product detail is attached only to confirmations in the selected range. Regular orders use `order_items`; social orders use JSON `items`. Reporting resolves a matching product by same-workspace `product_id` first, then an exact normalized catalog name. It never uses fuzzy matching.
- Per-product kg deliberately reflects live `products.weight_kg`; order-level kg remains the immutable stored order snapshot. A line-item weight snapshot is deferred because historic lines cannot be truthfully backfilled.
- New and edited Meta social items preserve a verified `product_id`; historic JSON without one keeps the exact-name fallback. No historic JSON backfill is attempted.

## Settled metric semantics

| Topic | Decision |
|---|---|
| Regular assigned work | `assigned_to = staff` and `created_at` in range. |
| Regular confirmation | `confirmed_by = staff` and `confirmed_at` in range. `confirmed_assigned` additionally requires the same `assigned_to`. |
| Regular cancellation | `cancelled_by = staff` and `cancelled_at` in range. `cancelled_assigned` additionally requires the same `assigned_to`. A confirmed-then-cancelled order is present in both current attribution sets. |
| Regular rates | Confirmation/cancellation rates use assigned work as their denominator. An unassigned storefront order can show confirmed work but cannot change either rate. Zero denominators return `null`, rendered as `—`. |
| Social work | Social orders are system/AI captured and currently have no staff assignment flow. Social `assigned_count`, `confirmed_assigned_count`, and `cancelled_assigned_count` remain `0`; its assignment-based rates remain `null`. The social table omits those non-applicable groups and credits only human confirmations/cancellations. |
| Delivered and Return/RTO | Credit a result to `confirmed_by` when its `confirmed_at` is in range. Normalize casing and separators. Only `delivered`/`partial_delivered` count delivered. Return/RTO is a completed courier return: a courier status containing `return`, or a terminal `return_status` of `returned`/`completed`. `cancelled`, `rejected`, and pending/approved/processing return requests are neither delivered nor Return/RTO. Outcome classes are mutually exclusive. Existing `/api/returns` queue semantics are not changed in this feature. |
| Telesales | Regular confirmed orders with `source === "telesales"`; social metrics are structurally zero and that group is omitted from the social table. |
| Product detail | Packs sum valid line quantities. A catalog product with `weight_kg: null` contributes zero kg and appears once in `missing_weight_products`. An unresolved historic name remains visible with `product_id: null` but does not create a false missing-weight warning. |

## Former-staff lifecycle

Phase 1 currently soft-deletes the Auth user but deletes the matching `user_roles` record. That preserves foreign keys but loses the former employee's report name. Fix this before the report relies on the roster:

1. Add nullable `user_roles.deleted_at` and a partial active-roster index to the still-unapplied Phase 1 migration.
2. Team removal first marks the role row deleted, then calls `supabase.auth.admin.deleteUser(member.user_id, true)`. If Auth deletion fails, clear the role marker before reporting the failure. This makes existing JWTs fail the app's own role guard immediately; Supabase documents that deleting an Auth user alone does not necessarily invalidate an already-issued JWT.
3. Active authorization and active staff/team queries filter `deleted_at is null`. `ensureUserRole` treats an archived role as absent rather than reactivating it.
4. The report roster deliberately does **not** filter `deleted_at`, returns `is_active`, and labels former staff in the admin selector/table so old attribution retains its real name. No active assignment endpoint may select a former employee.

## Response contract

`GET /api/reports/staff?from=YYYY-MM-DD&to=YYYY-MM-DD&users=<uuid,uuid>` returns:

```ts
{
  range: { from: string | null; to: string | null },
  available_staff: Array<{
    user_id: string;
    display_name: string;
    is_active: boolean;
  }>;
  selected_user_ids: string[];
  rows: Array<{
    user_id: string;
    display_name: string;
    is_active: boolean;
    orders: StaffMetrics;
    social_inbox_orders: StaffMetrics;
  }>;
  missing_weight_products: Array<{ id: string; name: string }>;
}
```

`StaffMetrics` stays flattened for simple table rendering:

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
  products: Array<{
    product_id: string | null;
    product_name: string;
    packs: number;
    kg: number;
  }>;
}
```

## File map

| File | Change | Responsibility |
|---|---|---|
| `server/overview.js` | Modify | Export the existing Dhaka `toDayKey` helper without changing Overview behavior. |
| `server/reports.js` | Create | Pure request validation, Dhaka interval construction, staff selection, aggregation, courier classification, product detail, and missing-weight detection. |
| `server/index.js` | Modify | Active/former-staff safeguards, paginated role-safe report route, and exact social-item product-ID normalization on every write path. |
| `supabase/migrations/20260918000000_staff_attribution.sql` | Modify | Add `user_roles.deleted_at`, an active-roster index, and two partial composite cancellation indexes while this migration remains unapplied. |
| `src/components/DateRangePicker.tsx` | Modify | Add Sunday-start `This Week` and complete-calendar `Last Month` presets. |
| `src/pages/StaffPerformance.tsx` | Create | Query, staff filter, quality warning, separate tables, expandable product detail, and loading/error/retry states. |
| `src/App.tsx` | Modify | Lazy-load and route `/reports/staff` inside the protected dashboard layout. |
| `src/components/AppSidebar.tsx` | Modify | Add a collapsible Reports section with a Phosphor `ChartLineUp` Staff Performance link. |
| `src/test/staffAttributionSchema.test.ts` | Modify | Cover the added staff lifecycle and cancellation-index migration SQL. |
| `src/test/staffRosterRouteWiring.test.ts` | Modify | Prove removal archives a role and active roster/assignment reads exclude former staff. |
| `src/test/staffReport.test.ts` | Create | Pure report, interval, rate, former-staff, social, courier, and data-quality fixtures. |
| `src/test/staffReportRouteWiring.test.ts` | Create | Endpoint auth, role-resolution, pagination, and workspace-query guard coverage. |
| `src/test/staffPerformancePage.test.tsx` | Create | Loading, retry, one/many/former/all-staff, warning, and expandable-product UI coverage. |
| `src/test/dateRangePicker.test.tsx` | Create or modify | Verify the two new date presets against a fixed Dhaka date. |
| `src/test/orderRoutingWiring.test.ts` | Modify | Guard `product_id` normalization on Meta create, AI edit, and dashboard item edits. |

## Task 1: Write the failing tests first

1. Create deterministic `staffReport` fixtures for active and former staff, regular orders, social inbox orders, regular `order_items`, and catalog products with known/null weights.
2. Test `resolveStaffReportRequest` and its Dhaka interval helper: malformed dates, invalid calendar days, one missing date bound, inverted bounds, exact lower/upper boundary timestamps, admin roster validation, and team-member narrowing even with a forged/malformed `users` value.
3. Assert all regular metrics: assigned, confirmed total/assigned-only, values, order kg, rates, AOV, telesales subset, delivered, returned, and product packs/kg. Include a confirmed-then-cancelled order, courier cancellation with no `cancelled_by`, a completed return, an unassigned confirmation, and zero denominators.
4. Add a table-driven outcome matrix for case/separator variants. It must prove that courier `cancelled` and `rejected` do not become staff cancellations or Return/RTO, while terminal return statuses do.
5. Assert social confirmation/cancellation credit, total-price semantics, product-ID-first then exact-name fallback, and structurally non-applicable assignment/rate fields.
6. Extend schema and staff-roster wiring tests for `user_roles.deleted_at`, active-only staff selection, former roster retention, and the two cancellation indexes.
7. Extend social write-path wiring tests so Meta creation, AI edits, and dashboard `items` edits all pass through the exact product-ID normalizer.
8. Add route-wiring tests requiring standard auth, `getUserOrg`, the pure filter helper, paged reads, and an explicit `org_id` guard on staff, orders, social orders, order items, and products.
9. Run the targeted tests and observe the expected red failure before implementation.

## Task 2: Implement attribution-safe data foundations and pure aggregation

1. Immediately before editing SQL, repeat the read-only remote migration-history check and run `npm run verify:supabase-project`. If `20260918000000_staff_attribution` is present remotely, stop and create a new forward-only migration instead.
2. Amend the unapplied Phase 1 migration with:

   ```sql
   alter table public.user_roles
     add column if not exists deleted_at timestamptz;

   create index if not exists user_roles_active_org_idx
     on public.user_roles (org_id, created_at)
     where deleted_at is null;

   create index if not exists orders_org_cancelled_by_idx
     on public.orders (org_id, cancelled_by, cancelled_at desc)
     where cancelled_by is not null;

   create index if not exists social_inbox_orders_org_cancelled_by_idx
     on public.social_inbox_orders (org_id, cancelled_by, cancelled_at desc)
     where cancelled_by is not null;
   ```

   Keep the existing single-column foreign-key indexes. Run `npm run verify:supabase-baseline` after the SQL edit. Do not run a remote migration command.
3. Export `toDayKey` from `server/overview.js` without changing Overview behavior. In `server/reports.js`, implement a separately testable `toDhakaInterval(from, to)` using the fixed Dhaka `+06:00` offset and next-day exclusive bound.
4. Implement `resolveStaffReportRequest({ from, to, users, role, userId, staff })`. It has no Express/Supabase dependency. It validates the all-or-nothing date pair, resolves the exact interval, rejects unknown admin-selected IDs, and ignores `users` for team members.
5. Implement `buildStaffReport(orders, inboxOrders, orderItems, products, staff, { since, until })` with one internal aggregation engine and narrow regular/social adapters. Each row starts at zero, returns null rates where appropriate, and sorts products by descending packs then name.
6. Normalize numeric values defensively. Use the settled exclusive courier outcome classifier. Evaluate assignment by `created_at`, confirmation/outcomes/products by `confirmed_at`, and cancellation by `cancelled_at` against the interval.
7. Use stored order `weight_kg` for confirmed kg. Resolve regular `order_items` and social JSON items by same-workspace ID, then unique exact normalized name. Track only resolved catalog products with null weight in the data-quality response.
8. Add an in-server `normalizeSocialInboxItems(supabase, orgId, items)` helper. It validates supplied IDs against the workspace and only fills missing IDs from a unique exact normalized catalog-name match. It must not consume `resolveOrderRouting`'s fuzzy result as a report product ID.
9. Call that normalizer from `saveMetaInboxOrder`, the Meta AI edit branch, and `PATCH /api/social/inbox-orders/:id`. When items change and weight was not manually supplied, recompute the stored social order weight with the existing routing resolver. Preserve a manually selected warehouse; only update an automatically selected warehouse.
10. Update active-role handling and team removal: archived roles fail `ensureUserRole`/`getUserOrg`; staff/team/assignee queries require `deleted_at is null`; report roster intentionally includes all roles. Mark the role deleted before soft-deleting Auth, and clear the marker if the Auth operation fails.
11. Re-run the targeted pure/schema/roster/social tests until green, then commit as `feat: build staff performance report data`.

## Task 3: Add the role-safe, paginated report endpoint

1. Import the report helpers and add `GET /api/reports/staff` next to `/api/overview`.
2. Resolve the caller and workspace with the standard auth guard. Load all workspace role rows with `user_id`, `display_name`, and `deleted_at`; report rows retain former staff, while `is_active` is derived server-side.
3. Pass raw query values plus caller role/user ID to `resolveStaffReportRequest`. Convert deliberate validation errors to 400; use `sendError` for unexpected failures. Omitted bounds mean All Time.
4. Build a small route-local paged fetch helper. For every selected-staff chunk, order by stable `id`, fetch fixed-size `.range()` pages until exhausted, and deduplicate rows by ID. This prevents Supabase's response-size cap from silently truncating an All Time report.
5. Query only selected-staff rows and fields needed by aggregation. Regular orders use independently paged assigned/confirmed/cancelled reads; social orders use confirmed/cancelled reads because social assignment rates are intentionally not applicable. Every read includes `.eq("org_id", orgId)` and the precise field-specific Dhaka interval.
6. Fetch paged regular `order_items` only for regular orders confirmed in range, batching order IDs through `chunkIds` and retaining the workspace guard. Fetch all workspace `id`, `name`, and `weight_kg` product rows through the same page discipline.
7. Merge event-read results by ID, pass the rows to `buildStaffReport`, and return the documented response contract without customer PII.
8. Run pure and route-wiring tests, then commit as `feat: add staff performance report API`.

## Task 4: Build the protected report page test-first

1. Mock `apiFetch` and `DateRangePicker`; render through `QueryClientProvider` and `MemoryRouter`.
2. Add tests for loading, a failed request with retry recovery, one/many/former rows, default all-staff state, staff selection changing the request, the missing-weight Products link, and expandable product rows.
3. Implement the page with a Dhaka-current-month default range and a TanStack Query key containing dates and selected user IDs. Build requests with `URLSearchParams` and use `apiFetch` only.
4. Render the staff multi-select from the server-provided roster. Empty means All Staff. Label inactive names as Former staff. Hide the selector when only one row is available; the route remains authoritative.
5. Render a header, date picker, data-quality warning, and two horizontally scrollable grouped tables. **Orders** includes Assigned, Confirmed, Cancelled, Delivered, Return/RTO, and Telesales. **Social Inbox** shows only Confirmed, Cancelled, Delivered, and Return/RTO and states that its value includes delivery.
6. Use `—` for null rates, `৳` for values, `kg` labels for weights, and only Phosphor icons with `weight="light"`. Provide expandable product packs/kg and a concise empty state.
7. Provide loading, empty, retryable error, and refresh states aligned with the existing Overview page.
8. Run the page test suite and commit as `feat: add staff performance report page`.

## Task 5: Wire navigation and date presets

1. Add `This Week` from the Sunday at the start of the current Bangladesh week through today, plus `Last Month` from the first through last calendar day of the preceding month. Do not change existing presets.
2. Lazy-load `StaffPerformance` and add `/reports/staff` inside `ProtectedRoute` and `DashboardLayout`.
3. Add a visible-to-all-authenticated-users collapsible Reports sidebar section with a `ChartLineUp` Phosphor icon at `weight="light"`.
4. Add focused route/navigation/date-preset tests where existing seams allow.
5. Run affected frontend tests and commit as `feat: expose staff performance reporting`.

## Task 6: Review and verify

1. Invoke `review` for the completed diff. Resolve auth, workspace, parameter-validation, migration-history, pagination, and metric-semantics findings.
2. Invoke `verification-before-completion` and run:

   ```bash
   npm test -- --run src/test/staffAttributionSchema.test.ts src/test/staffRosterRouteWiring.test.ts src/test/staffReport.test.ts src/test/staffReportRouteWiring.test.ts src/test/staffPerformancePage.test.tsx
   npm test
   npm run lint
   npm run build
   npm run verify:supabase-baseline
   npm run verify:supabase-project
   ```

3. Start the local app and manually verify `/reports/staff` as an admin and, if a test account is available, a team member. Do not apply the migration or deploy during this task.
4. Summarize evidence and leave the branch ready for user-directed migration application, push, and PR creation.

## GSTACK REVIEW REPORT

**Status:** Approved for implementation after the plan revisions above.

### Resolved findings

1. **Former names were at risk of disappearing.** The existing team-removal route soft-deleted Auth but then deleted `user_roles`. The amended lifecycle retains the row with `deleted_at`, blocks its access/assignment use, and keeps its name in historical reports.
2. **Social rates were misleading.** Social AI captures have no assignee. The report will show human confirmation/cancellation work but omit artificial assignment/rate/telesales groups from the social table.
3. **All Time could silently stop at a page limit.** Each report source, product lookup, and relevant item lookup receives deterministic pagination and deduplication.
4. **Dhaka date bounds needed database-level precision.** The pure interval helper uses a tested start-inclusive/end-exclusive timestamp range instead of a `23:59:59` approximation or application-server local timezone.
5. **Social edits could erase product linkage.** One exact-match normalizer now runs on new Meta captures, AI edits, and dashboard item updates. It preserves IDs without incorrectly treating a fuzzy routing match as a catalog fact.
6. **Return/RTO needed an explicit contract.** The report classifier is exclusive, narrowly credits completed returns, and never converts courier cancellation/rejection into a staff or return result.
7. **Migration edits needed proof of safety.** Read-only remote history and live table inspection confirm that the Phase 1 migration is still local-only. The plan contains a stop condition if that changes.
