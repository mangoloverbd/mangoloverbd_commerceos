# Order Protection Risk Tabs Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Attempts, Lists, Accuracy, and Settings in Order Protection with the report-page visual system while preserving all existing risk APIs and leaving Reviews unchanged.

**Architecture:** Keep the existing `OrderProtection` tab state and typed `orderRisk` API wrappers. Recompose the four panels inline in `src/components/risk/RiskDashboard.tsx` using local presentational primitives (`RiskMetricCard`, `RiskSectionHeading`, `RiskDetailGroup`, and `RiskEmptyState`) that mirror the existing Staff Performance and Business Report styling. Do not add routes, backend changes, or a new API module.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, Phosphor Icons, Vitest, Testing Library, `apiFetch` through the existing `src/lib/orderRisk.ts` wrappers.

## Global Constraints

- Work only in `.worktrees/order-risk-engine-v2` on `feat/order-risk-engine-v2`.
- If `server/risk/links.js` or `src/test/orderRiskLinks.test.ts` contain unrelated work in progress, leave those changes untouched and unstaged.
- Keep `OrderProtectionReviewQueue` and the Reviews tab behavior unchanged.
- Reuse `src/lib/orderRisk.ts`; do not change API contracts, auth, database queries, scoring, or persistence.
- Use the report-page language: `bg-[#FAFAF8]`, `rounded-2xl`, light neutral surfaces, uppercase tracking labels, light tabular values, compact controls, and reduced-motion-aware Framer Motion transitions.
- Keep all new authenticated frontend requests behind the existing `apiFetch` wrappers.
- Preserve admin-only mutations and do not expose raw hashed identifiers.
- Add tests before implementation changes and keep the existing risk route/auth/workspace guard tests passing.

---

## File Map

- **Modify:** `src/components/risk/RiskDashboard.tsx` — local report-style primitives and the four panel layouts.
- **Modify:** `src/pages/OrderProtection.tsx` — only if tab semantics/layout need report-style alignment; do not change the Reviews component.
- **Modify:** `src/test/orderRiskDashboardPage.test.tsx` — focused interaction and presentation coverage for all four panels.
- **Create:** none; the approved design intentionally keeps the redesign inline in the existing component file.
- **Do not modify:** `src/components/OrderProtectionReviewQueue.tsx`, `src/lib/orderRisk.ts`, `server/index.js`, Supabase migrations, and the unrelated worktree changes.

---

### Task 1: Add failing dashboard coverage for the approved presentation and interactions

**Files:**
- Modify: `src/test/orderRiskDashboardPage.test.tsx`

**Interfaces:**
- Consumes the existing `OrderProtection` page and its mocked `fetchRisk*` functions.
- Produces assertions for the tab defaults, report metric labels, expandable attempt investigation, list controls, accuracy controls, and settings controls.

- [ ] **Step 1: Add deterministic fixtures for lists and settings**

Extend the existing hoisted mock object with a safe list entry and a settings save response:

```tsx
const listEntry = {
  id: "list-1",
  list: "block",
  kind: "phone",
  display_hint: "Phone ending 5678",
  reason: "Repeated checkout attempts",
  created_at: "2026-09-23T00:00:00Z",
  expires_at: null,
};

fetchRiskLists: vi.fn((list: "block" | "allow") => Promise.resolve({
  entries: list === "block" ? [listEntry] : [],
})),
updateRiskSettings: vi.fn().mockResolvedValue({
  mode: "shadow",
  haterDistrictIds: ["15"],
  extraAbuseTerms: [],
  districtOptions: [{ id: "15", name: "Rajshahi" }],
}),
```

Keep the current attempt and accuracy fixtures. Do not add hash fields or raw identity values.

- [ ] **Step 2: Add a failing Attempts presentation test**

```tsx
it("renders report-style attempt summaries and investigation", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("tab", { name: "Attempts" }));
  expect(await screen.findByText("Loaded attempts")).toBeInTheDocument();
  expect(screen.getByText("Held")).toBeInTheDocument();
  expect(screen.getByText("Blocked")).toBeInTheDocument();
  expect(screen.getByText("Average score")).toBeInTheDocument();

  await user.click(await screen.findByRole("button", { name: /Rahim.*40/ }));
  expect(await screen.findByText("Investigation")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mark genuine" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mark fake" })).toBeInTheDocument();
});
```

Keep the existing evidence and plain-language reason tests unchanged.

- [ ] **Step 3: Add failing Lists, Accuracy, and Settings tests**

```tsx
it("renders report-style list controls and entries", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("tab", { name: "Lists" }));
  expect(await screen.findByRole("button", { name: "Blocklist" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Allowlist" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByText("Phone ending 5678")).toBeInTheDocument();
  expect(screen.getByText("Repeated checkout attempts")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
});

it("renders accuracy summary cards and range controls", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("tab", { name: "Accuracy" }));
  expect(await screen.findByText("Assessments")).toBeInTheDocument();
  expect(screen.getByText("Hold rate")).toBeInTheDocument();
  expect(screen.getByText("Block precision")).toBeInTheDocument();
  expect(screen.getByText("Fake caught")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getAllByText("Not enough labels").length).toBeGreaterThan(0);
});

it("groups protection settings into labeled report sections", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("tab", { name: "Settings" }));
  expect(await screen.findByText("Protection mode")).toBeInTheDocument();
  expect(screen.getByText("Districts requiring review")).toBeInTheDocument();
  expect(screen.getByText("Additional abuse terms")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save settings" })).toBeInTheDocument();
});
```

- [ ] **Step 4: Run the focused test to confirm the new expectations fail**

Run:

```bash
npm test -- --run src/test/orderRiskDashboardPage.test.tsx
```

Expected: the new report-style labels/controls fail against the current plain panel markup, while the existing Reviews and investigation tests remain meaningful.

- [ ] **Step 5: Commit the tests**

```bash
git add src/test/orderRiskDashboardPage.test.tsx
git commit -m "test: cover order protection report tabs"
```

---

### Task 2: Add local report-style primitives and redesign Attempts

**Files:**
- Modify: `src/components/risk/RiskDashboard.tsx`
- Test: `src/test/orderRiskDashboardPage.test.tsx`

**Interfaces:**
- Add local `RiskMetricCard({ label, value, description, delay, reduceMotion })` for the report summary surface.
- Add local `RiskSectionHeading({ title, count, detail })` for report-style section headers.
- Add local `RiskDetailGroup({ title, items })` for expanded investigation details.
- Add local `RiskEmptyState({ children })` for consistent empty states.
- Preserve the existing `RiskSignalChips`, `RiskDetails`, and `RiskAttemptsPanel` exports and action behavior.

- [ ] **Step 1: Add the shared presentational primitives**

Use the exact visual conventions from the report pages:

```tsx
const riskMetricClass = "min-h-[92px] rounded-2xl bg-black/[0.04] px-5 py-3";
const riskLabelClass = "text-[8px] font-medium uppercase tracking-[0.3em] text-black";
const riskActionClass = "rounded-lg border border-black/15 px-3 py-2 text-xs hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-black";

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("en-BD");
}
```

Add these local components with concrete report markup:

```tsx
function RiskMetricCard({ label, value, description, delay, reduceMotion }: {
  label: string;
  value: string;
  description: string;
  delay: number;
  reduceMotion: boolean | null;
}) {
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : delay, duration: 0.35 }}
      className={riskMetricClass}
    >
      <p className={riskLabelClass}>{label}</p>
      <p className="mt-1 text-2xl font-light tabular-nums tracking-[-0.04em] text-black">{value}</p>
      <p className="mt-0.5 text-[11px] text-black/60">{description}</p>
    </motion.div>
  );
}

function RiskSectionHeading({ title, count, detail }: {
  title: string;
  count?: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 py-3">
      <h2 className="font-sf-display text-[15px] font-semibold tracking-normal text-black">{title}</h2>
      {count && <><div className="h-3.5 w-px bg-black/10" /><span className="text-[13px] tabular-nums text-black/60">{count}</span></>}
      {detail && <span className="hidden text-[11px] text-black/45 sm:inline">{detail}</span>}
    </div>
  );
}
```

Use `motion.div` with `useReducedMotion()` for metric/card entrance transitions. Keep values tabular and use the existing `formatRatio` helper for percentages.

- [ ] **Step 2: Derive scoped Attempts summary values**

Inside `RiskAttemptsPanel`, derive values from the currently loaded `attempts` array:

```ts
const heldCount = attempts.filter((row) => row.decision === "HOLD").length;
const blockedCount = attempts.filter((row) => row.decision === "BLOCK").length;
const averageScore = attempts.length === 0
  ? "—"
  : (attempts.reduce((sum, row) => sum + row.score, 0) / attempts.length).toFixed(1);
```

Label the cards so they describe loaded results, not all historical attempts.

- [ ] **Step 3: Recompose the Attempts panel**

Keep the existing decision `<select>`, loading effect, detail fetch, related attempts, `labelRiskAttempt`, and `addRiskListEntry` calls. Replace the plain list with:

- a report header containing the decision filter, loaded count, and `Older attempts` button;
- four `RiskMetricCard` surfaces;
- rounded expandable attempt cards with customer/timestamp/mode/decision/score/top signals;
- the existing `RiskDetails` investigation block inside the expanded region;
- the existing `Mark genuine`, `Mark fake`, `Block phone`, and `Block device` actions;
- report-style loading, error, and empty states.

Use `aria-expanded`, `aria-controls`, visible focus rings, and an explicit `Close investigation` action. Do not change the endpoint calls or response handling.

- [ ] **Step 4: Run the focused Attempts tests**

Run:

```bash
npm test -- --run src/test/orderRiskDashboardPage.test.tsx -t "attempt|shadow|reason"
```

Expected: PASS, including the existing evidence/plain-language reason assertions.

- [ ] **Step 5: Commit the Attempts redesign**

```bash
git add src/components/risk/RiskDashboard.tsx src/test/orderRiskDashboardPage.test.tsx
git commit -m "feat: redesign order protection attempts tab"
```

---

### Task 3: Redesign Lists with report-style controls and rows

**Files:**
- Modify: `src/components/risk/RiskDashboard.tsx`
- Test: `src/test/orderRiskDashboardPage.test.tsx`

**Interfaces:**
- Consumes the existing `fetchRiskLists(list)` and `deleteRiskListEntry(id)` calls.
- Produces the same `RiskListsPanel` export and the same block/allow selection behavior.

- [ ] **Step 1: Add list summary derivation and controls**

Keep the existing `list` state. Render a segmented control for `block` and `allow` with `aria-pressed`, followed by a report section heading showing the selected list and `entries.length`.

- [ ] **Step 2: Recompose entries as rounded report rows**

Render each `RiskListEntry` with:

- a `List type` label;
- the existing `entry.kind` and safe `entry.display_hint` fallback;
- `entry.reason` or the existing no-reason fallback;
- `created_at` formatted with `toLocaleString` when present;
- the existing Remove action and async error handling.

Use `divide-y` only inside a report surface, not as the entire page treatment. Do not add raw identity values.

- [ ] **Step 3: Use the shared empty state and preserve errors**

Show `No entries.` inside a centered `RiskEmptyState` when the selected list is empty. Keep the error paragraph as `role="alert"`.

- [ ] **Step 4: Run the focused Lists tests**

Run:

```bash
npm test -- --run src/test/orderRiskDashboardPage.test.tsx -t "list"
```

Expected: PASS for tab switching, list controls, safe entry rendering, and removal behavior.

- [ ] **Step 5: Commit the Lists redesign**

```bash
git add src/components/risk/RiskDashboard.tsx src/test/orderRiskDashboardPage.test.tsx
git commit -m "feat: redesign order protection lists tab"
```

---

### Task 4: Redesign Accuracy with report summary cards and signal rows

**Files:**
- Modify: `src/components/risk/RiskDashboard.tsx`
- Test: `src/test/orderRiskDashboardPage.test.tsx`

**Interfaces:**
- Consumes `fetchRiskAccuracy(days)` and the existing `RiskAccuracy` type.
- Produces the same `RiskAccuracyPanel` export and 7/30-day behavior.

- [ ] **Step 1: Add report metric values**

Use the existing response values without recalculating server metrics:

```ts
const cards = [
  ["Assessments", formatNumber(accuracy.overall.attempts), "Risk decisions evaluated"],
  ["Hold rate", formatRatio(accuracy.overall.holdRate), "Of all assessments"],
  ["Block precision", formatRatio(accuracy.overall.blockPrecision), "Confirmed fake among blocks"],
  ["Fake caught", formatRatio(accuracy.overall.fakeCaught), "Confirmed fake caught"],
] as const;
```

If the value is unknown, `formatRatio` must continue to render `Not enough labels`.

- [ ] **Step 2: Recompose the Accuracy panel**

Render a compact range control, a four-card summary grid, a labeled outcomes surface for held/blocked genuine customers and missed fake orders, and a signal-accuracy report section.

- [ ] **Step 3: Add lightweight signal precision bars**

For each fired signal, render its code, fired count, and `precisionFake` value. Use a neutral `bg-black/[0.08]` track and `bg-black/70` fill with `width: ${percentage}%`; render a textual value beside it so the information does not depend on color or bar width. Keep non-fired signals filtered as they are today.

- [ ] **Step 4: Preserve loading/error/empty behavior**

Keep `role="alert"` for request errors, `Loading accuracy…` while pending, and `No signals recorded in this period.` when no fired signals exist.

- [ ] **Step 5: Run the focused Accuracy tests**

Run:

```bash
npm test -- --run src/test/orderRiskDashboardPage.test.tsx -t "accuracy|unknown"
```

Expected: PASS for the existing `20.0%` and `Not enough labels` assertions plus the new summary labels.

- [ ] **Step 6: Commit the Accuracy redesign**

```bash
git add src/components/risk/RiskDashboard.tsx src/test/orderRiskDashboardPage.test.tsx
git commit -m "feat: redesign order protection accuracy tab"
```

---

### Task 5: Redesign Settings as grouped report panels

**Files:**
- Modify: `src/components/risk/RiskDashboard.tsx`
- Test: `src/test/orderRiskDashboardPage.test.tsx`

**Interfaces:**
- Consumes `fetchRiskSettings()` and `updateRiskSettings(settings)`.
- Produces the same `RiskSettingsPanel` export and the existing settings payload shape.

- [ ] **Step 1: Group the existing form controls**

Render three report surfaces inside the existing form:

1. `Protection mode` with the current select and short mode explanation.
2. `Districts requiring review` with the current checkbox grid and scroll boundary.
3. `Additional abuse terms` with the current one-per-line textarea behavior.

- [ ] **Step 2: Preserve state and save behavior**

Keep the existing `settings`, `error`, and `message` state, the `updateRiskSettings` payload, and the `Settings saved` status. Add disabled/loading feedback to the submit button while saving so repeated submissions are prevented.

- [ ] **Step 3: Match report feedback styles**

Render API errors with `role="alert"` and the success message with `role="status"`. Keep the existing labels and option values exactly (`off`, `shadow`, `active`).

- [ ] **Step 4: Run the focused Settings tests**

Run:

```bash
npm test -- --run src/test/orderRiskDashboardPage.test.tsx -t "settings"
```

Expected: PASS for the grouped labels, existing district selection, save success, and error handling.

- [ ] **Step 5: Commit the Settings redesign**

```bash
git add src/components/risk/RiskDashboard.tsx src/test/orderRiskDashboardPage.test.tsx
git commit -m "feat: redesign order protection settings tab"
```

---

### Task 6: Align tab composition and verify Reviews remains unchanged

**Files:**
- Modify: `src/pages/OrderProtection.tsx` only if needed for tab accessibility/layout
- Test: `src/test/orderRiskDashboardPage.test.tsx` and `src/test/orderProtectionPage.test.tsx`

**Interfaces:**
- Consumes the existing `OrderProtectionReviewQueue` and the four redesigned panel components.
- Produces the same default Reviews tab and same `/order-protection` route behavior.

- [ ] **Step 1: Verify the default tab and tab semantics**

Confirm the tab list still exposes Reviews, Attempts, Lists, Accuracy, and Settings; Reviews is selected initially; each non-Review panel still mounts only when selected; and the Reviews component is still rendered unchanged.

- [ ] **Step 2: Make only minimal page-shell adjustments**

If needed, add `aria-controls`/`id` relationships and a report-style `bg-[#FAFAF8]` page surface. Do not alter `OrderProtectionReviewQueue`, its actions, or its data loading.

- [ ] **Step 3: Run the page and route tests**

Run:

```bash
npm test -- --run src/test/orderRiskDashboardPage.test.tsx src/test/orderProtectionPage.test.tsx src/test/orderRiskDashboardRoutes.test.ts
```

Expected: PASS, with the existing Reviews default test and backend auth/workspace guard tests unchanged.

- [ ] **Step 4: Commit the page-shell adjustment if needed**

```bash
git add src/pages/OrderProtection.tsx src/test/orderRiskDashboardPage.test.tsx
git commit -m "style: align order protection tab shell"
```

If no page-shell change is needed, do not create an empty commit.

---

### Task 7: Full verification and diff review

**Files:**
- Review: all files changed by Tasks 1–6
- Do not stage: any unrelated worktree changes, including `server/risk/links.js` or `src/test/orderRiskLinks.test.ts` if present

- [ ] **Step 1: Inspect the diff and worktree state**

Run:

```bash
git status --short
git diff main...HEAD -- src/components/risk/RiskDashboard.tsx src/pages/OrderProtection.tsx src/test/orderRiskDashboardPage.test.tsx
```

Confirm no API, database, auth, or Reviews queue changes slipped into the diff and the two pre-existing files remain unstaged.

- [ ] **Step 2: Run the focused risk tests**

```bash
npm test -- --run src/test/orderRiskDashboardPage.test.tsx src/test/orderProtectionPage.test.tsx src/test/orderRiskClient.test.ts src/test/orderRiskDashboardRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

```bash
npm test -- --run
```

Expected: PASS.

- [ ] **Step 4: Run lint and build**

```bash
npm run lint
npm run build
```

Expected: both commands exit successfully.

- [ ] **Step 5: Review final acceptance criteria**

Confirm the four redesigned tabs use the report-page visual language, Reviews remains unchanged, all current actions still work, and loading/error/empty states are visible and accessible. Record any unrelated pre-existing worktree changes separately rather than modifying them.
