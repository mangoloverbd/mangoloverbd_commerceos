# Mobile P&L and Storefront Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile dashboard P&L easier to scan by giving Revenue the only enlarged hierarchy and restore the existing mobile dock styling, without changing the desktop version.

**Architecture:** Keep the existing `FinanceMetric` component and desktop five-column grid unchanged. Add a mobile-only presentation wrapper that reuses the same metric content but orders it as a full-width Revenue hero followed by compact Net Profit, Ad Spend, Shipping, and COG cards. Restore only the existing `MobileBottomNav` mobile surface to its prior full-width treatment.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Framer Motion, Vitest, Testing Library.

## Global Constraints

- Mobile behavior targets widths below `768px`.
- Desktop layout and styles at `768px` and above must remain unchanged.
- Use existing analytics values, trends, loading states, and admin blur behavior.
- Keep all five P&L metrics visible on mobile without horizontal scrolling.
- Preserve the existing mobile destinations, routes, and accessible labels.
- Restore dock styling: `inset-x-0 bottom-0`, safe-area padding, warm gray translucent surface, top border, soft upward shadow, and backdrop blur.

---

### Task 1: Add a mobile P&L presentation wrapper

**Files:**
- Modify: `src/pages/Dashboard.tsx:269-410, 829-872`
- Test: `src/test/mobilePnlLayout.test.tsx`

**Interfaces:**
- Consumes: the existing `FinanceMetric` props and `analytics`, `metricSparklines`, and `trends` values from `Dashboard`.
- Produces: a mobile-only P&L arrangement with Revenue as the only enlarged card and Net Profit, Ad Spend, Shipping, and COG in a compact supporting grid; the current desktop grid remains the `md` and wider branch.

- [ ] **Step 1: Write the failing test**

Create `src/test/mobilePnlLayout.test.tsx` with a mocked `FinanceMetric` export only if needed to isolate ordering, or render the dashboard's P&L markup through the existing test harness. Assert that the mobile wrapper exposes the metrics in this order:

```tsx
expect(screen.getByTestId("mobile-pnl")).toHaveAttribute("data-order", "revenue,net-profit,ad-spend,shipping,cog");
expect(within(screen.getByTestId("mobile-pnl"), screen.getByText("Revenue"))).toBeInTheDocument();
expect(within(screen.getByTestId("mobile-pnl"), screen.getByText("Net Profit"))).toBeInTheDocument();
```

The test must also assert the existing desktop branch remains present with `data-testid="desktop-pnl"` and is marked `hidden md:grid`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/mobilePnlLayout.test.tsx`

Expected: FAIL because the mobile P&L wrapper and its ordering markers do not exist yet.

- [ ] **Step 3: Implement the mobile arrangement**

Extract the repeated metric prop objects into a local `metrics` array only if that does not change the existing desktop output. Render two branches inside the P&L panel:

```tsx
<div data-testid="desktop-pnl" className="hidden gap-3 md:grid md:grid-cols-5">
  {/* existing five FinanceMetric instances, unchanged */}
</div>
<div data-testid="mobile-pnl" data-order="revenue,net-profit,ad-spend,shipping,cog" className="grid gap-3 md:hidden">
  <div className="[&>div]:min-w-0">
    <FinanceMetric label="Revenue" ... />
  </div>
  <div className="[&>div]:min-w-0">
    <FinanceMetric label="Net Profit" ... />
  </div>
  <div className="grid grid-cols-2 gap-3">
    <FinanceMetric label="Ad Spend" ... />
    <FinanceMetric label="Shipping" ... />
    <div className="col-span-2 sm:col-span-1"><FinanceMetric label="Cost of Goods" ... /></div>
  </div>
</div>
```

Give the mobile Revenue card a stronger visual treatment through a mobile-only class or prop, not by changing the base `FinanceMetric` styles used by desktop. The Revenue value should be larger and full-width; Net Profit should be the next visual level. Keep trend text adjacent to each mobile value and preserve `—` for null data.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx vitest run src/test/mobilePnlLayout.test.tsx`

Expected: PASS with the requested metric order and both responsive branches present.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx src/test/mobilePnlLayout.test.tsx
git commit -m "feat: improve mobile pnl hierarchy"
```

### Task 2: Match the storefront dock styling

**Files:**
- Modify: `src/components/MobileBottomNav.tsx:1-58`
- Test: `src/test/mobileNavigation.test.tsx`

**Interfaces:**
- Consumes: existing `NavLink`, `useSidebar`, routes, labels, and icons.
- Produces: the same five mobile destinations and interactions with storefront-aligned dock presentation.

- [ ] **Step 1: Extend the failing test**

Add assertions to `src/test/mobileNavigation.test.tsx` that the navigation element has the storefront style hooks:

```tsx
const nav = screen.getByRole("navigation", { name: "Mobile navigation" });
expect(nav).toHaveClass("inset-x-0", "bottom-0", "backdrop-blur-xl", "md:hidden");
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run src/test/mobileNavigation.test.tsx`

Expected: FAIL because the current dock is full-width and uses the older gray surface treatment.

- [ ] **Step 3: Apply storefront dock styles without changing behavior**

Change only the mobile nav class list to use:

```tsx
className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-[#dedede]/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur-xl md:hidden"
```

Keep the existing route targets, active state, More button, icon weights, and `aria-label` values. Preserve `main` bottom padding so content cannot be covered by the inset dock.

- [ ] **Step 4: Run the focused navigation test**

Run: `npx vitest run src/test/mobileNavigation.test.tsx`

Expected: PASS with route, active-state, accessible-label, and class assertions.

- [ ] **Step 5: Commit**

```bash
git add src/components/MobileBottomNav.tsx src/test/mobileNavigation.test.tsx
git commit -m "fix: match storefront mobile dock styling"
```

### Task 3: Run regression verification

**Files:**
- Verify: `src/pages/Dashboard.tsx`, `src/components/MobileBottomNav.tsx`, and their tests.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all existing and new tests pass with zero failed tests.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: zero errors. Existing warnings may remain and must be reported if unchanged.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: Vite completes successfully.

- [ ] **Step 4: Check the final diff for desktop drift**

Run: `git diff main...HEAD -- src/pages/Dashboard.tsx src/components/MobileBottomNav.tsx src/components/DashboardLayout.tsx`

Confirm every new hierarchy or dock style is inside a mobile-only branch/class and the desktop five-card grid is unchanged.

- [ ] **Step 5: Commit any verified test-only adjustments**

```bash
git status --short
git diff --check
```

If verification produces no source changes, leave the tree clean and report the command results.
