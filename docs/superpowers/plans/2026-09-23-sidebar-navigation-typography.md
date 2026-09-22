# Sidebar Navigation Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make primary and nested sidebar navigation labels lighter and less black while keeping active navigation clear.

**Architecture:** Centralize the active and inactive label classes in `nav-main.tsx`, then reuse them across every expanded navigation branch. Leave icon, section, footer, disabled, layout, and selected-background styles untouched.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vitest.

## Global Constraints

- Inactive labels use `font-normal text-black/80`.
- Active labels use `font-medium text-black/90`.
- Inactive hover text uses `hover:text-black/85`.
- Nested navigation labels receive the same treatment.
- Icons, section headings, logo, spacing, selected backgrounds, and disabled styling remain unchanged.
- System Settings remains as the only footer control; the copyright text and help control are removed.

---

### Task 1: Soften sidebar navigation labels

**Files:**
- Modify: `src/components/AppSidebar.tsx`
- Modify: `src/components/nav-main.tsx`
- Modify: `src/test/sidebarActiveStyle.test.ts`

**Interfaces:**
- Consumes: existing `activeNavItemClass` and expanded navigation rendering branches.
- Produces: shared label treatment constants used by primary and nested navigation labels.
- Produces: sidebar section order of main navigation, Reports, Intelligence, then Social Inbox.
- Produces: no Billing & Plan sidebar item; System Settings remains visible.

- [x] **Step 1: Add a failing style regression test**

Assert that `nav-main.tsx` contains centralized active and inactive label treatments with the exact approved classes and no bold active-label override.
Assert that `AppSidebar.tsx` adds Reports before Intelligence.
Assert that Billing has no sidebar link or icon.

- [x] **Step 2: Run the focused test and confirm failure**

Run: `npx vitest run src/test/sidebarActiveStyle.test.ts`

Expected: failure because current labels use `font-medium text-black` and `!font-bold text-black`, Intelligence currently precedes Reports, and Billing still renders visible text.

- [x] **Step 3: Implement the shared treatments**

Add constants for `font-normal text-black/80 group-hover/nav-link:text-black/85` and `font-medium text-black/90`, then apply them to primary and nested label spans without changing containers or icons.
Reorder the existing section pushes so Reports precedes Intelligence and Social Inbox remains last.
Remove the Billing footer block while preserving the System Settings footer block.

- [x] **Step 4: Verify the focused test**

Run: `npx vitest run src/test/sidebarActiveStyle.test.ts`

Expected: pass.

- [x] **Step 5: Verify the project**

Run `npm test`, `npm run build`, `npm run lint`, and `git diff --check`.

- [ ] **Step 6: Commit**

Commit the plan, implementation, and regression test with `fix: soften sidebar navigation typography`.
