# New Order Customer Autofill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Autofill empty customer name and address fields from the latest order matching a valid phone number on the New Order page.

**Architecture:** Add a small authenticated, workspace-scoped lookup endpoint backed by the existing `orders` table and phone normalization helper. Add a focused React hook that queries by normalized phone and safely fills only blank fields, while ignoring stale responses.

**Tech Stack:** Express 5, Supabase JS, React 18, TypeScript, TanStack Query, Vitest, Testing Library.

## Global Constraints

- Frontend requests must use `apiFetch()`.
- The endpoint must authenticate the user and filter by the resolved Mango Lover BD `org_id`.
- The client must never send an organization identifier.
- Existing operator-entered name or address text must never be overwritten.
- Lookup failures must not block manual order creation.
- Use the latest matching order by `created_at`.

---

### Task 1: Customer lookup API

**Files:**
- Modify: `server/customers.js`
- Modify: `server/index.js` near the existing customer routes
- Test: `src/test/customers.test.ts`
- Test: `src/test/customersApiRoutes.test.ts`

**Interfaces:**
- Produces: `customerPhoneCandidates(phone): string[]`, returning local, `880`, and `+880` exact storage forms for a valid BD number, or `[]` for invalid input.
- Produces: `GET /api/customers/lookup?phone=<phone>` returning `{ customer: { customerName, address, lastOrderAt } | null }`.

- [x] **Step 1: Write failing helper and route contract tests**

```ts
expect(customerPhoneCandidates("01712345678")).toEqual([
  "01712345678",
  "8801712345678",
  "+8801712345678",
]);
expect(customerPhoneCandidates("invalid")).toEqual([]);
```

The route source test must assert authentication, `getUserOrg`, `.eq("org_id", orgId)`, `.in("phone", phoneCandidates)`, descending `created_at`, `.limit(1)`, and selection limited to customer fields.

- [x] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- src/test/customers.test.ts src/test/customersApiRoutes.test.ts`

Expected: FAIL because `customerPhoneCandidates` and `/api/customers/lookup` do not exist.

- [x] **Step 3: Add phone candidates and the authenticated route**

```js
export function customerPhoneCandidates(phone) {
  const normalized = normalizeCustomerPhone(phone);
  if (!normalized) return [];
  const international = `880${normalized.slice(1)}`;
  return [normalized, international, `+${international}`];
}
```

The route validates the phone, resolves the user and workspace, then runs:

```js
const { data, error } = await supabase
  .from("orders")
  .select("customer_name, address, created_at")
  .eq("org_id", orgId)
  .in("phone", phoneCandidates)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
```

Return `400` for an invalid phone, `{ customer: null }` for no match, and a camel-cased customer object for a match.

- [x] **Step 4: Run the focused tests and verify success**

Run: `npm test -- src/test/customers.test.ts src/test/customersApiRoutes.test.ts`

Expected: PASS.

### Task 2: New Order safe autofill

**Files:**
- Modify: `src/pages/NewOrder.tsx`
- Test: `src/test/orderCreatorModal.test.tsx`

**Interfaces:**
- Consumes: `GET /api/customers/lookup?phone=<normalizedPhone>`.
- Produces: automatic blank-field autofill and a visible `Previous customer found` status.

- [x] **Step 1: Write failing UI tests**

Add tests that mock the lookup response and verify:

```ts
expect(screen.getByRole("textbox", { name: "Customer name" })).toHaveValue("Rahim Uddin");
expect(screen.getByRole("textbox", { name: "Delivery address" })).toHaveValue("Dhanmondi, Dhaka");
expect(screen.getByText("Previous customer found")).toBeInTheDocument();
```

Add a second test that enters a name before completing the phone and verifies the lookup fills the empty address but preserves the typed name. Add tests for no match, a failed lookup, and a stale response that completes after the phone has changed. Add a reset assertion verifying **New customer** clears the values and match message.

- [x] **Step 2: Run the focused UI test and verify failure**

Run: `npm test -- src/test/orderCreatorModal.test.tsx`

Expected: FAIL because the customer lookup is not called and no match message exists.

- [x] **Step 3: Implement the lookup and safe form updates**

Use a TanStack query keyed by the normalized phone and enabled only when valid. Fetch with:

```ts
apiFetch(`/api/customers/lookup?phone=${encodeURIComponent(normalizedPhone)}`)
```

On successful data, first verify the result still belongs to the current normalized phone, then use functional state updates:

```ts
setCustomerName((current) => current.trim() ? current : customer.customerName || "");
setAddress((current) => current.trim() ? current : customer.address || "");
```

Track the matched phone for the confirmation message and clear it when the phone becomes invalid, changes, or **New customer** is clicked. A failed lookup renders no error and leaves the form usable.

- [x] **Step 4: Run the focused UI test and verify success**

Run: `npm test -- src/test/orderCreatorModal.test.tsx`

Expected: PASS.

### Task 3: Full verification

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes: completed API and New Order UI.
- Produces: verified feature with no regressions.

- [x] **Step 1: Run all tests**

Run: `npm test`

Expected: all tests pass.

- [x] **Step 2: Run lint**

Run: `npm run lint`

Expected: no new lint errors.

- [x] **Step 3: Run production build**

Run: `npm run build`

Expected: Vite completes successfully.

- [x] **Step 4: Review the final diff**

Confirm the route has authentication and `org_id` filtering, the frontend uses `apiFetch()`, and no existing values can be overwritten.

## NOT in scope

- Selecting among several old addresses. The latest matching order is the approved source.
- Autofilling products, payment method, notes, or order source. These values may not apply to the new order.
- Adding a customer-address table or database migration. Existing order data is sufficient for this feature.

## What already exists

- `normalizeCustomerPhone()` in `server/customers.js` already normalizes Bangladeshi customer numbers and will be reused.
- `normalizeBdPhone()` in `src/lib/bdPhone.ts` already decides when a phone entered in the UI is valid.
- Existing authenticated customer routes already show the required `getUser`, `getUserOrg`, and `org_id` guard pattern.
- `orderCreatorModal.test.tsx` already renders the New Order page and mocks `apiFetch()`.

## Coverage diagram

```text
Phone input
  ├─ invalid → lookup disabled → manual form unchanged
  └─ valid → authenticated lookup
       ├─ unauthorized → API 401 → UI silently keeps manual form usable
       ├─ invalid query → API 400 → UI silently keeps manual form usable
       ├─ no order → customer: null → fields unchanged
       ├─ server/network failure → fields unchanged
       └─ latest order found
            ├─ phone changed before result → stale result ignored
            ├─ name/address already typed → preserve typed values
            └─ empty name/address → autofill + show confirmation

New customer button → clear phone, name, address, and confirmation
```

## Failure modes

- A lookup can fail because of an expired session or network error. The query fails silently and manual order creation remains available; a UI test covers this.
- An older request can finish after the phone changes. The phone-key check prevents stale customer data from being applied; a UI test covers this.
- A valid phone may have no prior order. The endpoint returns `{ customer: null }`; API and UI tests cover this.
- The operator may type while a lookup is running. Functional state updates preserve non-empty fields; a UI test covers this.

## Parallelization

Sequential implementation, no parallelization opportunity. The API contract must exist before the UI integration is finalized, and the change is small.

## Implementation Tasks

- [x] **T1 (P2, human: ~45min / agent: ~10min)** — API — Add authenticated, workspace-scoped customer lookup.
  - Surfaced by: Architecture review of the approved feature.
  - Files: `server/customers.js`, `server/index.js`, `src/test/customers.test.ts`, `src/test/customersApiRoutes.test.ts`
  - Verify: `npm test -- src/test/customers.test.ts src/test/customersApiRoutes.test.ts`
- [x] **T2 (P2, human: ~60min / agent: ~15min)** — New Order — Add safe autofill with complete success and failure coverage.
  - Surfaced by: Test review gap for no-match, failure, and stale responses.
  - Files: `src/pages/NewOrder.tsx`, `src/test/orderCreatorModal.test.tsx`
  - Verify: `npm test -- src/test/orderCreatorModal.test.tsx`

## GSTACK REVIEW REPORT

| Run | Status | Findings |
|---|---|---|
| Scope challenge | PASS | Small change reuses existing customer and order flows. |
| Architecture | PASS | Auth, workspace guard, latest-order rule, and stale-response protection are explicit. |
| Code quality | PASS | No new service or abstraction is needed. |
| Tests | PASS AFTER REVISION | Added approved coverage for no match, request failure, stale response, preservation, and reset. |
| Performance | PASS | One indexed-style filtered lookup per valid phone; TanStack Query deduplicates the key. |
| Outside coverage | SKIPPED | No delegated reviewer was used for this small implementation. |

VERDICT: READY TO IMPLEMENT

NO UNRESOLVED DECISIONS
