# Order Editor Logs Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an **Order details | Logs** switch to the regular order and abandoned checkout editors, with a sliding, live-updating Logs view.

**Architecture:** A shared `OrderEditorTabs.tsx` module provides URL-backed tab state (`?tab=logs`), the toolbar switch, and a slide container that keeps Order details mounted. `OrderActivityTimeline` gains a `full` variant that shows all events, a Live indicator, and 5-second polling. Both editors move the timeline out of `CustomerPanel` into the Logs view.

**Tech Stack:** React, React Router v6, TanStack Query v5, Framer Motion, react-aria segmented control, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-order-editor-logs-tab-design.md`

## Global Constraints

- No backend, route, or database changes.
- Inbox Orders and New Order stay unchanged.
- Existing compact timeline behavior stays the default for other callers.
- Switching tabs never unmounts the Order details view.
- Tab changes preserve other query parameters and router state.

---

### Task 1: Full, live timeline variant

**Files:** Modify `src/components/OrderActivityTimeline.tsx`; test `src/test/orderActivityTimeline.test.tsx`.

- [x] Add failing tests: `variant="full"` renders every event without the "View all activity" toggle, shows a Live indicator, and refetches after 5 seconds.
- [x] Run `npx vitest run src/test/orderActivityTimeline.test.tsx`; expect failures.
- [x] Implement the `variant` prop (`compact` default, `full` polls every 5 s, refetches on focus, shows all events and Live).
- [x] Re-run; expect pass.

### Task 2: Shared tabs and editor wiring

**Files:** Create `src/components/order-editor/OrderEditorTabs.tsx`; modify `src/pages/OrderDetail.tsx`, `src/pages/AbandonedDetail.tsx`; test `src/test/abandonedDetail.test.tsx`, `src/test/order-detail.test.ts`.

- [x] Add failing tests on both editors: switch renders with Order details selected; the customer panel has no activity timeline; selecting Logs shows the order activity view; `?tab=logs` opens on Logs; unapplied customer edits survive a round trip; other query parameters are preserved.
- [x] Run both test files; expect failures.
- [x] Implement `useOrderEditorTab`, `OrderEditorTabSwitch`, and `OrderEditorTabPanels`; place the switch in each toolbar; pass the full timeline as the Logs panel; remove the `activityTimeline` prop usage.
- [x] Re-run; expect pass.

### Task 3: Verification

- [x] `npx vitest run --exclude '.worktrees/**'`
- [x] `npm run build`
- [x] `npm run lint` (0 errors)
- [x] `git diff --check`
