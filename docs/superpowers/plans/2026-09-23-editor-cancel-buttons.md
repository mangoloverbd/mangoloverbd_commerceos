# Editor Cancel Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the primary Cancel action on both order editor flows with the BoardUI ghost button.

**Architecture:** Confirm the existing BoardUI button through its CLI, then replace only the two page-level native Cancel buttons with the shared `Button` component. Existing handlers and disabled states remain unchanged.

**Tech Stack:** React 18, TypeScript, BoardUI Button, Vitest, Testing Library.

## Global Constraints

- Change only the page-level Cancel actions in `CartPanel` and `NewOrder`.
- Preserve click behavior and disabled behavior.
- Keep note-popover and dialog Cancel buttons unchanged.

---

### Task 1: Use BoardUI ghost buttons for editor cancellation

**Files:**
- Modify: `src/components/order-editor/CartPanel.tsx`
- Modify: `src/pages/NewOrder.tsx`
- Modify: `src/test/cartPanel.test.tsx`
- Modify: `src/test/orderCreatorModal.test.tsx`

**Interfaces:**
- Consumes: `Button` from `@/components/base/buttons/button` with `variant="ghost"` and `size="medium"`.
- Produces: two visually consistent Cancel controls with unchanged callbacks.

- [ ] **Step 1: Confirm the BoardUI component**

Run: `npx boardui@latest add button --yes`

Expected: the existing BoardUI button files are confirmed or skipped without unrelated changes.

- [ ] **Step 2: Add failing tests**

In each existing page/component test, locate the main Cancel button and assert:

```tsx
expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("bg-button-ghost-background");
```

Where multiple Cancel buttons are rendered, scope the query to the persistent editor action area.

- [ ] **Step 3: Verify the tests fail**

Run: `npx vitest run src/test/cartPanel.test.tsx src/test/orderCreatorModal.test.tsx`

Expected: FAIL because both controls still use hand-written native-button classes.

- [ ] **Step 4: Replace the two buttons**

Import the shared component and render:

```tsx
<Button variant="ghost" size="medium" onClick={onCancel} disabled={saving}>Cancel</Button>
```

Use the corresponding existing navigation handler and `creating` disabled state in `NewOrder`.

- [ ] **Step 5: Verify and commit**

Run focused tests, `npm test`, `npm run build`, and `npm run lint`. Commit the component, page, tests, and this plan with `feat: use ghost cancel buttons in order editors`.
