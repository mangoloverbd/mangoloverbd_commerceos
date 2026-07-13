# Balanced Billing Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four equal billing plan cards with polished Starter and Growth pricing cards while preserving Stripe checkout behavior and the existing `RichButton` appearance.

**Architecture:** Add reusable presentation-only pricing-card primitives under `src/components/ui`, then compose them inside the existing Billing page. Keep all billing state, plan IDs, checkout calls, Stripe routes, and backend price configuration unchanged; filter Pro and Enterprise only at the rendering boundary.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn-style UI primitives, Phosphor Icons, Vitest, Testing Library

---

## File Structure

- Create `src/components/ui/pricing-card.tsx`: reusable compound primitives for the glass pricing-card shell, header, price, feature lists, and divider.
- Modify `src/pages/Billing.tsx`: show Starter and Growth only, provide unequal feature depth, compose pricing-card primitives, and retain the existing Stripe checkout handler.
- Create `src/test/billingPlans.test.tsx`: behavior coverage for visible plans, hidden plans, feature hierarchy, checkout route preservation, and pricing-card composition.

### Task 1: Lock the approved behavior with failing tests

**Files:**
- Create: `src/test/billingPlans.test.tsx`
- Test: `src/test/billingPlans.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create a test that mocks the three Billing API reads, renders `Billing` inside a router, and asserts the approved plan hierarchy:

```tsx
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Billing from "@/pages/Billing";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

apiFetch.mockImplementation(async (url: string) => {
  if (url === "/api/billing/plan") {
    return {
      ok: true,
      json: async () => ({
        plan: {
          id: "growth",
          name: "Growth",
          price: 3499,
          interval: "monthly",
          status: "trialing",
          renewsAt: "2026-07-17T00:00:00.000Z",
          startedAt: "2026-07-10T00:00:00.000Z",
          trialEndsAt: "2026-07-17T00:00:00.000Z",
        },
      }),
    } as Response;
  }
  if (url === "/api/billing/usage") {
    return { ok: true, json: async () => ({ usage: null }) } as Response;
  }
  return { ok: true, json: async () => ({ invoices: [] }) } as Response;
});

vi.mock("@/lib/api", () => ({ apiFetch }));

describe("Billing plans", () => {
  it("shows Starter and Growth while hiding Pro and Enterprise", async () => {
    render(<MemoryRouter><Billing /></MemoryRouter>);

    expect(await screen.findByTestId("plan-starter")).toBeInTheDocument();
    expect(screen.getByTestId("plan-growth")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-pro")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-enterprise")).not.toBeInTheDocument();
  });

  it("gives Growth more included feature rows without enlarging its width", async () => {
    render(<MemoryRouter><Billing /></MemoryRouter>);

    const starter = await screen.findByTestId("plan-starter");
    const growth = screen.getByTestId("plan-growth");
    expect(within(growth).getAllByTestId("included-feature").length)
      .toBeGreaterThan(within(starter).getAllByTestId("included-feature").length);
    expect(starter).toHaveClass("w-full");
    expect(growth).toHaveClass("w-full");
  });

  it("preserves the existing Stripe checkout endpoint", () => {
    expect(Billing.toString()).toBeTruthy();
  });
});
```

Add a source assertion for the checkout endpoint because the handler is private to `Billing.tsx`:

```tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

it("preserves the existing Stripe checkout endpoint", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/Billing.tsx"), "utf8");
  expect(source).toContain('apiFetch("/api/billing/checkout"');
});
```

- [ ] **Step 2: Run the tests and confirm the approved UI is not implemented yet**

Run:

```bash
npm test -- src/test/billingPlans.test.tsx
```

Expected: FAIL because `plan-starter`, `plan-growth`, `included-feature`, and the new pricing-card component structure do not exist.

- [ ] **Step 3: Commit the red test**

```bash
git add src/test/billingPlans.test.tsx
git commit -m "test: define balanced billing plan behavior"
```

### Task 2: Add reusable pricing-card primitives

**Files:**
- Create: `src/components/ui/pricing-card.tsx`
- Test: `src/test/billingPlans.test.tsx`

- [ ] **Step 1: Add a composition test for the primitives**

Extend `src/test/billingPlans.test.tsx`:

```tsx
import * as PricingCard from "@/components/ui/pricing-card";

it("composes reusable pricing-card primitives", () => {
  render(
    <PricingCard.Card data-testid="pricing-card">
      <PricingCard.Header><PricingCard.PlanName>Starter</PricingCard.PlanName></PricingCard.Header>
      <PricingCard.Body><PricingCard.List><PricingCard.ListItem>500 orders</PricingCard.ListItem></PricingCard.List></PricingCard.Body>
    </PricingCard.Card>,
  );
  expect(screen.getByTestId("pricing-card")).toHaveClass("backdrop-blur-xl");
  expect(screen.getByText("500 orders")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test and verify the module is missing**

Run:

```bash
npm test -- src/test/billingPlans.test.tsx
```

Expected: FAIL with an import resolution error for `@/components/ui/pricing-card`.

- [ ] **Step 3: Implement the compound primitives**

Create `src/components/ui/pricing-card.tsx` with typed wrappers using `cn()`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"article">) {
  return <article className={cn("relative w-full rounded-[22px] border border-black/[0.08] bg-white/75 p-1.5 shadow-[0_24px_70px_rgba(29,29,31,0.10)] backdrop-blur-xl", className)} {...props} />;
}

export function Header({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("relative mb-1 overflow-hidden rounded-[17px] border border-black/[0.055] bg-black/[0.025] p-6", className)} {...props} />;
}

export function Plan({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("relative z-10 mb-9 flex items-center justify-between gap-3", className)} {...props} />;
}

export function PlanName({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-2 text-[13px] font-medium text-black/55 [&_svg]:size-5", className)} {...props} />;
}

export function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("rounded-full border border-black/15 bg-white/55 px-2.5 py-1 text-[9px] font-medium text-black/60", className)} {...props} />;
}

export function Price({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("relative z-10 mb-5 flex items-end gap-1.5", className)} {...props} />;
}

export function MainPrice({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("text-[38px] font-semibold tracking-[-0.055em] text-black", className)} {...props} />;
}

export function Period({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("pb-1.5 text-[11px] text-black/45", className)} {...props} />;
}

export function Body({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function List({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul className={cn("space-y-3", className)} {...props} />;
}

export function ListItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li className={cn("flex items-start gap-2.5 text-[11px] leading-relaxed text-black/55", className)} {...props} />;
}

export function Separator({ children = "Upgrade to Growth", className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("my-5 flex items-center gap-2.5 text-[9px] text-black/40 before:h-px before:flex-1 before:bg-black/10 after:h-px after:flex-1 after:bg-black/10", className)} {...props}><span>{children}</span></div>;
}
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
npm test -- src/test/billingPlans.test.tsx
```

Expected: the primitive composition test passes; plan hierarchy tests still fail.

- [ ] **Step 5: Commit the pricing-card primitive**

```bash
git add src/components/ui/pricing-card.tsx src/test/billingPlans.test.tsx
git commit -m "feat: add reusable pricing card primitives"
```

### Task 3: Compose the approved Starter and Growth cards

**Files:**
- Modify: `src/pages/Billing.tsx:46-292`
- Test: `src/test/billingPlans.test.tsx`

- [ ] **Step 1: Add display-specific plan metadata**

Keep the existing plan IDs, prices, and full feature definitions. Add presentation fields for the approved card summaries:

```tsx
const VISIBLE_PLAN_IDS = new Set(["starter", "growth"]);

const PLAN_CARD_FEATURES: Record<string, { included: string[]; locked?: string[] }> = {
  starter: {
    included: [
      "500 orders and 50 fraud checks each month",
      "One team member and one courier connection",
      "300 AI inbox replies and 100 extractions",
      "One social platform and basic weekly analytics",
    ],
    locked: [
      "Both courier integrations and three team members",
      "Daily analytics and priority WhatsApp support",
    ],
  },
  growth: {
    included: [
      "2,000 orders and 300 fraud checks each month",
      "Three team members with Steadfast and Pathao",
      "1,500 AI inbox replies and 500 AI extractions",
      "300 AI order captures and 20 analysis runs",
      "Two social inbox platforms with business-hours automation",
      "200 products and a 2,000-word brand document",
      "Full daily analytics and priority WhatsApp support",
    ],
  },
};
```

- [ ] **Step 2: Replace only the plan-card grid**

Import the approved dependencies:

```tsx
import * as PricingCard from "@/components/ui/pricing-card";
import { CheckCircle, Storefront, TrendUp, XCircle } from "@phosphor-icons/react";
```

Render only visible plans in an equal-width, top-aligned grid and preserve `handleSwitch`:

```tsx
<div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
  {PLANS.filter((plan) => VISIBLE_PLAN_IDS.has(plan.id)).map((plan) => {
    const isCurrent = currentPlan?.id === plan.id;
    const display = PLAN_CARD_FEATURES[plan.id];
    const PlanIcon = plan.id === "growth" ? TrendUp : Storefront;

    return (
      <PricingCard.Card key={plan.id} data-testid={`plan-${plan.id}`} className={cn("w-full", plan.id === "growth" && "border-blue-500/20")}>
        <PricingCard.Header className={cn(plan.id === "growth" && "bg-blue-50/70")}>
          <PricingCard.Plan>
            <PricingCard.PlanName><PlanIcon weight="light" /><span>{plan.name}</span></PricingCard.PlanName>
            <PricingCard.Badge className={cn(plan.id === "growth" && "border-blue-500/20 text-blue-600")}>{plan.id === "growth" ? "Recommended" : "Solo sellers"}</PricingCard.Badge>
          </PricingCard.Plan>
          <PricingCard.Price><PricingCard.MainPrice>৳{plan.price.toLocaleString()}</PricingCard.MainPrice><PricingCard.Period>/ month</PricingCard.Period></PricingCard.Price>
          <RichButton color="default" size="default" onClick={() => handleSwitch(plan.id)} disabled={isCurrent || switching !== null} className="relative z-10 w-full">
            {switching === plan.id ? <Spinner size="sm" className="mx-auto" /> : isCurrent ? "Current Plan" : currentPlan && PLANS.findIndex((item) => item.id === plan.id) < PLANS.findIndex((item) => item.id === currentPlan.id) ? "Downgrade" : "Upgrade"}
          </RichButton>
        </PricingCard.Header>
        <PricingCard.Body>
          <p className="mb-3 text-[11px] font-medium text-black">{plan.id === "growth" ? "More capacity and automation" : "Everything you need to start"}</p>
          <PricingCard.List>
            {display.included.map((feature) => <PricingCard.ListItem key={feature} data-testid="included-feature"><CheckCircle weight="light" className="mt-0.5 size-4 shrink-0 text-emerald-600" /><span>{feature}</span></PricingCard.ListItem>)}
          </PricingCard.List>
          {display.locked && <><PricingCard.Separator /><PricingCard.List>{display.locked.map((feature) => <PricingCard.ListItem key={feature} className="opacity-70"><XCircle weight="light" className="mt-0.5 size-4 shrink-0 text-black/35" /><span>{feature}</span></PricingCard.ListItem>)}</PricingCard.List></>}
        </PricingCard.Body>
      </PricingCard.Card>
    );
  })}
</div>
```

- [ ] **Step 3: Run the focused tests**

Run:

```bash
npm test -- src/test/billingPlans.test.tsx
```

Expected: PASS for visible plans, hidden plans, feature hierarchy, primitives, and checkout route preservation.

- [ ] **Step 4: Run lint and the full test suite**

Run:

```bash
npm run lint
npm test
```

Expected: both commands exit successfully.

- [ ] **Step 5: Commit the Billing composition**

```bash
git add src/pages/Billing.tsx src/test/billingPlans.test.tsx
git commit -m "feat: refresh Starter and Growth billing cards"
```

### Task 4: Verify the production build and responsive UI

**Files:**
- Verify: `src/pages/Billing.tsx`
- Verify: `src/components/ui/pricing-card.tsx`

- [ ] **Step 1: Build the application**

Run:

```bash
npm run build
```

Expected: Vite completes successfully with no TypeScript or bundling errors.

- [ ] **Step 2: Verify the Billing page in a browser**

Run the app and inspect `/billing` at desktop and mobile widths. Confirm:

- Starter and Growth are equal width and top aligned on desktop.
- Growth is only naturally taller because it has seven included rows.
- Cards stack without horizontal overflow on mobile.
- Both CTAs use the existing grey `RichButton` appearance.
- Current-plan, loading, upgrade, and downgrade button states remain readable.
- Pro and Enterprise do not appear.

- [ ] **Step 3: Review the final diff**

Run:

```bash
git diff --check HEAD~1..HEAD
git status --short
```

Expected: no whitespace errors and no unrelated files staged.
