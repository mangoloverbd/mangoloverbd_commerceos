# Staff Performance Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Staff Performance report’s regular/social tables with a Customers-style, regular-order-only performance-card view that expands staff details inline.

**Architecture:** Keep the authenticated `/api/reports/staff` request and its response unchanged. Move the client-only ranking and weighted team-snapshot calculations into a small pure presentation helper, then have `StaffPerformance.tsx` render that data as animated, responsive staff cards. Social Inbox data remains in the response but has no visual consumer on this page.

**Tech Stack:** React 18, TypeScript, TanStack Query v5, Framer Motion, Tailwind CSS, Phosphor Icons, Vitest, Testing Library.

## Global Constraints

- This is a frontend-only presentation change. Do not modify `server/index.js`, report SQL, migrations, attribution logic, or the `/api/reports/staff` response shape.
- Keep all authenticated frontend API calls through `apiFetch()`.
- Hide Social Inbox only in this page’s UI; retain the response data and server calculation for future reporting work.
- Preserve the fixed Mango Lover BD workspace behavior by leaving backend access unchanged.
- Use Phosphor Icons with `weight="light"` for new icons.
- Use the Customers/Warehouses white surfaces, subtle rounded metric trays, restrained Framer Motion, and `useReducedMotion()` behavior.
- Keep date filtering, staff filtering, refresh, missing-weight disclosure, loading, error, and empty states working.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/lib/staffPerformancePresentation.ts` | Pure types and deterministic regular-order ranking/snapshot calculations. |
| `src/pages/StaffPerformance.tsx` | Page layout, controls, animated summary cards, inline staff-card disclosure, and existing query states. |
| `src/test/staffPerformancePresentation.test.ts` | Unit coverage for confirmed-value sorting and weighted team rates. |
| `src/test/staffPerformancePage.test.tsx` | UI coverage for no Social Inbox rendering, summary cards, staff-card order, and inline details. |

### Task 1: Add deterministic presentation helpers

**Files:**
- Create: `src/lib/staffPerformancePresentation.ts`
- Create: `src/test/staffPerformancePresentation.test.ts`

**Interfaces:**
- Produces `ProductDetail`, `StaffMetrics`, and `StaffRow` types used by `StaffPerformance.tsx`.
- Produces `buildStaffPerformanceSnapshot(rows: StaffRow[]): StaffPerformanceSnapshot`.
- Produces `sortStaffPerformanceRows(rows: StaffRow[]): StaffRow[]`.
- Consumes the existing `orders` portion of each report row only; it must not read `social_inbox_orders`.

- [ ] **Step 1: Write the failing pure-helper tests**

Create `src/test/staffPerformancePresentation.test.ts` with a minimal fully-populated regular-order fixture and these assertions:

```ts
import {
  buildStaffPerformanceSnapshot,
  sortStaffPerformanceRows,
  type StaffRow,
} from "@/lib/staffPerformancePresentation";

it("ranks by confirmed value descending, then display name", () => {
  const rows = [
    makeRow({ display_name: "Zara", confirmed_value: 1200 }),
    makeRow({ display_name: "Asha", confirmed_value: 1200 }),
    makeRow({ display_name: "Rafi", confirmed_value: 1800 }),
  ];

  expect(sortStaffPerformanceRows(rows).map((row) => row.display_name))
    .toEqual(["Rafi", "Asha", "Zara"]);
  expect(rows.map((row) => row.display_name)).toEqual(["Zara", "Asha", "Rafi"]);
});

it("weights the team confirmation and delivery rates from totals", () => {
  const snapshot = buildStaffPerformanceSnapshot([
    makeRow({ assigned_count: 2, confirmed_assigned_count: 2, confirmed_count: 2, delivered_count: 2, confirmed_value: 2400 }),
    makeRow({ assigned_count: 8, confirmed_assigned_count: 4, confirmed_count: 4, delivered_count: 1, confirmed_value: 1200 }),
  ]);

  expect(snapshot).toEqual({
    confirmedValue: 3600,
    confirmedCount: 6,
    confirmationRate: 0.6,
    deliveredRate: 0.5,
  });
});
```

Use these local fixtures in that test file so every required API field is
present and `makeRow` can accept the metric overrides used above:

```ts
function metrics(overrides: Partial<StaffMetrics> = {}): StaffMetrics {
  return {
    assigned_count: 0, confirmed_count: 0, confirmed_assigned_count: 0,
    confirmed_value: 0, confirmed_kg: 0, confirmation_rate: null,
    average_order_value: null, cancelled_count: 0, cancelled_assigned_count: 0,
    cancelled_value: 0, cancellation_rate: null, delivered_count: 0,
    delivered_value: 0, delivered_rate: null, returned_count: 0,
    returned_value: 0, telesales_confirmed_count: 0,
    telesales_confirmed_value: 0, telesales_confirmed_kg: 0, products: [],
    ...overrides,
  };
}

function makeRow(
  { display_name = "Staff", ...orderOverrides }: Partial<StaffMetrics> & { display_name?: string } = {},
): StaffRow {
  return {
    user_id: `user-${display_name.toLowerCase()}`,
    display_name,
    is_active: true,
    orders: metrics(orderOverrides),
    social_inbox_orders: metrics({ confirmed_value: 99999 }),
  };
}
```

The non-zero Social Inbox placeholder demonstrates that the pure calculation
ignores social metrics.

- [ ] **Step 2: Run the new tests to verify they fail**

Run:

```bash
npm test -- --run src/test/staffPerformancePresentation.test.ts
```

Expected: module-resolution failure because `@/lib/staffPerformancePresentation` does not exist.

- [ ] **Step 3: Implement the presentation helper**

Create `src/lib/staffPerformancePresentation.ts` with the report types moved from the page and the following public behavior:

```ts
export type StaffPerformanceSnapshot = {
  confirmedValue: number;
  confirmedCount: number;
  confirmationRate: number | null;
  deliveredRate: number | null;
};

export function buildStaffPerformanceSnapshot(rows: StaffRow[]): StaffPerformanceSnapshot {
  const totals = rows.reduce((current, row) => ({
    confirmedValue: current.confirmedValue + Number(row.orders.confirmed_value || 0),
    confirmedCount: current.confirmedCount + Number(row.orders.confirmed_count || 0),
    assignedCount: current.assignedCount + Number(row.orders.assigned_count || 0),
    confirmedAssignedCount: current.confirmedAssignedCount + Number(row.orders.confirmed_assigned_count || 0),
    deliveredCount: current.deliveredCount + Number(row.orders.delivered_count || 0),
  }), { confirmedValue: 0, confirmedCount: 0, assignedCount: 0, confirmedAssignedCount: 0, deliveredCount: 0 });

  return {
    confirmedValue: totals.confirmedValue,
    confirmedCount: totals.confirmedCount,
    confirmationRate: totals.assignedCount > 0 ? totals.confirmedAssignedCount / totals.assignedCount : null,
    deliveredRate: totals.confirmedCount > 0 ? totals.deliveredCount / totals.confirmedCount : null,
  };
}

export function sortStaffPerformanceRows(rows: StaffRow[]): StaffRow[] {
  return [...rows].sort((left, right) =>
    Number(right.orders.confirmed_value || 0) - Number(left.orders.confirmed_value || 0)
      || left.display_name.localeCompare(right.display_name),
  );
}
```

Keep the page-facing metric fields exactly compatible with the current API response. Do not normalize or alter server values beyond safe numeric coercion used for aggregation and ordering.

- [ ] **Step 4: Run the helper tests to verify they pass**

Run:

```bash
npm test -- --run src/test/staffPerformancePresentation.test.ts
```

Expected: both ranking and weighted-rate tests pass.

- [ ] **Step 5: Commit the pure presentation unit**

```bash
git add src/lib/staffPerformancePresentation.ts src/test/staffPerformancePresentation.test.ts
git commit -m "feat: add staff performance presentation helpers"
```

### Task 2: Replace report tables with inline performance cards

**Files:**
- Modify: `src/pages/StaffPerformance.tsx`
- Modify: `src/test/staffPerformancePage.test.tsx`

**Interfaces:**
- Consumes `buildStaffPerformanceSnapshot`, `sortStaffPerformanceRows`, `StaffMetrics`, `StaffRow`, and `ProductDetail` from `src/lib/staffPerformancePresentation.ts`.
- Preserves `StaffReportResponse`, its TanStack Query key, `apiFetch('/api/reports/staff…')`, `StaffFilter`, and the existing error/loading paths.
- Produces a card disclosure button named `Show details for <staff name>` or `Hide details for <staff name>` with an `aria-expanded` state.

- [ ] **Step 1: Rewrite the page test around the approved card interaction**

Replace the existing test that expects both regular and Social Inbox tables with assertions for the new UI:

```tsx
function reportRow({
  user_id = RafiId,
  display_name = "Rafi",
  is_active = true,
  orders = metrics(),
  social_inbox_orders = metrics(),
}: {
  user_id?: string;
  display_name?: string;
  is_active?: boolean;
  orders?: ReturnType<typeof metrics>;
  social_inbox_orders?: ReturnType<typeof metrics>;
} = {}) {
  return { user_id, display_name, is_active, orders, social_inbox_orders };
}

it("renders ranked regular-order performance cards without Social Inbox and expands details inline", async () => {
  vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
    rows: [
      reportRow({ user_id: NadiaId, display_name: "Nadia", orders: metrics({ confirmed_value: 900, confirmed_count: 1 }) }),
      reportRow({ user_id: RafiId, display_name: "Rafi", orders: metrics({ confirmed_value: 1800, confirmed_count: 2, products: [{ product_id: "p1", product_name: "Mango", packs: 2, kg: 2 }] }) }),
    ],
  })));
  const user = userEvent.setup();

  renderPage();

  expect(await screen.findByText("Confirmed value")).toBeInTheDocument();
  expect(screen.getByText("Confirmed orders")).toBeInTheDocument();
  expect(screen.queryByText("Social Inbox")).not.toBeInTheDocument();
  expect(screen.getByTestId(`staff-performance-card-${RafiId}`)
    .compareDocumentPosition(screen.getByTestId(`staff-performance-card-${NadiaId}`)) & Node.DOCUMENT_POSITION_FOLLOWING)
    .toBeTruthy();

  await user.click(screen.getByRole("button", { name: "Show details for Rafi" }));
  expect(screen.getByRole("button", { name: "Hide details for Rafi" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Mango")).toBeInTheDocument();
  expect(screen.getByText("2 packs · 2 kg")).toBeInTheDocument();
});
```

Add a separate test with uneven per-staff rates that asserts the visible
snapshot rate is the weighted rate, not an arithmetic average:

```tsx
it("shows weighted team rates in the snapshot", async () => {
  vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
    rows: [
      reportRow({ orders: metrics({ assigned_count: 2, confirmed_assigned_count: 2, confirmed_count: 2, delivered_count: 2 }) }),
      reportRow({ user_id: NadiaId, display_name: "Nadia", orders: metrics({ assigned_count: 8, confirmed_assigned_count: 4, confirmed_count: 4, delivered_count: 1 }) }),
    ],
  })));

  renderPage();

  expect(await screen.findByTestId("staff-performance-summary-confirmation-rate")).toHaveTextContent("60%");
  expect(screen.getByTestId("staff-performance-summary-delivered-rate")).toHaveTextContent("50%");
});
```

Keep the existing coverage for missing weights, staff-filter request changes,
all-time request changes, and retry behavior.

- [ ] **Step 2: Run the page tests to verify the current table UI fails the new assertions**

Run:

```bash
npm test -- --run src/test/staffPerformancePage.test.tsx
```

Expected: failure because the page still renders `Social Inbox`, lacks summary cards, and has table-specific disclosure labels.

- [ ] **Step 3: Implement the card-based page**

In `src/pages/StaffPerformance.tsx`:

1. Replace local `ProductDetail`, `StaffMetrics`, and `StaffRow` declarations with imports from `staffPerformancePresentation.ts`.
2. Remove `Column`, `orderColumns`, `socialColumns`, `groupedColumns`, and `ReportTable` so there is no Social Inbox presentation path.
3. Add focused page-local components:
   - `SnapshotCard` for the four top-level metrics.
   - `StaffPerformanceCard` for one regular-order row and its inline disclosure detail.
   - A small grouped detail grid inside the expanded card for Assigned, Confirmed, Cancelled, Delivered, and Return/RTO values; retain confirmed product rows below it.
4. Derive `rankedRows` and `snapshot` with `useMemo`:

```tsx
const rankedRows = useMemo(() => sortStaffPerformanceRows(data.rows), [data.rows]);
const snapshot = useMemo(() => buildStaffPerformanceSnapshot(rankedRows), [rankedRows]);
```

5. Render the main success state in this order:
   - Customers/Warehouses-style white header and existing controls.
   - Four metric trays: Confirmed value, Confirmed orders, Confirmation rate, Delivered rate.
   - Existing missing-weight disclosure.
   - `Team performance` heading with the returned staff count.
   - A single-column `grid grid-cols-1 gap-3` queue of ranked `StaffPerformanceCard` components at every breakpoint.
6. Give each summary tile the IDs `staff-performance-summary-confirmed-value`, `staff-performance-summary-confirmed-orders`, `staff-performance-summary-confirmation-rate`, and `staff-performance-summary-delivered-rate`. Give each card `data-testid={`staff-performance-card-${row.user_id}`}`. The top card control must carry `aria-expanded`, `aria-controls`, and labels exactly matching the test contract.
7. Use `AnimatePresence`, `motion`, and `useReducedMotion()` for the page/card entrance and inline-detail transition. Keep motion short and avoid animation when reduced motion is preferred.
8. Preserve the current missing-weight, empty, loading, and retry states. Update only their container styling/copy as needed to match the new white page surface. Do not mention Social Inbox in any UI copy.

- [ ] **Step 4: Run the focused UI and helper suites**

Run:

```bash
npm test -- --run src/test/staffPerformancePresentation.test.ts src/test/staffPerformancePage.test.tsx src/test/staffPerformanceRouting.test.ts
```

Expected: all focused tests pass, including API filter regressions and the new inline-card behavior.

- [ ] **Step 5: Commit the visual redesign**

```bash
git add src/pages/StaffPerformance.tsx src/test/staffPerformancePage.test.tsx
git commit -m "feat: redesign staff performance cards"
```

### Task 3: Verify the completed frontend change

**Files:**
- Verify only; no planned production-source changes.

**Interfaces:**
- Verifies the public build still type-checks and bundles the existing protected route.
- Verifies no backend or migration behavior changed.

- [ ] **Step 1: Run the complete test suite**

Run:

```bash
npm test
```

Expected: all Vitest suites pass.

- [ ] **Step 2: Run lint and production build**

Run:

```bash
npm run lint
npm run build
```

Expected: lint exits successfully with no new errors, and Vite completes the production bundle.

- [ ] **Step 3: Inspect the final diff**

Run:

```bash
git diff origin/main...HEAD --check
git status --short
```

Expected: no whitespace errors and only intentional specification, helper, page, and test changes.

- [ ] **Step 4: Commit any verification-only documentation change if one was needed**

Do not create an empty commit. If implementation changed the approved behavior, amend the specification and commit that change with an accurate `docs:` message; otherwise leave the already-approved specification unchanged.

## Plan self-review

- **Spec coverage:** Task 1 supplies deterministic regular-order aggregation and ranking. Task 2 implements the header, four snapshot cards, Social Inbox removal, inline card detail, filtering continuity, responsive/motion behavior, and UI regression coverage. Task 3 verifies the complete frontend change.
- **Placeholder scan:** The plan has no deferred tasks or unspecified implementation steps. All code additions name their files, interfaces, test commands, and acceptance behavior.
- **Type consistency:** `StaffRow`, `StaffMetrics`, and `ProductDetail` originate in the helper module and are imported by the page. The tests use the same helper and page contracts, including the exact disclosure labels and card test IDs.
