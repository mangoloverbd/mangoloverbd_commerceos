# Order Hold Reasons and Scheduled Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for inline execution. Steps use checkbox syntax for tracking.

**Goal:** Replace free-text hold notes with Bengali reasons, and automatically return customer-requested future-delivery holds to Pending the morning after their selected date.

**Architecture:** Store hold reason code, optional detail, and optional return date on `orders`, separate from the general `notes` field. Share the Bengali reason catalog and validation rules from `shared/orderHold.js` between UI and server. Require hold metadata through the detail editor, row status menu, and bulk hold actions. Extend the existing authenticated daily maintenance job to conditionally release due staff holds and write system status/activity history.

**Tech Stack:** React 18, TypeScript, Express, Supabase PostgreSQL, Vitest, Vercel Cron.

## Global Constraints

- Keep the existing general order `notes` field unchanged; it is used by invoice and courier flows.
- Require a valid reason on every staff-managed transition to On Hold; only `customer_requested_after_date` requires a return date.
- Treat the selected date as the last Bangladesh calendar day on hold; release on the next daily maintenance run at about 9:15 AM Asia/Dhaka.
- Preserve the reason and detail after release, and record the automated transition as a system status/activity event.
- Keep automated risk holds without a scheduled date unchanged; do not change social inbox order behavior.
- In the row cancellation dialog, show Bengali reason labels and place the menu above the trigger without changing stable cancellation codes; keep other dialog copy unchanged.
- Include hold reason, optional detail, and scheduled date in the same activity entry as each staff hold status change and automated release.
- Preserve authentication and the fixed Mango Lover BD `org_id` filter for every order query/update.
- Make no direct production schema changes unless the user explicitly approves; verify the canonical Supabase project and baseline before proposing the migration.
- Implement inline in the current session; do not delegate or commit the pre-existing dirty worktree.

---

### Task 1: Shared reasons, date rules, and failing unit tests

**Files:**
- Create: `shared/orderHold.js`
- Test: `src/test/orderHoldValidation.test.ts`

**Interfaces:**
- `ORDER_HOLD_REASONS` contains the ten approved stable codes, Bengali labels, and `requiresReturnDate` boolean.
- `validateOrderHoldDetails({ reasonCode, reasonDetail, holdUntilDate, currentDate })` returns `null` when valid or `{ code, error }` when invalid.
- `isScheduledOrderHoldDue(holdUntilDate, todayInDhaka)` returns true only when a valid date is earlier than today's Bangladesh date.
- `getBangladeshDateKey(date)` returns `YYYY-MM-DD` for `Asia/Dhaka`.

- [x] Write tests for all ten codes and labels, invalid codes, optional `other` detail, required/forbidden dates by reason, malformed dates, past dates, and the strict release boundary (selected date is not due on that date; it is due the next Bangladesh day).
- [x] Run `npm test -- --run src/test/orderHoldValidation.test.ts` and confirm the tests fail because the shared catalog/helpers do not exist.
- [x] Implement the shared catalog and pure validation/date helpers with the interfaces above.
- [x] Run the focused test and confirm all reason/date tests pass.

### Task 2: Add nullable order hold columns safely

**Files:**
- Create via `supabase migration new order_hold_metadata`: `supabase/migrations/<generated_timestamp>_order_hold_metadata.sql`
- Modify: `src/integrations/supabase/types.ts`
- Test: `src/test/orderHoldSchema.test.ts`

- [x] Invoke the Supabase and Supabase Postgres best-practices guidance before schema work.
- [x] Run `npm run verify:supabase-project` and `npm run verify:supabase-baseline` before creating the migration; stop if either reports a project/baseline mismatch.
- [x] Write a failing schema-wiring test for nullable `hold_reason_code`, `hold_reason_detail`, and `hold_until_date`, valid reason codes, and the date-required-only-for-`customer_requested_after_date` constraint. Existing orders must remain null and untouched.
- [x] Run the focused schema test and verify it fails before adding the migration.
- [x] Create the migration using the generated Supabase CLI filename; add nullable columns and constraints without data backfill or a default hold reason. Include the explicit non-null guard required by PostgreSQL CHECK semantics.
- [x] Add the three fields to `orders.Row`, `orders.Insert`, and `orders.Update` in the generated TypeScript definitions.
- [x] Run the schema test and `npm run verify:supabase-baseline`. The hold migration was later applied to production only after the user explicitly approved it to resolve the live schema-cache error; verify the applied schema and migration record.

### Task 3: Replace the Order Detail hold textarea

**Files:**
- Create: `src/components/orders/OrderHoldFields.tsx`
- Modify: `src/components/order-editor/CartPanel.tsx`
- Modify: `src/pages/OrderDetail.tsx`
- Test: `src/test/cartPanel.test.tsx`
- Test: `src/test/order-detail.test.ts`

- [x] Add failing component tests showing Bengali reason labels, a date input only for the customer-requested-after-date reason, optional detail only for Other, and no hold form for non-hold statuses.
- [x] Add a failing Order Detail test proving `status`, `hold_reason_code`, `hold_reason_detail`, and `hold_until_date` save together while `notes` remains unchanged.
- [x] Run the focused tests and confirm the new expectations fail before implementation.
- [x] Replace the On Hold textarea with `OrderHoldFields`; initialize its state from the saved order and include changed hold metadata in the same `apiFetch()` PATCH as the status.
- [x] Leave existing order notes intact; enforce required reason/date before sending the PATCH.
- [x] Run the focused component and Order Detail tests; confirm existing non-hold save flows still pass.

### Task 4: Require reason/date in row and bulk hold actions

**Files:**
- Create: `src/components/orders/OrderHoldDialog.tsx`
- Modify: `src/components/OrdersTable.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/WarehouseDetail.tsx`
- Modify: `src/lib/orderActivity.ts`
- Modify: `src/components/base/select/select.tsx`
- Test: `src/test/ordersTableCancellationAudit.test.ts`
- Test: `src/test/orderActivity.test.ts`
- Test: `src/test/orderActivityTimeline.test.tsx`
- Test: `src/test/ordersTableHoldAction.test.tsx`
- Test: `src/test/dashboardOrderStatusFilter.test.tsx`
- Test: `src/test/warehousePageRouting.test.tsx`

- [x] Write failing tests proving that choosing On Hold from a row opens the shared form and makes no PATCH until valid metadata is submitted.
- [x] Write failing bulk tests proving Dashboard and Warehouse share one reason/date across selected orders, reject invalid form values before sending any PATCH, and preserve existing per-order failure reporting for operational errors.
- [x] Run the focused tests and verify these behaviors fail against the current UI.
- [x] Add the shared dialog around `OrderHoldFields`; row actions submit one order, bulk actions submit each selected order with the same validated metadata.
- [x] Replace the cancellation dialog's native reason control with the shared select, open it above the trigger, and display Bengali labels and a Bengali empty prompt while keeping each option's existing code. Keep all other dialog copy English, and retain English reason labels on other screens.
- [x] Preserve current bulk behavior for Pending, Approved, cancellation, and all non-hold statuses.
- [x] Run all focused row, Dashboard, and Warehouse tests.

### Task 5: Enforce hold metadata in the authenticated API

**Files:**
- Modify: `server/index.js`
- Modify: `server/orderActivity.js`
- Modify: `src/lib/orderActivityPresentation.ts`
- Modify: `src/lib/orderActivityQuery.ts`
- Modify: `src/components/OrderActivityTimeline.tsx`
- Test: `src/test/orderHoldRouteWiring.test.ts`
- Test: `src/test/orderActivity.test.ts`
- Test: `src/test/orderActivityTimeline.test.tsx`

- [x] Add failing route-wiring assertions that `PATCH /api/orders/:id` validates the supported hold reason/date fields before updating and returns HTTP 400 with a stable error code for invalid metadata.
- [x] Run the focused route test and confirm the assertions fail before the API guard exists.
- [x] Allow only `hold_reason_code`, `hold_reason_detail`, and `hold_until_date` from the request; call the shared validator for staff transitions into On Hold and metadata edits to an active hold. Write reason/detail/date into the same detailed activity event as the status change.
- [x] Validate against `Asia/Dhaka` today; keep the existing authentication, org-scoped order lookup/update, optimistic-version check, and status/activity event behavior.
- [x] Confirm rejected requests make no order update and Pending/Approved/non-hold requests remain unaffected.
- [x] Run the focused route and order-source/approval route wiring tests.

### Task 6: Release due holds through existing daily maintenance

**Files:**
- Create: `server/orderHoldMaintenance.js`
- Modify: `server/index.js`
- Modify: `server/orderActivity.js`
- Modify: `src/lib/orderActivityPresentation.ts`
- Modify: `src/lib/orderActivityQuery.ts`
- Modify: `src/components/OrderActivityTimeline.tsx`
- Test: `src/test/orderHoldMaintenance.test.ts`
- Test: `src/test/orderHoldMaintenanceWiring.test.ts`

**Interface:** `releaseDueOrderHolds({ supabase, orgId, todayInDhaka, now, recordStatusEvent, recordOrderActivity })` returns the count of orders actually released.

- [x] Write failing maintenance tests for due vs. not-yet-due dates, no-date risk holds, orders no longer On Hold, retries, and duplicate cron executions.
- [x] Run the focused tests and confirm they fail before the maintenance function is added.
- [x] Query due orders with the fixed `org_id`, supported hold statuses, and `hold_until_date < todayInDhaka`.
- [x] For each candidate, conditionally update only if it is still On Hold and still due; write Pending and preserve reason/detail/date. Record status/activity events only for a row actually updated, with `actorKind: "system"`, the reason code, and scheduled date.
- [x] Render the automated release's Bengali reason and scheduled date in the same activity entry as its Pending status change.
- [x] Invoke the release pass from the existing CRON_SECRET-protected daily maintenance endpoint; include the released count in its response without changing the cron schedule.
- [x] Run focused maintenance tests and verify the maintenance route remains protected and workspace-scoped.

### Task 7: Full verification and final review

**Files:** all feature files above.

- [x] Add route-wiring regression coverage for `POST /api/orders`: an initial `on_hold` status must validate and persist structured hold metadata before insert, include the hold reason/detail/date in the creation activity, and reject hold metadata when the initial status is not On Hold.
- [x] Run the focused route test and confirm the new assertions fail before implementation.
- [x] Extend the authenticated order-creation route with the shared hold validator and normalized fields; preserve existing behavior for other statuses and pass the hold reason/date into the existing creation activity event.
- [x] Run the focused hold and order-creation tests, then repeat full verification.
- [x] Add regression coverage for bulk abandoned-checkout conversion to On Hold; require, persist, and include hold metadata in its creation/status activity entry.
- [x] Run focused hold tests, then `npm test`.
- [x] Run `npm run lint` and `npm run build`; record existing warnings separately from errors.
- [x] Run `npm run verify:supabase-project` and `npm run verify:supabase-baseline` again and confirm the user-approved migration is recorded in the linked project.
- [x] Review the final diff for fixed-workspace filtering, conditional release writes, no changes to general `notes`, all status-entry surfaces, and unchanged risk/system holds.
- [x] Leave all changes uncommitted; do not push or deploy.
