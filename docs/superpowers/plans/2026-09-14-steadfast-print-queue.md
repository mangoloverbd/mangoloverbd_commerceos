# Steadfast Print Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep dispatched Steadfast orders in the Dashboard and Warehouse Print queues until the merchant manually changes their business status to Processing, while allowing terminal courier outcomes to leave Print automatically.

**Architecture:** Preserve the existing shared `classifyOrderStatus` boundary used by both Dashboard and Warehouse detail. Keep terminal precedence first, then make business status `print` authoritative for dispatched Steadfast orders; only a manually changed business status of `processing` re-enables courier-based Processing/In-Transit/Flagged classification. No server, schema, or UI duplication is needed.

**Tech Stack:** React 18, TypeScript, Vitest, existing order status classifier and dashboard/warehouse filters.

## Global Constraints

- Only dispatched Steadfast orders (`courier_name === "steadfast"` and `sent_to_courier === true`) receive the new Print hold; legacy rows without `courier_name` retain the existing courier-message fallback classification.
- Delivered, Cancelled, and Returned courier outcomes retain terminal precedence over the business Print status.
- Dashboard and Warehouse detail must continue using the shared classifier and must show identical buckets.
- Non-Steadfast and legacy rows retain their existing classification behavior.
- Do not add a database migration, API route, state field, or duplicate UI-specific classifier.

---

## File Map

- Modify `src/test/orderStatusFilters.test.ts` — regression coverage for the Print hold, terminal exceptions, manual Processing handoff, and non-Steadfast behavior.
- Modify `src/lib/orderStatusFilters.ts` — shared classification precedence used by Dashboard and Warehouse detail.
- Create `docs/superpowers/plans/2026-09-14-steadfast-print-queue.md` — this implementation plan; no application behavior lives here.

## Task 1: Add failing classifier regression tests

**Files:**
- Modify: `src/test/orderStatusFilters.test.ts`

**Interfaces:**
- Consumes: existing `order()` test factory and `classifyOrderStatus(order)`.
- Produces: executable expectations that define the new shared behavior before implementation.

- [ ] **Step 1: Change dispatched Steadfast Print expectations to stay in Print**

Update the existing Steadfast cases so these inputs expect `print`, not `processing` or `in_transit`:

```ts
[order("steadfast-pending", {
  status: "print",
  sent_to_courier: true,
  courier_name: "steadfast",
  courier_status: "Pending",
}), "print"],
[order("steadfast-in-review", {
  status: "print",
  sent_to_courier: true,
  courier_name: "steadfast",
  courier_status: "In Review",
}), "print"],
[order("steadfast-pickup-requested", {
  status: "print",
  sent_to_courier: true,
  courier_name: "steadfast",
  courier_status: "Pickup Requested",
}), "print"],
[order("steadfast-warehouse-movement", {
  status: "print",
  sent_to_courier: true,
  courier_name: "steadfast",
  courier_status: "Consignment received at CHITTAGONG WAREHOUSE",
}), "print"],
[order("steadfast-destination-dispatch", {
  status: "print",
  sent_to_courier: true,
  courier_name: "steadfast",
  courier_status: "Consignment sent to HATHAZARI. Dispatch ID: 17332372",
}), "print"],
[order("steadfast-destination-received", {
  status: "print",
  sent_to_courier: true,
  courier_name: "steadfast",
  courier_status: "Consignment has been received at HATHAZARI",
}), "print"],
[order("steadfast-picked-up", {
  status: "print",
  sent_to_courier: true,
  courier_name: "steadfast",
  courier_status: "Picked Up",
}), "print"],
```

- [ ] **Step 2: Add the Print-specific fraud and exception regression cases**

Add cases proving non-terminal fraud and courier exceptions cannot move a Print order out of Print:

```ts
[order("steadfast-print-fraud", {
  status: "print",
  sent_to_courier: true,
  courier_name: "steadfast",
  courier_status: "Pending",
  fraud_checked: true,
  fraud_data: { total_parcels: 10, total_delivered: 4, total_cancel: 6 },
}), "print"],
[order("steadfast-print-exception", {
  status: "print",
  sent_to_courier: true,
  courier_name: "steadfast",
  courier_status: "Unknown Approval Pending",
}), "print"],
```

- [ ] **Step 3: Add terminal and manual-handoff tests**

Add a focused test after the table-driven cases:

```ts
it("keeps Print until manual handoff, except for terminal courier outcomes", () => {
  expect(classifyOrderStatus(order("delivered", {
    status: "print",
    sent_to_courier: true,
    courier_name: "steadfast",
    courier_status: "Delivered",
  }))).toBe("delivered");

  expect(classifyOrderStatus(order("cancelled", {
    status: "print",
    sent_to_courier: true,
    courier_name: "steadfast",
    courier_status: "Cancelled",
  }))).toBe("cancelled");

  expect(classifyOrderStatus(order("returned", {
    status: "print",
    sent_to_courier: true,
    courier_name: "steadfast",
    courier_status: "Returned",
  }))).toBe("cancelled");

  expect(classifyOrderStatus(order("manual-processing", {
    status: "processing",
    sent_to_courier: true,
    courier_name: "steadfast",
    courier_status: "Pending",
  }))).toBe("processing");

  expect(classifyOrderStatus(order("manual-transit", {
    status: "processing",
    sent_to_courier: true,
    courier_name: "steadfast",
    courier_status: "Picked Up",
  }))).toBe("in_transit");

  expect(classifyOrderStatus(order("manual-flagged", {
    status: "processing",
    sent_to_courier: true,
    courier_name: "steadfast",
    courier_status: "Unknown Approval Pending",
  }))).toBe("flagged");
});
```

- [ ] **Step 4: Run the focused test and confirm it fails before the implementation**

Run:

```bash
npm test -- src/test/orderStatusFilters.test.ts
```

Expected: FAIL because the current Steadfast branch returns Processing/In-Transit/Flagged from courier state even when business status is `print`.

- [ ] **Step 5: Commit the failing test definition**

```bash
git add src/test/orderStatusFilters.test.ts
git commit -m "test: define Steadfast print queue hold"
```

## Task 2: Fix the shared Steadfast classification precedence

**Files:**
- Modify: `src/lib/orderStatusFilters.ts:103-139`

**Interfaces:**
- Consumes: `StatusFilterOrder`, including `status`, `courier_name`, `sent_to_courier`, courier status, fulfillment status, and fraud data.
- Produces: `classifyOrderStatus(order): OperationalOrderStatus`, used by both Dashboard and Warehouse detail filtering/counting.

- [ ] **Step 1: Make business Print authoritative after terminal checks**

In `classifyOrderStatus`, keep the existing cancelled and delivered checks first. Inside the existing dispatched Steadfast branch, add the business Print guard before fraud, hold, transit, and processing checks:

```ts
  const isExplicitSteadfastOrder = order.courier_name === "steadfast" && order.sent_to_courier === true;

  if (isSteadfastOrder(order)) {
    if (isExplicitSteadfastOrder && business === "print") return "print";
    if (business === "flagged" || STEADFAST_FLAGGED_STATES.has(courier) || isFraudFlagged(order)) {
      return "flagged";
    }
    if ([business, fulfillment, courier].some((value) => HOLD_STATES.has(value))) return "on_hold";
    if (isSteadfastTransitStatus(courier)) return "in_transit";
    if (business === "processing" || isSteadfastProcessingStatus(courier)) {
      return "processing";
    }
  }
```

This preserves terminal precedence because the guard remains after the existing cancelled/delivered checks. Removing `business === "print"` from the later Processing condition prevents a second path from changing the result. Leave the generic non-Steadfast branch unchanged.

- [ ] **Step 2: Run the focused regression test**

Run:

```bash
npm test -- src/test/orderStatusFilters.test.ts
```

Expected: PASS, including Print retention, terminal exceptions, manual Processing handoff, and existing non-Steadfast cases.

- [ ] **Step 3: Commit the classifier fix**

```bash
git add src/lib/orderStatusFilters.ts
git commit -m "fix: keep dispatched Steadfast orders in print"
```

## Task 3: Run full verification and inspect the final diff

**Files:**
- No additional application files.

**Interfaces:**
- Consumes: committed classifier and regression tests.
- Produces: verified behavior for both Dashboard and Warehouse because both call the same classifier.

- [ ] **Step 1: Run the complete test suite**

Run:

```bash
npm test
```

Expected: PASS with no unrelated test regressions.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS with no new lint errors.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS with a successful Vite production build.

- [ ] **Step 4: Confirm only intended files changed**

Run:

```bash
git status --short
git diff HEAD~2 -- src/lib/orderStatusFilters.ts src/test/orderStatusFilters.test.ts
```

Expected: the feature commits contain only the shared classifier and its regression tests; preserve the pre-existing `.gitignore` modification and the committed design/plan documents.
