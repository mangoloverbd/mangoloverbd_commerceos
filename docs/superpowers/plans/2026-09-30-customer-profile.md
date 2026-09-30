# Customer profile implementation plan

> **For agentic workers:** Execute inline using executing-plans. Use test-first cycles and review checkpoints.

**Goal:** Add an actionable customer profile for order handling and repeat sales.

**Architecture:** Existing order records remain authoritative. Express resolves one workspace, performs indexed phone matching and builds a profile with pure helpers. Separate server-only context/notes tables persist staff data without changing past orders.

**Tech Stack:** React 18, React Router v6, TanStack Query v5, Express ESM, Supabase/Postgres, Vitest and Testing Library.

## Global constraints

- All frontend API calls use `apiFetch()`; route handlers validate auth and scope every relevant query by resolved `org_id`.
- Phosphor icons use `weight="light"`; warm off-white, Geist, borderless panels and ৳ amounts.
- No production migration/deployment, no customer-name-only matching, no fabricated collected revenue or message history.
- Keep the current 45-day lifecycle rule unchanged and label it as a rule, not an automatic action.

### Task 1: Identity, profile aggregation and validation

**Files:** `server/customers.js`, `server/customerProfile.js`, `src/test/customerProfile.test.ts`.

**Interfaces:** `customerKeyFor(row, kind)` returns normalized phone or stable row key. `buildCustomerProfile({ customerId, orders, inboxOrders, orderItems, now })` returns null for no match or a profile with summary, addresses, history, product patterns and suggestion. `validateCustomerContext(body)` and `validateCustomerNote(body)` reject unknown keys, invalid dates, excessive lengths and missing concurrency/idempotency fields.

- [ ] Write behavior tests using hand-derived values. A cancelled ৳900 order and delivered ৳500 order must produce orderValue=1400 and deliveredValue=500. Two phone-less orders with the same name must produce separate keys.
  ```ts
  expect(customerKeyFor({ id: "a", customer_name: "Rina" }, "order")).toBe("order:a");
  expect(profile.summary.deliveredValue).toBe(500);
  ```
- [ ] Run `npm test -- src/test/customerProfile.test.ts` and observe failing assertions.
- [ ] Implement deterministic sorting and normalization, distinct outcomes, delivered-product aggregation and strict bounded validation.
- [ ] Rerun tests, including existing customer aggregation tests.

### Task 2: Persistence and targeted API reads

**Files:** CLI-generated migration in `supabase/migrations/`, `scripts/verify-supabase-baseline.mjs`, `server/index.js`, `src/test/customerProfileApi.test.ts`.

**Interfaces:** GET `/api/customers/:id` returns profile, context and bounded notes/history/activity with independent page metadata. PATCH `/api/customers/:id/context` accepts tags, followUpOn, followUpReason and expectedVersion. POST `/api/customers/:id/notes` accepts id and body.

- [ ] Write handler tests capturing the real route registration with controlled auth/database dependencies. Assert missing auth yields 401, unknown customer yields 404 and missing migration yields 503.
  ```ts
  expect(response.statusCode).toBe(401);
  expect(profileResponse.orders.total).toBe(3);
  expect(conflictResponse.statusCode).toBe(409);
  ```
- [ ] Confirm RED using `npm test -- src/test/customerProfileApi.test.ts`.
- [ ] Create migration with CLI. Add immutable phone normalizer, generated phone keys/indexes, server-only context/notes tables, version checks and append-only note grants. Add tables/security assertions to the canonical baseline verifier.
- [ ] Implement paged scoped reads, independently paged notes/events and conditional version updates. Return 422 validation errors, 409 conflicts and actionable 503 migration errors. Never write orders from these routes.
- [ ] Rerun API tests and `npm run verify:supabase-baseline` against ephemeral Postgres.

### Task 3: Customer page and staff workflow

**Files:** `src/lib/customerProfile.ts`, `src/pages/CustomerDetail.tsx`, `src/components/customer-profile/CustomerContext.tsx`, `src/App.tsx`, `src/test/customerDetail.test.tsx`.

**Interfaces:** Typed `CustomerProfileResponse`, history/activity page envelopes and context/note types. Page queries by customer id and independent history/activity/notes pages; mutations invalidate only relevant customer queries.

- [ ] Write tests for delivered-value labeling, missing-data display, saving a note, saving tags/follow-up, stale-write recovery, failed saves preserving drafts and history page navigation.
  ```ts
  await user.type(screen.getByLabelText("Internal note"), "Call after 6 pm");
  await user.click(screen.getByRole("button", { name: "Add note" }));
  expect(await screen.findByText("Call after 6 pm")).toBeInTheDocument();
  ```
- [ ] Observe RED, then build loading/error/retry states and responsive sections with accessible labels and keyboard actions. Reuse `CustomerSmsDialog` and existing fraud lookup UI without automatic paid checks.
- [ ] Rerun component tests.

### Task 4: Navigation and prefill integration

**Files:** `src/pages/Customers.tsx`, `src/components/CustomerDataTable.tsx`, `src/components/MobileCustomerCards.tsx`, `src/pages/NewOrder.tsx`, `src/pages/OrderDetail.tsx`, `src/test/customerProfileNavigation.test.tsx`.

- [ ] Test real name-link navigation separately from checkbox/copy behavior. Test saved list query/sort/page restoration and profile-to-order navigation.
- [ ] Observe RED. Add explicit profile links without changing bulk checkbox behavior. Persist queue state in route state, not browser-local PII storage.
- [ ] Initialize NewOrder name/phone/address from validated route state and preserve current lookup's fill-only-empty behavior.
- [ ] Add order-detail profile link from persisted order identity and return-to-profile navigation.
- [ ] Rerun navigation and existing customer phone-copy tests.

### Task 5: Verification and review

- [ ] Run full `npm test`, `npm run build`, TypeScript check and scoped lint. Compare full lint with known baseline failures.
- [ ] Run local migration baseline twice and SQL assertions for normalized international/formatting cases, grants, immutable notes and conditional version behavior.
- [ ] Run pre-landing review for auth/workspace guards and browser QA for desktop/mobile, pagination, notes, context, call/SMS and prefill. No SMS is actually sent during QA.
- [ ] Report migration path, test evidence and any environment blockers. Leave implementation on the feature branch without push/deployment.

## Engineering review

Architecture: reuse customer/SMS/fraud flows; isolate pure aggregation; use scoped server-only persistence. Phone-less name merging was verified in `server/customers.js` and rejected by the user. Indexed phone lookups were selected over workspace-wide profile scans.

Code quality: strict validation, shared identity helper, no parallel CRM order state, clear missing-migration handling and optimistic context updates. No further issues identified in the planned boundaries.

Tests: Vitest + Testing Library, real aggregation and actual route-handler execution. No new AI prompt or paid integration.

```
identity/metrics -> units: phone formats, same names, outcomes, recency, missing data
profile GET -> API: 401 / 404 / 503 / org guard / independent pagination
context PATCH -> API + UI: 422 / insert / version update / 409 / draft retained
note POST -> API + UI: validation / trusted author / retry idempotency / errors
list -> profile -> order -> profile -> list: navigation and preserved state
SQL -> local baseline: grants / normalization / indexes / repeat application
```

Performance: indexed phone/order lookup, chunked structured-item/event reads, bounded response pages and no N+1 per-order queries. API reads never cache private customer responses in public caches.

## GSTACK REVIEW REPORT

| Runs | Status | Findings |
|---|---|---|
| Architecture, code quality, tests, performance | Reviewed | Identity and lookup decisions confirmed by user; coverage included above |

VERDICT: Ready for test-first implementation; independent review pending.

NO UNRESOLVED DECISIONS
