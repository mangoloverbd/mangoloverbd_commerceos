# Shared Header Breadcrumb Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared authenticated-header title with a `Dashboard › Current page` breadcrumb on every protected route.

**Architecture:** Keep the route-to-label mapping in `DashboardLayout.tsx`, where the active pathname is already available through React Router. Render a two-level breadcrumb in the existing header and leave all page components and right-side header controls unchanged.

**Tech Stack:** React 18, TypeScript, React Router v6, Tailwind CSS, Vitest.

---

## File Structure

- Modify: `src/components/DashboardLayout.tsx` — resolve every protected route’s label and render the shared breadcrumb.
- Create: `src/test/dashboardLayoutBreadcrumb.test.ts` — assert all protected routes and visual breadcrumb tokens are present in the shared layout source.

### Task 1: Add a failing breadcrumb contract test

**Files:**
- Create: `src/test/dashboardLayoutBreadcrumb.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(
  resolve(process.cwd(), "src/components/DashboardLayout.tsx"),
  "utf8",
);

describe("DashboardLayout breadcrumb", () => {
  it("shows a Dashboard breadcrumb for every protected route", () => {
    for (const route of [
      '"/": "Overview"',
      '"/returns": "Returns"',
      '"/products": "Products"',
      '"/customers": "Customers"',
      '"/order-extraction": "Extraction"',
      '"/order-chat": "AI Chat"',
      '"/order-analysis": "AI Analysis"',
      '"/inbox/facebook": "Facebook"',
      '"/inbox/instagram": "Instagram"',
      '"/inbox/whatsapp": "WhatsApp"',
      '"/inbox/orders": "Inbox Orders"',
      '"/studio": "Studio"',
      '"/billing": "Billing"',
      '"/settings": "System Settings"',
    ]) {
      expect(layoutSource).toContain(route);
    }

    expect(layoutSource).toContain(">Dashboard</span>");
    expect(layoutSource).toContain("ChevronRight");
    expect(layoutSource).toContain("getRouteTitle(location.pathname)");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/test/dashboardLayoutBreadcrumb.test.ts`

Expected: FAIL because the existing layout maps `/` to `Home`, omits protected-route labels, and does not render `Dashboard` or `ChevronRight`.

### Task 2: Render the shared breadcrumb

**Files:**
- Modify: `src/components/DashboardLayout.tsx`

- [ ] **Step 1: Expand the icon import and route-label map**

Replace the Phosphor import and `routeTitles` declaration with:

```ts
import { ChevronRight, DotsThree, Plus, Sparkle } from "@phosphor-icons/react";

const routeTitles: Record<string, string> = {
    "/": "Overview",
    "/returns": "Returns",
    "/products": "Products",
    "/customers": "Customers",
    "/order-extraction": "Extraction",
    "/order-chat": "AI Chat",
    "/order-analysis": "AI Analysis",
    "/inbox/facebook": "Facebook",
    "/inbox/instagram": "Instagram",
    "/inbox/whatsapp": "WhatsApp",
    "/inbox/orders": "Inbox Orders",
    "/studio": "Studio",
    "/billing": "Billing",
    "/settings": "System Settings",
};
```

- [ ] **Step 2: Replace the header heading with the breadcrumb**

Replace the existing `<h1>` inside the header with:

```tsx
<nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2">
    <span className="font-sf-display text-[20px] font-normal leading-none tracking-normal text-[#202020]/35">
        Dashboard
    </span>
    <ChevronRight aria-hidden="true" size={20} weight="light" className="shrink-0 text-[#202020]/35" />
    <h1 className="truncate font-sf-display text-[20px] font-semibold leading-none tracking-normal">
        {getRouteTitle(location.pathname)}
    </h1>
</nav>
```

- [ ] **Step 3: Run the focused test to verify it passes**

Run: `npm test -- src/test/dashboardLayoutBreadcrumb.test.ts`

Expected: PASS with one passing test suite.

### Task 3: Validate the finished layout

**Files:**
- Modify: `src/components/DashboardLayout.tsx`
- Create: `src/test/dashboardLayoutBreadcrumb.test.ts`

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: PASS with no test failures.

- [ ] **Step 2: Run static validation**

Run: `npm run lint && npm run build`

Expected: Both commands complete successfully with no TypeScript or ESLint errors.

- [ ] **Step 3: Manually verify protected pages**

Run: `npm run dev`

Open `/`, `/customers`, `/inbox/facebook`, and `/settings` after signing in. Confirm each top-left header reads `Dashboard ›` followed by the correct current-page label and the right-side controls stay aligned.
