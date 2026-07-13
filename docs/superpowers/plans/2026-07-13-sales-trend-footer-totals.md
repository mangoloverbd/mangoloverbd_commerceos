# Sales Trend Footer Totals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the Sales Trend Y-axis labels with the calendar rows and add selected-period new/existing customer revenue totals in the footer.

**Architecture:** Keep the change inside the existing `GitHubCalendar` component. Reuse the current selected-period date range to compute all totals from the existing `SalesTrendDay[]` data. Update the existing component test to lock the footer totals and customer labels.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, date-fns, Vitest, Testing Library.

---

## File Structure

- Modify `src/components/ui/git-hub-calendar.tsx`: compute selected-period customer totals, align the Y-axis with a seven-row CSS grid, and render footer totals left of the intensity legend.
- Modify `src/test/salesTrendCalendar.test.tsx`: add deterministic range data and assertions for the new footer totals.

### Task 1: Sales Trend Footer Totals And Axis Alignment

**Files:**
- Modify: `src/components/ui/git-hub-calendar.tsx`
- Test: `src/test/salesTrendCalendar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the test data in `src/test/salesTrendCalendar.test.tsx` with multi-day data and add a footer totals assertion:

```tsx
const days: SalesTrendDay[] = [
  {
    date: "2026-05-31",
    totalRevenue: 1000,
    newCustomerRevenue: 1000,
    existingCustomerRevenue: 0,
    totalOrders: 1,
    newCustomerOrders: 1,
    existingCustomerOrders: 0,
    intensity: 1,
  },
  {
    date: "2026-06-01",
    totalRevenue: 1200,
    newCustomerRevenue: 700,
    existingCustomerRevenue: 500,
    totalOrders: 2,
    newCustomerOrders: 1,
    existingCustomerOrders: 1,
    intensity: 4,
  },
];
```

Add this test in the same `describe("GitHubCalendar", ...)` block:

```tsx
it("renders selected-period customer revenue totals in the footer", () => {
  const { getByText } = render(<GitHubCalendar data={days} />);

  expect(getByText("New Customer Total")).toBeInTheDocument();
  expect(getByText("Existing Customer Total")).toBeInTheDocument();
  expect(getByText("৳1,700")).toBeInTheDocument();
  expect(getByText("৳500")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/test/salesTrendCalendar.test.tsx --run`

Expected: FAIL because `New Customer Total` and `Existing Customer Total` are not rendered yet.

- [ ] **Step 3: Compute customer totals in `GitHubCalendar`**

In `src/components/ui/git-hub-calendar.tsx`, replace the separate `computedTotalRevenue` calculation with a shared `selectedPeriodTotals` memo:

```tsx
const selectedPeriodTotals = useMemo(() => {
  return data
    .filter((day) => parseISO(day.date) >= selectedStartDate && parseISO(day.date) <= endDate)
    .reduce(
      (totals, day) => ({
        totalRevenue: totals.totalRevenue + day.totalRevenue,
        newCustomerRevenue: totals.newCustomerRevenue + day.newCustomerRevenue,
        existingCustomerRevenue: totals.existingCustomerRevenue + day.existingCustomerRevenue,
      }),
      { totalRevenue: 0, newCustomerRevenue: 0, existingCustomerRevenue: 0 }
    );
}, [data, endDate, selectedStartDate]);
const totalRevenue = range === "monthly" && monthlyRevenue != null ? monthlyRevenue : selectedPeriodTotals.totalRevenue;
```

- [ ] **Step 4: Align the Y-axis rows**

Change the Y-axis container in `src/components/ui/git-hub-calendar.tsx` from a spacing stack to a seven-row grid matching the calendar row rhythm:

```tsx
<div className="grid grid-rows-7 gap-[8px] pt-0.5 text-left text-[13px] leading-4 text-black/35">
  {["60k", "50k", "40k", "30k", "20k", "10k", "0k"].map((label) => (
    <div key={label} className="flex items-center gap-3">
      <span className="w-8">{label}</span>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-black/25" />
      <span className="h-px flex-1 border-t border-dotted border-black/20" />
    </div>
  ))}
</div>
```

- [ ] **Step 5: Render footer totals left of the legend**

Replace the footer block in `src/components/ui/git-hub-calendar.tsx` with:

```tsx
<div className="mt-4 flex flex-col gap-4 border-t border-black/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
  <div className="grid gap-4 text-[11px] font-medium uppercase tracking-[0.18em] text-black/35 sm:grid-cols-2">
    <div>
      <span className="block">New Customer Total</span>
      <span className="mt-1 block text-[15px] font-semibold tracking-normal text-black tabular-nums">
        {loading ? "—" : fmtBDT(selectedPeriodTotals.newCustomerRevenue)}
      </span>
    </div>
    <div>
      <span className="block">Existing Customer Total</span>
      <span className="mt-1 block text-[15px] font-semibold tracking-normal text-black tabular-nums">
        {loading ? "—" : fmtBDT(selectedPeriodTotals.existingCustomerRevenue)}
      </span>
    </div>
  </div>
  <div className="flex items-center gap-2 text-xs text-black/40">
    <span>Less</span>
    {colors.map((color) => <span key={color} className="h-3 w-3 rounded-[4px]" style={{ backgroundColor: color }} />)}
    <span>More</span>
  </div>
</div>
```

- [ ] **Step 6: Run the focused test to verify it passes**

Run: `npm test -- src/test/salesTrendCalendar.test.tsx --run`

Expected: PASS.

- [ ] **Step 7: Run build verification**

Run: `npm run build`

Expected: PASS with Vite production build completed.

## Self-Review

- Spec coverage: The plan covers footer totals, selected weekly/monthly/yearly range math, Y-axis alignment, no backend/API work, and tests.
- Placeholder scan: No TBD/TODO/fill-in steps remain.
- Type consistency: Uses existing `SalesTrendDay` fields and existing `fmtBDT`, `range`, `selectedStartDate`, and `endDate` names.
