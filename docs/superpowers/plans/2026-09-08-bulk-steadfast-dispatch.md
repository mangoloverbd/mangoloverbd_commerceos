# Bulk Steadfast Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a selected-order `Send to Steadfast` action to the Dashboard Print tab using Steadfast's native bulk-order API.

**Architecture:** `Dashboard` passes an explicit `isPrintView` flag to `OrdersTable`. The table owns bulk-dispatch UI state and calls one authenticated Merchant-Suite endpoint. `server/index.js` loads and validates selected orders within the fixed workspace, builds Steadfast's JSON-encoded bulk payload, applies item-level results, and returns successful records plus failures.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Express 5, Supabase service client, Steadfast Courier REST API.

## Global Constraints

- Use `apiFetch()` for every frontend API call.
- Every server order/order-item query must filter by the resolved Mango Lover BD `org_id`.
- Every new server endpoint must authenticate with `getToken(req)` and `getUser(token)`.
- Normalize Bangladeshi phone numbers with `normalizeBdPhone()` before sending to Steadfast.
- Use Steadfast `POST https://portal.packzy.com/api/v1/create_order/bulk-order` with a JSON-encoded `data` array and no more than 500 orders.
- Keep the Print selection actions exactly: `Selection`, `Send to Steadfast`, `Invoice`, `Print`, `Excel`, `Delete`, `Clear`.
- Do not add a schema migration, retry automation, send-all action, or storefront change.

---

## File Map

- Modify `src/pages/Dashboard.tsx`: pass the current Print-filter state to the orders table.
- Modify `src/components/OrdersTable.tsx`: render the Print-only bulk action, submit selected IDs, apply successful order responses, and preserve failed selection.
- Modify `server/index.js`: add the authenticated bulk dispatch route and shared bulk payload/result handling near the existing Steadfast route.
- Create `src/test/bulkSteadfastDispatch.test.tsx`: verify Print-only action visibility, request body, successful updates, and failure selection behavior.
- Modify `src/test/printStatusWiring.test.ts`: verify the server bulk route and Steadfast contract wiring.

### Task 1: Add failing frontend behavior tests

**Files:**
- Create: `src/test/bulkSteadfastDispatch.test.tsx`
- Modify: `src/test/dashboardBulkStatus.test.tsx` only if a shared fixture adjustment is required

**Interfaces:**
- Consumes: `Dashboard`, existing `apiFetch` mock, existing `OrdersTable` selection controls.
- Produces: executable expectations for the `isPrintView` prop and `POST /api/send-to-courier/bulk` response contract.

- [ ] **Step 1: Write the failing tests**

Add a focused Dashboard test with one `print` order and one `confirmed` order. Mock `/api/orders`, analytics, products, and the bulk endpoint. Cover these behaviors:

```tsx
it("shows only the requested Print selection actions", async () => {
  renderDashboardWithOrders([
    baseOrder({ id: "print-1", order_number: "#201", status: "print" }),
  ]);

  await user.click(await screen.findByRole("radio", { name: /Print.*1/ }));
  await user.click(screen.getByTestId("checkbox-order-print-1"));

  expect(screen.getByTestId("button-bulk-send-steadfast")).toBeInTheDocument();
  expect(screen.queryByTestId("button-bulk-fraud-check")).not.toBeInTheDocument();
  expect(screen.getByTestId("button-generate-invoice")).toBeInTheDocument();
  expect(screen.getByTestId("button-print-invoice")).toBeInTheDocument();
  expect(screen.getByTestId("button-delete-orders")).toBeInTheDocument();
  expect(screen.getByTestId("button-clear-selection")).toBeInTheDocument();
});

it("sends selected Print IDs to the bulk endpoint and applies successes", async () => {
  // Return { success: true, processed: 1, failed: 0,
  //   succeeded: [{ orderId: "print-1", orderNumber: "#201",
  //     order: { ...printOrder, status: "processing", sent_to_courier: true } }],
  //   failures: [] } from /api/send-to-courier/bulk.
  // Click the action and assert the request body is { orderIds: ["print-1"] }.
  // Assert Print count becomes 0 and Processing count becomes 1.
});

it("keeps failed Print IDs selected and reports item failures", async () => {
  // Return one failure with orderNumber "#201" and reason "Invalid phone number".
  // Click the action, assert the failure text is visible, and assert the row checkbox remains checked.
});
```

Use a Set-based `apiFetch.mockImplementation` so the existing Dashboard polling and analytics requests remain harmless. Give every order an `id` so the existing checkbox test IDs are deterministic.

- [ ] **Step 2: Run the tests and confirm the expected failure**

Run: `npm test -- src/test/bulkSteadfastDispatch.test.tsx`

Expected: FAIL because `Dashboard` does not pass `isPrintView`, the Print selection bar does not yet have `button-bulk-send-steadfast`, and `OrdersTable` still renders Fraud Check in the selection bar.

- [ ] **Step 3: Commit the red tests**

```bash
git add src/test/bulkSteadfastDispatch.test.tsx
git commit -m "test: specify bulk Steadfast dashboard action"
```

### Task 2: Implement the Print-only frontend action

**Files:**
- Modify: `src/pages/Dashboard.tsx:1110-1117`
- Modify: `src/components/OrdersTable.tsx:202-209, 547-575, 826-926, 1410-1499`

**Interfaces:**
- Consumes: `isPrintView: boolean` from `Dashboard`; backend response `{ succeeded, failures }`.
- Produces: `OrdersTable` prop `isPrintView`, test ID `button-bulk-send-steadfast`, and successful order updates through `onOrderUpdate`.

- [ ] **Step 1: Add the prop and failing-state implementation boundary**

Extend `OrdersTableProps` with `isPrintView: boolean`, pass `isPrintView={statusFilter === "print"}` from `Dashboard`, and add `isBulkSendingSteadfast` state in `OrdersTable`.

- [ ] **Step 2: Implement the bulk request handler**

Add `handleBulkSendToSteadfast` with this behavior:

```ts
const selectedPrintOrders = orders.filter(
  (order) => selectedIds.has(order.id) && isPrintStatus(order.status) && !order.sent_to_courier,
);
if (!selectedPrintOrders.length || isBulkSendingSteadfast) return;

const response = await apiFetch("/api/send-to-courier/bulk", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ orderIds: selectedPrintOrders.map((order) => order.id) }),
});
```

Parse JSON safely. On a non-OK response, throw the returned `error` and leave selection unchanged. For `succeeded`, call `onOrderUpdate` for every returned `order`. Remove only successful IDs from the selection. Keep failed IDs selected. Show a success toast when any order succeeds and an error toast containing failed order numbers/reasons when any order fails. Reset `isBulkSendingSteadfast` in `finally`.

- [ ] **Step 3: Render the exact Print selection bar**

Inside the existing `selectedIds.size > 0` action bar:

- Render `Send to Steadfast` only when `isPrintView` is true and at least one selected Print order is eligible.
- Use `data-testid="button-bulk-send-steadfast"` and a Steadfast logo plus `Spinner` while sending.
- Render Fraud Check only when `!isPrintView`.
- Keep Invoice, Print, Excel, Delete, and Clear unchanged.
- Disable the Steadfast action during the request and when no eligible Print order is selected.

Keep action order exactly: Selection, Send to Steadfast, Invoice, Print, Excel, Delete, Clear in Print view.

- [ ] **Step 4: Run the frontend tests and confirm they pass**

Run: `npm test -- src/test/bulkSteadfastDispatch.test.tsx src/test/dashboardBulkStatus.test.tsx`

Expected: PASS, including Print count removal after a successful response and failed-row selection retention.

- [ ] **Step 5: Commit the frontend change**

```bash
git add src/pages/Dashboard.tsx src/components/OrdersTable.tsx src/test/bulkSteadfastDispatch.test.tsx
git commit -m "feat: add Print bulk Steadfast action"
```

### Task 3: Add failing server contract tests

**Files:**
- Modify: `src/test/printStatusWiring.test.ts`

**Interfaces:**
- Consumes: `server/index.js` source.
- Produces: assertions for route authentication, 500-item validation, bulk endpoint path, JSON `data`, normalized phones, item descriptions, and org guards.

- [ ] **Step 1: Write the failing assertions**

Add tests that read `server/index.js` and assert it contains:

```ts
expect(server).toContain('app.post("/api/send-to-courier/bulk"');
expect(server).toContain('getUser(getToken(req))');
expect(server).toContain("orderIds.length > 500");
expect(server).toContain("/create_order/bulk-order");
expect(server).toContain('data: JSON.stringify(');
expect(server).toContain("normalizeBdPhone");
expect(server).toContain("item_description");
expect(server).toContain('.in("id", orderIds)');
expect(server).toContain('.eq("org_id", orgId)');
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- src/test/printStatusWiring.test.ts`

Expected: FAIL because the bulk route and documented request fields do not exist.

- [ ] **Step 3: Commit the red server tests**

```bash
git add src/test/printStatusWiring.test.ts
git commit -m "test: specify bulk Steadfast server contract"
```

### Task 4: Implement the authenticated Steadfast bulk route

**Files:**
- Modify: `server/index.js` near `POST /api/send-to-courier` at lines 6313-6387

**Interfaces:**
- Consumes: `POST /api/send-to-courier/bulk` with `{ orderIds: string[] }` and workspace-scoped Steadfast settings.
- Produces: `{ success, processed, failed, succeeded, failures }`, where successful entries include updated orders and failures include `orderId`, `orderNumber`, and `reason`.

- [ ] **Step 1: Validate and load the request**

At the top of the new route:

1. Authenticate with `const { user } = await getUser(getToken(req));` and return 401 when absent.
2. Resolve `supabase` and `orgId` with `getUserOrg(supabase, user.id)`.
3. Read `orderIds` as an array of non-empty strings. Return 400 for an empty array or more than 500 IDs.
4. Load orders with `.from("orders").select("*").in("id", orderIds).eq("org_id", orgId)`.
5. Create a failure entry for every requested ID not returned by Supabase.

- [ ] **Step 2: Build locally eligible courier items**

For each loaded order, add a failure instead of including it in the external request when:

- `normalizeBusinessStatus(order.status) !== "print"`;
- `isOrderDispatched(order)` is true; or
- `normalizeBdPhone(order.phone || "")` is null, not 11 characters, or does not start with `01`.

For each eligible order, call `getCourierOrderItems(supabase, orgId, order)` and build:

```js
{
  invoice: `ORD-${(order.order_number || order.id.slice(-8)).replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase()}`,
  recipient_name: (order.customer_name || "Customer").slice(0, 100),
  recipient_phone: cleanedPhone,
  recipient_address: (order.address || "No address provided").slice(0, 250),
  cod_amount: (parseFloat(order.price) || 0) + (parseFloat(order.delivery_rate) || 0),
  note: order.notes || undefined,
  item_description: formatCourierItems(courierItems),
}
```

Use a `Map` from invoice to `{ order, payload }` for safe response matching. If two eligible orders generate the same invoice, mark both as failures and exclude them from the external payload rather than risking a duplicate courier invoice.

- [ ] **Step 3: Call Steadfast’s native bulk endpoint**

Load `steadfast_api_key` and `steadfast_secret_key` once with `getOrgSettings(orgId, [...])`. Return the existing configuration error before any external request if either is missing.

When eligible payloads remain, call:

```js
fetch("https://portal.packzy.com/api/v1/create_order/bulk-order", {
  method: "POST",
  headers: { "Api-Key": apiKey, "Secret-Key": secretKey, "Content-Type": "application/json" },
  body: JSON.stringify({ data: JSON.stringify(payloads) }),
});
```

Treat a non-OK response, a non-array response body, or a response body whose `data` property is not an array as a request-level error. Accept both the documented top-level array and `{ data: [...] }` result shape.

- [ ] **Step 4: Apply item-level results safely**

For every eligible payload, locate the response row by `invoice`. A missing row becomes a failure. A row with `status !== "success"`, no `consignment_id`, or no `tracking_code` becomes a failure using the courier message when available.

For each valid success, update `orders` with:

```js
{
  status: "processing",
  sent_to_courier: true,
  consignment_id: String(result.consignment_id),
  tracking_code: result.tracking_code,
  courier_status: result.status,
  courier_message: "Sent to Steadfast successfully",
  courier_name: "steadfast",
}
```

Guard the update with `.eq("id", order.id).eq("org_id", orgId)`, then re-select the updated order with the same guards. If either database operation fails or no updated row is returned, report a failure rather than a success. Call `sendBulkSms(orgId, updated).catch(console.error)` only after a successful update.

- [ ] **Step 5: Return the stable result**

Return:

```js
{
  success: failures.length === 0,
  processed: succeeded.length,
  failed: failures.length,
  succeeded,
  failures,
}
```

Use `sendError(res, e)` for unexpected route errors so transport-level failures do not partially claim success.

- [ ] **Step 6: Run the server contract tests**

Run: `npm test -- src/test/printStatusWiring.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the backend change**

```bash
git add server/index.js src/test/printStatusWiring.test.ts
git commit -m "feat: add native bulk Steadfast dispatch endpoint"
```

### Task 5: Run full verification and review the diff

**Files:**
- No new files; inspect all changed files and the two committed specs/plans.

**Interfaces:**
- Consumes: completed frontend and backend implementation.
- Produces: verified build, lint, and test results.

- [ ] **Step 1: Run the focused feature tests**

Run: `npm test -- src/test/bulkSteadfastDispatch.test.tsx src/test/printStatusWiring.test.ts`

Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: PASS with no unhandled errors.

- [ ] **Step 3: Run lint and production build**

Run: `npm run lint && npm run build`

Expected: ESLint exits 0 and Vite produces `dist/` successfully.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff HEAD~4..HEAD -- src/pages/Dashboard.tsx src/components/OrdersTable.tsx server/index.js src/test`

Check that the diff has no raw frontend `fetch`, no service credentials in client code, no missing `org_id` guard, no non-Print bulk dispatch path, no Fraud Check in Print actions, and no unrelated formatting changes.

- [ ] **Step 5: Commit any final test-only correction**

If verification exposes a test or implementation defect, add only the necessary correction and run the affected command again before committing it with an imperative `fix:` message.
