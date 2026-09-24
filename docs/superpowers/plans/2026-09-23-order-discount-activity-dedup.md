# Order Discount Activity Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Remove the redundant lower order-discount detail from full Logs when its change is already represented by the total delta.

**Architecture:** The shared activity presentation layout will omit the order-discount field only when its delta exactly mirrors the opposite total delta and the event has no item or other field edits. Persisted activity and compact popovers remain unchanged, so the rule also cleans up historical full Logs entries.

**Tech Stack:** React, TypeScript, Vitest.

## Global Constraints

- Preserve the total before/after and signed delta.
- Preserve non-redundant order-discount details and all item change chips.
- Do not modify persisted activity events or compact popovers.

---

### Task 1: Suppress only the redundant full-Logs detail

**Files:**
- Modify: `src/lib/orderActivityPresentation.ts`
- Test: `src/test/orderActivityPresentation.test.ts`
- Test: `src/test/orderActivityTimeline.test.tsx`

- [x] Add failing tests for exact opposing total/discount deltas and the full Logs row.
- [x] Confirm the tests fail because `Order discount` remains in the details.
- [x] Implement cent-precision delta comparison and omit the redundant discount from the full-view layout only.
- [x] Run the focused presentation and timeline tests.
- [ ] Run the full test suite, production build, lint, and `git diff --check`.
