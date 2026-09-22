# Overview Operational Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Overview’s Courier Performance card and replace Inbox Activity with a detailed Staff Performance card using the existing report visual language.

**Architecture:** Extend the existing authenticated `/api/overview` response with a workspace-scoped `staffPerformance` summary calculated in `server/overview.js`. Keep `socialInbox` in the response for compatibility. Render a new `StaffPerformancePanel` beside the enhanced `CourierPanel`; do not duplicate the full Staff Performance page or add a new route.

**Tech Stack:** Express, Supabase service client, React 18, TypeScript, Framer Motion, Phosphor Icons, Vitest, Testing Library.

## Global Constraints

- Keep the existing Overview date-range behavior and `/api/overview` endpoint.
- Preserve the existing `socialInbox` response data for compatibility, but stop rendering its Overview card.
- Use the current workspace `org_id` guard for the `user_roles` query.
- Keep the existing three-column desktop and stacked mobile layout.
- Use report-style typography, tabular numbers, soft neutral panels, subtle separators, and restrained motion.
- Preserve the current uncommitted sidebar reorder; do not overwrite or stage it in isolation.

---

### Task 1: Add the staff summary to the Overview data contract

**Files:**
- Modify: `server/overview.js`
- Modify: `server/index.js:3952-4021`
- Test: `src/test/overview.test.ts`

**Interfaces:**
- Consumes: the existing Overview order list and `user_roles` rows `{ user_id, display_name, deleted_at }`.
- Produces: `buildStaffPerformanceSummary(orders, staff, { since, until })` and the `/api/overview` `staffPerformance` response section.

- [ ] **Step 1: Write the failing aggregation test**

Add a test fixture with two staff members and orders covering assigned work, confirmed work, delivered work, out-of-range confirmation, and an unattributed order. Assert that the summary contains:

```ts
{
  assignedCount: 3,
  confirmedCount: 2,
  confirmedValue: 2200,
  confirmationRate: 2 / 3,
  deliveredRate: 1 / 2,
  topStaff: [
    { userId: "staff-1", name: "Ayesha", confirmedCount: 2, confirmedValue: 2200, deliveredRate: 0.5 },
  ],
}
```

- [ ] **Step 2: Run the server overview test and verify it fails**

Run: `npx vitest run src/test/overview.test.ts`

Expected: FAIL because `buildStaffPerformanceSummary` and the `staffPerformance` response section do not exist yet.

- [ ] **Step 3: Implement the summary helper**

In `server/overview.js`, add the exported helper. Filter by the supplied date interval using the existing Dhaka date conversion for order creation and confirmation timestamps. Count assigned orders by `assigned_to`, confirmed orders by `confirmed_by` and `confirmed_at`, and delivered confirmations using the existing delivered/partial-delivered courier classification. Calculate aggregate confirmation rate from confirmed assigned work divided by assigned work, delivered rate from delivered confirmations divided by confirmed confirmations, and rank non-empty staff by confirmed value descending with a three-row limit.

- [ ] **Step 4: Add the workspace-scoped staff query to `/api/overview`**

In `server/index.js`, load `user_roles` with:

```js
const { data: staffRows, error: staffError } = await supabase
  .from("user_roles")
  .select("user_id, display_name, deleted_at")
  .eq("org_id", orgId);
if (staffError) throw staffError;
```

Pass `staffRows || []` into `buildOverviewData`, and include the returned summary in the JSON response without removing `socialInbox`.

- [ ] **Step 5: Run the server overview tests and verify they pass**

Run: `npx vitest run src/test/overview.test.ts`

Expected: PASS, including existing Overview aggregation tests.

### Task 2: Replace Inbox Activity with Staff Performance UI

**Files:**
- Create: `src/components/overview/StaffPerformancePanel.tsx`
- Modify: `src/pages/Overview.tsx`
- Test: `src/test/overviewPanels.test.tsx`
- Test: `src/test/overviewOperationalPanels.test.ts`

**Interfaces:**
- Consumes: `OverviewData.staffPerformance` with aggregate metrics and up to three ranked staff rows.
- Produces: a responsive `StaffPerformancePanel` with summary metrics, ranked staff rows, and an empty state.

- [ ] **Step 1: Write the failing component and wiring tests**

Add tests that render `StaffPerformancePanel` and assert the `People` eyebrow, `Staff Performance` title, confirmed value, confirmed orders, delivered rate, and top staff name/value. Add an empty-state assertion for an empty `topStaff` list. Add a source wiring test asserting `Overview.tsx` imports `StaffPerformancePanel`, renders it with `data.staffPerformance`, and no longer imports or renders `SocialInboxPanel`.

- [ ] **Step 2: Run the focused UI tests and verify they fail**

Run: `npx vitest run src/test/overviewPanels.test.tsx src/test/overviewOperationalPanels.test.ts`

Expected: FAIL because the new component and Overview wiring do not exist.

- [ ] **Step 3: Implement `StaffPerformancePanel`**

Use a `motion.div` with the existing Overview panel shape. Render a `People` eyebrow and `Staff Performance` title, four compact metrics for Assigned, Confirmed, Confirmed value, and Delivered rate, then ranked rows showing staff name, confirmed value, confirmed orders, and delivered rate. Use `৳`, tabular numerals, and the same neutral backgrounds and separators used by Staff Performance and Business Report. Render `No staff-attributed activity` when `topStaff` is empty.

- [ ] **Step 4: Update Overview types and composition**

Add the `staffPerformance` TypeScript shape to `OverviewData`, import the new panel, and replace `<SocialInboxPanel data={data.socialInbox} />` with `<StaffPerformancePanel data={data.staffPerformance} />`. Keep the `socialInbox` type and response untouched for compatibility.

- [ ] **Step 5: Run the focused UI tests and verify they pass**

Run: `npx vitest run src/test/overviewPanels.test.tsx src/test/overviewOperationalPanels.test.ts`

Expected: PASS.

### Task 3: Make Courier Performance report-style and detailed

**Files:**
- Modify: `src/components/overview/CourierPanel.tsx`
- Test: `src/test/overviewPanels.test.tsx`

**Interfaces:**
- Consumes: the existing `courierPerformance` object.
- Produces: the same `CourierPanel` API with additional visible shipment totals and status details.

- [ ] **Step 1: Extend the failing panel assertions**

Assert that the panel renders total shipments, delivered, pending, failed, and in-transit values for the fixture couriers, while retaining courier names and overall success rate.

- [ ] **Step 2: Run the panel tests and verify the new assertions fail**

Run: `npx vitest run src/test/overviewPanels.test.tsx`

Expected: FAIL because the current panel does not expose total and pending details in its visible metric rows.

- [ ] **Step 3: Implement the detailed courier layout**

Keep the segmented status bar and existing success-rate calculation. Add a compact overall shipment summary and update each courier row to show all four status counts plus total shipments, using the same report-style labels, spacing, and tabular numerals as the Staff Performance and Business Report pages.

- [ ] **Step 4: Run the panel tests and verify they pass**

Run: `npx vitest run src/test/overviewPanels.test.tsx`

Expected: PASS.

### Task 4: Full verification

**Files:**
- Verify: all modified files from Tasks 1–3

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --reporter=dot`

- [ ] **Step 2: Run the production build**

Run: `npm run build`

- [ ] **Step 3: Run lint and whitespace checks**

Run: `npm run lint` and `git diff --check`.

- [ ] **Step 4: Confirm the existing sidebar reorder remains in the working tree**

Run: `git status --short` and verify the sidebar files remain present without being overwritten or discarded.
