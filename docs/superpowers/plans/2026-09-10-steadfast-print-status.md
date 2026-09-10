# Steadfast Print Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep successfully dispatched Steadfast orders in the Print tab with their consignment IDs until a user manually changes them to Processing.

**Architecture:** Preserve the order's business `status` as `print` in the single and bulk Steadfast API update payloads while retaining all courier metadata. Extend the existing shared Print transition rules and OrdersTable status options to permit the explicit `print -> processing` handoff; Pathao remains unchanged.

**Tech Stack:** Express.js, Supabase service client, React 18, TypeScript, Vitest.

## Global Constraints

- Preserve authentication and the fixed Mango Lover BD `org_id` guard on all server queries.
- Use the existing `apiFetch()` frontend API boundary; no new API calls are needed.
- Do not add a database migration.
- Leave Pathao dispatch behavior unchanged.
- Preserve the existing courier metadata fields and consignment ID display.

---

### Task 1: Lock down the status transition contract

**Files:**
- Modify: `src/test/orderTransitions.test.ts:37-43,80-98`
- Modify: `src/test/printStatusWiring.test.ts:6-16`
- Modify: `src/lib/orderTransitions.ts:27-37`
- Modify: `server/index.js:6624-6629`

**Interfaces:**
- `canLeavePrint(toStatus: string | null | undefined): boolean` must return true for `processing`.
- The server PATCH guard must treat normalized `processing` as an allowed destination from Print.

- [x] **Step 1: Write the failing transition tests**

In `src/test/orderTransitions.test.ts`, change the Print-exit test to expect `canLeavePrint("processing")` to be true and rename its description to include Processing. Add `processing` to the expected valid target assertions in the Print bulk transition test:

```ts
expect(canLeavePrint("processing")).toBe(true);
expect(planBulkStatusChange(orders, ["a"], "processing")).toEqual({
  validIds: ["a"],
  skipped: 0,
});
```

In `src/test/printStatusWiring.test.ts`, add a source assertion that the server Print guard contains `toStatus === "processing"`.

- [x] **Step 2: Run the focused tests and verify failure**

Run:

```bash
npx vitest run src/test/orderTransitions.test.ts src/test/printStatusWiring.test.ts
```

Expected: FAIL because `canLeavePrint("processing")` is currently false and the server source does not yet allow the destination.

- [x] **Step 3: Implement the minimal transition change**

In `src/lib/orderTransitions.ts`, add `normalized === "processing"` to the allowed destinations returned by `canLeavePrint`. In `server/index.js`, include `toStatus === "processing"` in the condition that permits a Print order to leave Print. Keep the existing Approved, Cancelled, and On Hold behavior intact.

- [x] **Step 4: Run the focused tests and verify they pass**

Run:

```bash
npx vitest run src/test/orderTransitions.test.ts src/test/printStatusWiring.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit the transition contract**

```bash
git add src/lib/orderTransitions.ts server/index.js src/test/orderTransitions.test.ts src/test/printStatusWiring.test.ts
git commit -m "feat: allow print orders to move to processing"
```

### Task 2: Keep Steadfast dispatches in Print

**Files:**
- Modify: `server/index.js:6775-6783,6861-6869`
- Modify: `src/components/OrdersTable.tsx:1177-1181`
- Modify: `src/pages/Dashboard.tsx:1077-1083`
- Modify: `src/test/printStatusWiring.test.ts:14-16`
- Modify: `src/test/dashboardBulkStatus.test.tsx:182-207`

**Interfaces:**
- `POST /api/send-to-courier` and `POST /api/send-to-courier/bulk` continue returning the updated order with `status: "print"` and courier metadata.
- The status dropdown for a Print order includes `processing`.

- [x] **Step 1: Write the failing dispatch and UI expectations**

In `src/test/printStatusWiring.test.ts`, replace the broad successful-send expectation with assertions that the Steadfast success update uses `status: "print"` at least twice and that the Pathao section still contains its existing `status: "processing"` update. Also assert the source contains `toStatus === "processing"` from Task 1.

In `src/test/dashboardBulkStatus.test.tsx`, change the mocked successful bulk result from `status: "processing"` to `status: "print"`. Change the expected counts to Print 1 and Processing 0 after the dispatch, and assert the row remains rendered in the Print view.

Add a source assertion to the appropriate existing OrdersTable wiring test (or `src/test/printStatusWiring.test.ts`) for `"print", "confirmed", "processing", "on_hold", "cancelled"`, proving the row-level manual option is exposed. Add `Processing` to the Dashboard bulk status menu and cover selecting it for a Print order in the existing dashboard bulk-status test.

- [x] **Step 2: Run the focused tests and verify failure**

Run:

```bash
npx vitest run src/test/printStatusWiring.test.ts src/test/dashboardBulkStatus.test.tsx
```

Expected: FAIL because the two Steadfast updates currently save `processing`, the bulk fixture moves the order out of Print, and the Print status menu omits Processing.

- [x] **Step 3: Implement the minimal dispatch/UI change**

In the single Steadfast update and bulk Steadfast update in `server/index.js`, change only the business status value from `"processing"` to `"print"`. Do not change the Pathao update below those routes. Keep `sent_to_courier`, `consignment_id`, `tracking_code`, `courier_status`, `courier_message`, and `courier_name` unchanged.

In `src/components/OrdersTable.tsx`, add `"processing"` to the Print order `statusOptions` array. In `src/pages/Dashboard.tsx`, add `{ id: "processing", label: "Processing" }` to the bulk status targets. Both use the existing status update and server PATCH flow.

- [x] **Step 4: Run the focused tests and verify they pass**

Run:

```bash
npx vitest run src/test/printStatusWiring.test.ts src/test/dashboardBulkStatus.test.tsx src/test/orderTransitions.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit the dispatch behavior**

```bash
git add server/index.js src/components/OrdersTable.tsx src/test/printStatusWiring.test.ts src/test/dashboardBulkStatus.test.tsx
git commit -m "fix: keep steadfast orders in print tab"
```

### Task 3: Full verification

**Files:**
- No new files.

- [x] **Step 1: Run the complete test suite**

Run:

```bash
npm test
```

Expected: PASS with no regressions in courier, dashboard, order routing, or status-filter tests.

- [x] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS with no new lint errors.

- [x] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS and produce the normal Vite build output.

- [x] **Step 4: Review the final diff**

Run:

```bash
git diff HEAD~2..HEAD -- server/index.js src/components/OrdersTable.tsx src/lib/orderTransitions.ts src/test/printStatusWiring.test.ts src/test/dashboardBulkStatus.test.tsx
```

Confirm no unrelated user changes were modified and that Pathao still writes `status: "processing"`.
