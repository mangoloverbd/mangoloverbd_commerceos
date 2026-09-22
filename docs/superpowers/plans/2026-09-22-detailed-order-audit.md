# Detailed Order Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete inline, grouped, reason-aware order audit trail to every order editing surface.

**Architecture:** Add a service-role-only `order_activity_events` table and pure server helpers for validation, diffing, grouping, and presentation. Preserve `order_status_events` for compatibility and dual-read it for pre-rollout status history. Existing mutation routes emit detailed rows sharing a client-generated group ID, while dedicated view routes deduplicate meaningful views into 30-minute buckets.

**Tech Stack:** PostgreSQL/Supabase migrations, Express ESM, Supabase JS, React 18, TypeScript, TanStack Query, Vitest, Testing Library, Phosphor Icons.

## Global Constraints

- Resolve the authenticated user and fixed Mango Lover BD `org_id` for every route and query.
- Frontend requests use `apiFetch()` only.
- Detailed timelines remain inline near the top of regular, abandoned, and inbox order editors.
- All staff with order access may expand exact before/after values.
- Do not infer or backfill historical activity.
- Use test-first red-green-refactor cycles.
- Do not modify unrelated local files.

---

### Task 1: Detailed activity schema and domain helpers

**Files:**
- Create: `supabase/migrations/20260922010000_detailed_order_activity.sql`
- Create: `server/orderActivity.js`
- Create: `src/test/orderActivity.test.ts`

**Interfaces:**
- Produces `ORDER_ACTIVITY_*` constants, `validateCancellationReason`, `validateAdditionReasons`, `buildOrderChanges`, `groupActivityEvents`, `meaningfulViewBucket`, and `buildDetailedActivityEvent`.
- Produces the append-only table and provenance/cancellation columns consumed by later tasks.

- [ ] Write failing unit tests for cancellation validation, addition-reason validation, field/item diffs, view buckets, grouping, and safe event construction.
- [ ] Run `npx vitest run src/test/orderActivity.test.ts` and confirm failures are caused by missing behavior.
- [ ] Implement the pure helpers with explicit allowlists and normalized output.
- [ ] Run the test file and confirm it passes.
- [ ] Add the additive migration with RLS, service-role-only grants, constraints, and indexes.
- [ ] Run `npm run verify:supabase-project` and `npm run verify:supabase-baseline`; record the known baseline blocker separately if unchanged.

### Task 2: Server writer, provenance, views, and dual-read timeline

**Files:**
- Modify: `server/index.js`
- Modify: `server/activityLog.js`
- Test: `src/test/orderActivityRouteWiring.test.ts`
- Test: `src/test/activityLog.test.ts`

**Interfaces:**
- Consumes Task 1 helpers and table.
- Produces `recordOrderActivity`, `POST /api/orders/:id/activity/view`, equivalent abandoned/inbox view routes, and richer timeline responses.

- [ ] Write failing route-wiring tests for auth, `org_id`, source-surface validation, 30-minute dedupe, provenance, staff lookups, and legacy-event fallback.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Add the retrying idempotent writer and view routes.
- [ ] Set immutable provenance for all existing order-creation paths without accepting provenance from clients.
- [ ] Extend timeline reads to return provenance and grouped detailed events while retaining real legacy events.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Grouped regular-order editing and required reasons

**Files:**
- Modify: `server/index.js`
- Modify: `src/pages/OrderDetail.tsx`
- Modify: `src/components/order-editor/CartPanel.tsx`
- Create: `src/components/order-editor/ChangeReasonSelect.tsx`
- Create: `src/lib/orderActivity.ts`
- Test: `src/test/orderDetailedAuditPage.test.tsx`
- Test: `src/test/orderDetailedAuditRoute.test.ts`

**Interfaces:**
- Consumes activity group IDs, cancellation codes, and addition reasons.
- Produces grouped customer, item, money, source-correction, status, cancellation, and reopening events.

- [ ] Write failing tests for inline cancellation reasons, mandatory item-add reasons, one group ID per save, exact before/after payloads, and source-origin immutability.
- [ ] Run focused tests and verify red.
- [ ] Add shared TypeScript labels/types and the inline reason selector.
- [ ] Track additions and quantity increases in the editor and block Save until each has a reason.
- [ ] Require cancellation reason inline when moving to Cancelled; require notes for Other.
- [ ] Send one UUID group ID through all parts of Save and invalidate the timeline query after success.
- [ ] Compare server-owned before/after rows and record detailed events; never trust client-supplied values as the audit before-state.
- [ ] Run focused tests and verify green.

### Task 4: Abandoned and inbox editing surfaces

**Files:**
- Modify: `server/index.js`
- Modify: `src/pages/AbandonedDetail.tsx`
- Modify: `src/pages/InboxOrders.tsx`
- Test: `src/test/abandonedDetailedAudit.test.tsx`
- Test: `src/test/inboxDetailedAudit.test.tsx`

**Interfaces:**
- Reuses Task 3 reason UI and Task 2 view endpoints.
- Produces detailed grouped edits and mandatory cancellation reasons on the remaining order-shaped surfaces.

- [ ] Write failing tests for abandoned customer/cart edits, addition reasons, meaningful views, inbox notes/variant/value/status changes, and inbox cancellation reasons.
- [ ] Run focused tests and verify red.
- [ ] Add group IDs, addition reasons, cancellation controls, view calls, and timeline invalidation.
- [ ] Record server-computed before/after events with `org_id` guards.
- [ ] Run focused tests and verify green.

### Task 5: Rich inline timeline and provenance presentation

**Files:**
- Modify: `src/components/OrderActivityTimeline.tsx`
- Modify: `src/lib/activityLogPresentation.ts`
- Modify: `src/pages/ActivityLog.tsx`
- Test: `src/test/orderActivityTimeline.test.tsx`
- Test: `src/test/activityLogPage.test.tsx`

**Interfaces:**
- Consumes grouped timeline API data.
- Produces inline provenance, five-row collapsed history, expandable groups and changes, and summary-only global feed entries.

- [ ] Write failing component tests for provenance, collapsed count, View all, reason display, exact before/after expansion, actor kinds, and existing-history marker.
- [ ] Run focused tests and verify red.
- [ ] Implement the inline timeline with Phosphor light icons and existing luxury-minimal styling.
- [ ] Extend global labels and filters without exposing exact customer values in report rows.
- [ ] Run focused tests and verify green.

### Task 6: Operational events and net upsell attribution

**Files:**
- Modify: `server/index.js`
- Modify: `server/reports.js`
- Modify: `src/lib/staffPerformancePresentation.ts`
- Modify: `src/pages/StaffPerformance.tsx`
- Test: `src/test/orderOperationalActivity.test.ts`
- Test: `src/test/staffReport.test.ts`
- Test: `src/test/staffPerformancePage.test.tsx`

**Interfaces:**
- Produces fraud, message, courier, and print events for existing routes.
- Produces retained net upsell count/value per staff member.

- [ ] Write failing tests for successful and failed operations plus net upsell reductions after removal, quantity reduction, replacement, or discount.
- [ ] Run focused tests and verify red.
- [ ] Instrument existing operational routes with summaries and safe metadata.
- [ ] Aggregate net upsell attribution from typed detailed changes and expose it in Staff Performance.
- [ ] Run focused tests and verify green.

### Task 7: Verification and migration review

**Files:**
- Modify only files required by failures discovered during verification.

- [ ] Run all focused detailed-audit tests.
- [ ] Run `npm test`.
- [ ] Run `npm run lint` and confirm zero errors.
- [ ] Run `npm run build`.
- [ ] Verify the migration against throwaway PostgreSQL or a Supabase development branch, including constraints, indexes, grants, RLS, and meaningful-view uniqueness.
- [ ] Run Supabase security and performance advisors and distinguish pre-existing notices from introduced issues.
- [ ] Review the diff for endpoint auth, fixed-workspace guards, sensitive global summaries, and accidental unrelated files.

## Engineering review outcome

- Use a new activity table. Extending status rows would mix unrelated concepts and make grouped edits brittle.
- Keep existing mutation routes. A full editor RPC would duplicate mature validation and enlarge the blast radius.
- Group rows by a UUID generated once per Save. Server-side before-state remains authoritative.
- Use application events rather than triggers because triggers cannot know whether an addition was an upsell, correction, replacement, or customer request.
- Treat audit write failures as observable failures without lying about business state; require validation before critical cancellations.

## Self-review

- Coverage: provenance, views, cancellation, product reasons, grouped saves, all three editing surfaces, operational events, global summaries, and Staff Performance are assigned to tasks.
- Placeholders: none.
- Type consistency: `group_id`, `reason_code`, `reason_note`, `changes`, `metadata`, and `source_surface` are consistent across schema, server, and UI tasks.
