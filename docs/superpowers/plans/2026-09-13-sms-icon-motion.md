# SMS Action Icon and Dialog Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the SMS action icon with the supplied chat bubble SVG and add smooth, reduced-motion-aware Framer Motion transitions to the SMS composer.

**Architecture:** Keep `CustomerPanel` responsible for the action trigger and move the supplied SVG into a small reusable icon component. Keep Radix Dialog responsible for modal behavior while animating the dialog content wrapper inside its existing portal.

**Tech Stack:** React 18, TypeScript, Framer Motion, Radix Dialog, Vitest, Testing Library.

## Global Constraints

- Preserve the existing SMS action label, availability rules, API behavior, and dialog copy.
- Use the supplied SVG paths exactly, with `currentColor` for both fills.
- Preserve Radix focus management and modal semantics.
- Respect reduced-motion preferences.

---

### Task 1: Add the supplied SMS icon

**Files:**
- Create: `src/components/SmsBubbleIcon.tsx`
- Modify: `src/components/order-editor/CustomerPanel.tsx`
- Test: `src/test/customerPanel.test.tsx`

**Interfaces:**
- Produces `SmsBubbleIcon({ size?: number | string, className?: string })`.
- CustomerPanel continues exposing the accessible `Send SMS` button.

- [ ] **Step 1: Add the icon component**

Render the supplied 24px SVG viewBox with the two provided paths, `fill="currentColor"`, and a configurable square size.

- [ ] **Step 2: Replace the Phosphor icon**

Remove `ChatText` from the CustomerPanel imports and render `<SmsBubbleIcon size={15} />` in the existing SMS action.

- [ ] **Step 3: Verify the focused panel tests**

Run `npm test -- src/test/customerPanel.test.tsx` and confirm the SMS action still opens the composer.

- [ ] **Step 4: Commit the icon change**

```bash
git add src/components/SmsBubbleIcon.tsx src/components/order-editor/CustomerPanel.tsx src/test/customerPanel.test.tsx
git commit -m "feat: refresh order SMS action icon"
```

### Task 2: Animate SMS composer open and close

**Files:**
- Modify: `src/components/order-editor/IndividualSmsDialog.tsx`
- Test: `src/test/individualSmsDialog.test.tsx`

**Interfaces:**
- `IndividualSmsDialog` keeps the existing props and send behavior.
- Motion is internal to the dialog and does not change `onOpenChange` semantics.

- [ ] **Step 1: Add reduced-motion-aware animation**

Use `AnimatePresence`, `motion`, and `useReducedMotion`. Keep the existing Radix Dialog mounted with `forceMount`, render the form inside a keyed motion wrapper while open, and animate opacity plus a small scale/y offset on normal displays. Use opacity-only motion for reduced-motion users.

- [ ] **Step 2: Preserve the existing dialog contents**

Keep quick inserts, message length count, retry-safe error state, buttons, and focus behavior unchanged. Do not change the API request or success/error handling.

- [ ] **Step 3: Run focused dialog tests**

Run `npm test -- src/test/individualSmsDialog.test.tsx src/test/customerPanel.test.tsx` and confirm all existing assertions pass.

- [ ] **Step 4: Commit the motion change**

```bash
git add src/components/order-editor/IndividualSmsDialog.tsx src/test/individualSmsDialog.test.tsx
git commit -m "feat: animate individual SMS composer"
```

### Task 3: Verify the complete change

**Files:**
- Modify: none unless verification finds an issue.

- [ ] **Step 1: Run the full test suite**

Run `npm test`; expected result is all tests passing.

- [ ] **Step 2: Run lint and production build**

Run `npm run lint && npm run build`; expected result is zero lint errors and a successful Vite build.

- [ ] **Step 3: Review the final diff**

Run `git diff --check origin/main...HEAD` and confirm only the planned icon, dialog motion, tests, and docs changed.
