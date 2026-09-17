# Create Order Direct-to-Approved Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manual Create Order submissions save with `status: "confirmed"` so they appear in the Approved tab.

**Architecture:** One-line frontend change in `src/pages/NewOrder.tsx:200`. The server already allowlists client `status` (`server/index.js:7191`) and the classifier maps `confirmed` to the `approved` filter, so no backend, migration, or contract change is needed.

**Tech Stack:** React 18 + TypeScript (strict), Vitest + Testing Library.

## Global Constraints

- Every new route that reads or writes user data MUST use the current Mango Lover BD workspace and preserve the `org_id` guard in all relevant queries — no new routes in this plan.
- Always use `apiFetch()` from `src/lib/api.ts` — no new API calls in this plan.
- Never commit `.env` or secrets.
- TypeScript strict — no `any` without a documented comment.

---

## File Structure

- Modify `src/pages/NewOrder.tsx:200` — POST body `status: "pending"` → `status: "confirmed"`.
- Modify `src/test/orderCreatorModal.test.ts:72` — extend the submit assertion to require `status: "confirmed"` and classify the resulting order into `approved`.

---

### Task 1: Direct-to-approved manual orders

**Files:**
- Modify: `src/pages/NewOrder.tsx:200`
- Test: `src/test/orderCreatorModal.test.ts`

**Interfaces:**
- Consumes: `POST /api/orders` (accepts `status`), `classifyOrderStatus` + `filterOrdersByStatus` from `src/lib/orderStatusFilters.ts`.
- Produces: manual orders with `status: "confirmed"`, visible under the Approved tab. No downstream consumers.

- [ ] **Step 1: Write the failing test**

In `src/test/orderCreatorModal.test.ts`, extend the submit-test assertion block (line 69-73) to:

```ts
    await waitFor(() => {
      const call = apiFetch.mock.calls.find(([requestUrl, requestInit]) => requestUrl === "/api/orders" && requestInit?.method === "POST");
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ source: "phone", status: "confirmed" });
    });
```

And append a new test at the end of the `describe("NewOrder")` block:

```ts
  it("classifies a created manual order into the approved filter", async () => {
    const { classifyOrderStatus, filterOrdersByStatus } = await import("@/lib/orderStatusFilters");
    const created = { id: "order-1", status: "confirmed" };

    expect(classifyOrderStatus(created)).toBe("approved");
    expect(filterOrdersByStatus([created], "approved")).toHaveLength(1);
    expect(filterOrdersByStatus([created], "pending")).toHaveLength(0);
  });
```

Note: `classifyOrderStatus` takes a minimal `{ status }` shape — verify against `src/lib/orderStatusFilters.ts` `StatusFilterOrder` type; if it requires more fields, include `sent_to_courier: false, courier_status: null` in the fixture.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/orderCreatorModal.test.ts`
Expected: FAIL — POST body contains `status: "pending"`, not `"confirmed"`

- [ ] **Step 3: Write minimal implementation**

In `src/pages/NewOrder.tsx:200`, change exactly:

```ts
          status: "pending",
```

to:

```ts
          status: "confirmed",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/orderCreatorModal.test.ts`
Expected: PASS

- [ ] **Step 5: Run full verification and commit**

Run: `npm test` (all suites PASS), `npm run lint` (0 errors), `npm run build` (succeeds).

```bash
git add src/pages/NewOrder.tsx src/test/orderCreatorModal.test.ts
git commit -m "feat: create manual orders directly as approved"
```
