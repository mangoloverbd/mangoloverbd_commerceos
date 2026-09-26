# Require Customer Details Before Order Approval Implementation Plan

> **For agentic workers:** Execute inline, test-first, in the current workspace.

**Goal:** Require a name, phone number, and delivery address before staff can approve an order through any supported path.

**Architecture:** Add a small pure server helper to identify missing approval fields and build a clear error response. Use it in the existing-order PATCH route, direct-approved manual order creation, and abandoned-checkout conversion. Preserve the failed checkout and surface its server error in the abandoned dashboard.

**Tech Stack:** Express, React 18, TypeScript, Vitest.

## Global Constraints

- Use `apiFetch()` for frontend API calls.
- Preserve authentication and resolved Mango Lover BD `org_id` guards on all server routes.
- Do not change pending/on-hold behavior or the existing phone normalization rules.
- Do not add a database migration.

---

### Task 1: Add and test approval-field validation

**Files:**
- Create: `server/orderApprovalDetails.js`
- Test: `src/test/orderApprovalDetails.test.ts`

**Interface:** `getMissingOrderApprovalFields(order)` returns an ordered `string[]` using labels `customer name`, `phone number`, and `delivery address`. A trimmed `customer_name` falls back to trimmed `contact_name`.

- [x] Write tests for complete details, whitespace-only missing values, non-text values, and `contact_name` fallback.
- [x] Run the focused test and confirm it fails before implementing the helper.
- [x] Implement the pure helper with the interface above.
- [x] Run the focused test and confirm all helper tests pass.

### Task 2: Enforce details on main order approval paths

**Files:**
- Modify: `server/index.js`
- Test: `src/test/orderSourceRouteWiring.test.ts` or a new `src/test/orderApprovalRouteWiring.test.ts`

- [x] Add failing route-wiring assertions for the existing-order and direct-approved creation guards.
- [x] Run the focused route test and confirm those assertions fail before implementing the guards.
- [x] Call the helper after the org-scoped order lookup on PATCH and before the order insert on POST; leave non-approved statuses unchanged.
- [x] Run the focused route tests and confirm they pass.

### Task 3: Enforce details on abandoned-checkout approval

**Files:**
- Modify: `server/index.js`
- Modify: `src/pages/Dashboard.tsx`
- Test: `src/test/abandonedCheckoutRouteWiring.test.ts`
- Test: `src/test/dashboardOrderStatusFilter.test.tsx`

- [x] Add failing tests proving that approved conversion checks effective name/address values plus checkout phone, and that validation failures remain selected and display the server message.
- [x] Run the focused tests and confirm they fail before implementing the guards.
- [x] Reject incomplete approved conversions before inserting the order or resolving the draft; preserve the existing pending/on-hold conversion behavior.
- [x] Preserve the approval validation message for failed bulk conversions and retain failed checkouts in the selection.
- [x] Run focused tests, the full test suite, lint, and production build.
