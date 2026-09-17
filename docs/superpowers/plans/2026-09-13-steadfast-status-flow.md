# Steadfast Status Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the approved Processing, In-Transit, and Flagged semantics to Steadfast orders while leaving other dashboard tabs and non-Steadfast classification unchanged.

**Architecture:** Keep the existing status filter module as the single classification boundary. Add a courier-specific Steadfast branch after terminal-state checks and before the legacy generic rules; do not modify the tab control or database schema.

**Tech Stack:** React 18, TypeScript, Vitest, existing `src/lib/orderStatusFilters.ts` classifier.

## Global Constraints

- Only orders with `courier_name === "steadfast"` receive the new courier-specific classification.
- Preserve existing terminal precedence for Delivered, Cancelled, and On Hold.
- Preserve all existing dashboard tabs.
- Do not add a database migration or change Steadfast API routes.

### Task 1: Add failing Steadfast classifier tests

**Files:**
- Modify: `src/test/orderStatusFilters.test.ts`

- [ ] Add tests proving Steadfast `Pending`, `In Review`, and `Pickup Requested` classify as Processing; warehouse movement and out-for-delivery states classify as In-Transit; fraud-risk Steadfast orders classify as Flagged; and a non-Steadfast order keeps its current result.
- [ ] Run `npm test -- src/test/orderStatusFilters.test.ts` and confirm the new expectations fail against the current generic classifier.

### Task 2: Implement the Steadfast-specific classification branch

**Files:**
- Modify: `src/lib/orderStatusFilters.ts`

- [ ] Extend the order input type with the existing persisted `courier_name` field.
- [ ] Add a Steadfast-only classification branch that uses the courier status to return Processing, In-Transit, or Flagged while retaining terminal-state precedence.
- [ ] Keep the current generic branch unchanged for non-Steadfast orders and legacy rows without a courier name.
- [ ] Run the focused test file and confirm all tests pass.

### Task 3: Full verification

**Files:**
- No additional files.

- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Review `git diff` and confirm only the requested classifier behavior and regression tests changed.
