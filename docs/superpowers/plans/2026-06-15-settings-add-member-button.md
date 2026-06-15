# Settings Add Member Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Settings page Add Member submit button with the shared shadcn `Button` component while preserving existing form behavior.

**Architecture:** This is a single-component UI change in `src/components/TeamManagement.tsx`. The plan keeps the existing form submission logic and state handling intact, swapping only the visual button component and verifying the team management UI still builds and behaves correctly.

**Tech Stack:** React 18, TypeScript, Vite, shadcn/ui Button, Vitest, ESLint

---

## File Structure

- Modify: `src/components/TeamManagement.tsx` — replace the Add Member form submit control from `LiquidMetalButton` to shared `Button`
- Modify: `src/test/` only if an existing TeamManagement test file already covers this area and needs import or assertion updates; otherwise no test file changes are required for this pure presentational swap
- Verify: project lint/build commands from repository root

### Task 1: Replace the Add Member submit button

**Files:**
- Modify: `src/components/TeamManagement.tsx`

- [ ] **Step 1: Inspect whether a focused existing test covers TeamManagement button rendering**

Run: `rg -n "TeamManagement|button-create-member|Add Member" src/test src --glob '!src/components/TeamManagement.tsx'`
Expected: Either no focused tests exist, or you find an existing relevant test file to evaluate before changing code.

- [ ] **Step 2: If a focused TeamManagement UI test exists, write or update a failing assertion first; otherwise document that this change is a presentational swap and proceed with targeted verification**

If a relevant test exists, add a minimal assertion like:

```tsx
expect(screen.getByTestId("button-create-member")).toHaveTextContent("Add Member");
```

Run: `npm test -- --runInBand <existing-test-file>`
Expected: FAIL only if the assertion exposes the intended change gap; otherwise, if no such test file exists, proceed without adding a speculative test for this isolated visual swap.

- [ ] **Step 3: Replace `LiquidMetalButton` with shared `Button` in `src/components/TeamManagement.tsx`**

Use this exact replacement pattern:

```tsx
import { Button } from "@/components/ui/button";
```

and replace the submit control with:

```tsx
<Button
  type="submit"
  disabled={creating || !email.trim()}
  data-testid="button-create-member"
>
  {creating ? "Adding…" : "Add Member"}
</Button>
```

Also remove the obsolete import:

```tsx
import { LiquidMetalButton } from "@/components/ui/liquid-metal-button";
```

- [ ] **Step 4: Run targeted verification for the updated component**

Run: `npm run build`
Expected: PASS with no TypeScript or bundling errors caused by the component swap.

- [ ] **Step 5: Run lint verification**

Run: `npm run lint`
Expected: PASS with no new lint errors in `src/components/TeamManagement.tsx`.

- [ ] **Step 6: Commit the implementation change**

```bash
git add src/components/TeamManagement.tsx docs/superpowers/plans/2026-06-15-settings-add-member-button.md
git commit -m "fix: use shared button for add member action"
```
