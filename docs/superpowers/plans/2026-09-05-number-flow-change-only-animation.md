# NumberFlow Change-Only Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the complete P&L section stable across route navigation while animating numbers and mini charts only when their real analytics data changes.

**Architecture:** Add a mount gate inside the existing `MetricNumberFlow` wrapper, retain user-scoped analytics and order caches across Dashboard remounts, and silently revalidate cached data. Equal API payloads retain their object references; changed metrics and series update NumberFlow and mini charts without replaying P&L container animations.

**Tech Stack:** React 18, TypeScript, `@number-flow/react`, Vitest, Testing Library.

## Global Constraints

- Keep `src/components/ui/number-flow.tsx` as the shared component path.
- Preserve the existing `৳` prefix and `en-BD` integer formatting.
- Do not add dependencies, assets, icons, providers, endpoints, or database changes.
- Test the behavior before changing the implementation.

---

### Task 1: Gate NumberFlow animation until after mount

**Files:**
- Create: `src/test/metricNumberFlow.test.tsx`
- Modify: `src/components/ui/number-flow.tsx`

**Interfaces:**
- Consumes: `MetricNumberFlowProps` with `value`, optional `prefix`, and optional `className`.
- Produces: `MetricNumberFlow` that sends `animated={false}` on first render and `animated={true}` after mount.

- [x] **Step 1: Write a failing component test**

Mock `@number-flow/react`, render `MetricNumberFlow` with value `100`, and assert the first NumberFlow call has `animated: false`. Wait for the mount update, rerender with value `200`, and assert later calls have `animated: true` while preserving the configured value, prefix, locale, and format.

- [x] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/test/metricNumberFlow.test.tsx`

Expected: failure because the wrapper does not yet send the `animated` prop.

- [x] **Step 3: Implement the mount gate**

Import `useEffect` and `useState`, initialize `animationEnabled` to `false`, set it to `true` in a mount-only effect, and pass `animated={animationEnabled}` to NumberFlow.

- [x] **Step 4: Run focused animation tests and verify GREEN**

Run: `npx vitest run src/test/metricNumberFlow.test.tsx src/test/dashboardFinanceMetricAnimation.test.ts`

### Task 2: Preserve the full P&L section across navigation

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/test/dashboardFinanceMetricAnimation.test.ts`

**Interfaces:**
- Consumes: the existing TanStack Query order cache and module-level analytics snapshot.
- Produces: user-scoped cached P&L rendering with silent revalidation and change-only mini-chart animation.

- [x] **Step 1: Reproduce the remount cache reset in a failing regression test**

Assert that Dashboard does not clear `analyticsSnapshot`, initializes page loading from cached orders, revalidates analytics silently, and does not animate P&L containers or mini charts on mount.

- [x] **Step 2: Verify the regression test fails for the cache reset and mount animations**

Run: `npx vitest run src/test/dashboardFinanceMetricAnimation.test.ts`

- [x] **Step 3: Implement user-scoped cache hydration and change-only updates**

Initialize order and analytics state from caches, restore the cached date range, remove the unconditional remount reset, retain equal analytics state objects, and silently revalidate on return.

- [x] **Step 4: Gate mini-chart animation by changed data and remove P&L mount fades**

Compare each mini chart's current data signature with its prior signature, disable animation on mount, and remove container/value fade-ins that replay during route navigation.

- [x] **Step 5: Run focused tests and build**

Run: `npx vitest run src/test/dashboardFinanceMetricAnimation.test.ts src/test/metricNumberFlow.test.tsx && npm run build`

### Task 3: Full verification

- [x] **Step 1: Run full verification**

Run: `npm test && npm run lint && npm run build && git diff --check`

## GSTACK REVIEW REPORT

- Scope is limited to the existing P&L presentation, cache hydration, and regression tests.
- No unresolved architecture, security, data, or responsive-design decisions.
- **VERDICT:** Implemented and verified.

NO UNRESOLVED DECISIONS
