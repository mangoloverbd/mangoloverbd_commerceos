# Sidebar Section Dividers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add subtle visual dividers below Order Protection, Business Report, and AI Analysis in the existing sidebar navigation.

**Architecture:** Keep the existing navigation section arrays and route order unchanged. Add a divider at the start of the next rendered section, so the three existing boundaries produce dividers directly below the requested final items.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest.

## Global Constraints

- Preserve all existing sidebar labels, route order, active-state behavior, and permissions.
- Preserve the current unrelated uncommitted sidebar edits.
- Use the existing sidebar navigation renderer; do not add a new navigation system.
- Keep dividers subtle and compatible with collapsed and expanded sidebar states.

---

### Task 1: Render and verify sidebar section dividers

**Files:**
- Modify: `src/components/nav-main.tsx`
- Test: `src/test/sidebarActiveStyle.test.ts`

**Interfaces:**
- Consumes: the existing `NavSection[]` passed from `AppSidebar`.
- Produces: a divider before Reports, Intelligence, and Social Inbox, which visually places it below Order Protection, Business Report, and AI Analysis.

- [x] **Step 1: Add a failing source regression test**

Assert that `nav-main.tsx` renders a divider class with a top border and that the section renderer applies it to each section after the first section.

- [x] **Step 2: Run the focused sidebar test and verify it fails**

Run: `npx vitest run src/test/sidebarActiveStyle.test.ts`

Expected: FAIL because the navigation renderer does not yet contain the divider class or section-boundary rendering.

- [x] **Step 3: Implement the divider in the section renderer**

Render each section with a wrapper. For sections after the first, add a subtle `border-t border-black/[0.08]` divider and vertical spacing before the section content. Keep the first section unchanged and avoid adding a divider after the final Social Inbox section.

- [x] **Step 4: Run the focused sidebar test and verify it passes**

Run: `npx vitest run src/test/sidebarActiveStyle.test.ts`

Expected: PASS.

- [x] **Step 5: Run whitespace verification**

Run: `git diff --check`.

Expected: no output.
