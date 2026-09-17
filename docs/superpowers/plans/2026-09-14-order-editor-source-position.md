# Order Editor Source Position Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the editable Order source selector into the Order Editor customer-section header without changing the New Order creation page.

**Architecture:** Keep `OrderSourceSelect` and all source state, normalization, persistence, and disabled behavior unchanged. Change only the `CustomerPanel` layout so the existing source control renders in the header beside the customer identity/Edit action; remove its old standalone row from that panel.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Testing Library, Vitest.

## Global Constraints

- Modify only the Order Editor presentation; do not modify `src/pages/NewOrder.tsx`.
- Preserve the existing `OrderSourceSelect` options and `OrderSource` contract.
- Preserve source-only save behavior, including editing after courier dispatch.
- Use the existing Merchant-Suite design language and responsive Tailwind patterns.
- Do not add dependencies, database changes, or API changes.

---

### Task 1: Move the Order Editor source control into the header

**Files:**
- Modify: `src/components/order-editor/CustomerPanel.tsx:164-240`
- Test: `src/test/order-detail.test.ts`

**Interfaces:**
- Consumes: existing `CustomerPanelProps.source`, `onSourceChange`, and `sourceDisabled` values.
- Produces: the same accessible `Order source` control in the customer-section header, with the existing source callback and disabled state.

- [ ] **Step 1: Add a layout regression assertion**

Extend the existing Order Editor rendering test so it finds the `Customer and order` section, asserts the `Order source` control is inside that section header region, and asserts the old body-level source row is no longer rendered as a separate block. Keep the existing source editing and save assertions unchanged.

- [ ] **Step 2: Run the focused test and confirm the new assertion fails**

Run: `npm test -- src/test/order-detail.test.ts --reporter=dot`

Expected: the existing source behavior tests pass, while the new header-location assertion fails because the selector is currently rendered below the customer details.

- [ ] **Step 3: Move only the existing source markup**

In `CustomerPanel.tsx`, place the existing source label and `OrderSourceSelect` inside the header’s right-side flex group, before the customer name/Edit control. Give the selector a bounded responsive width, allow the header group to wrap on narrow screens, and remove the old block beginning with `{source && onSourceChange && (` below the customer detail/edit content. Do not change the source props or callbacks.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npm test -- src/test/order-detail.test.ts --reporter=dot`

Expected: all Order Editor tests pass, including source editing and source-only PATCH behavior after courier dispatch.

- [ ] **Step 5: Verify New Order remains unchanged**

Run: `git diff -- src/pages/NewOrder.tsx`

Expected: no output.

- [ ] **Step 6: Run final checks**

Run: `npm test -- --reporter=dot && npm run lint && npm run build && git diff --check`

Expected: tests pass, lint reports no errors, the production build succeeds, and the diff has no whitespace errors.

- [ ] **Step 7: Commit the implementation**

```bash
git add src/components/order-editor/CustomerPanel.tsx src/test/order-detail.test.ts
git commit -m "fix: reposition order source in editor"
```
