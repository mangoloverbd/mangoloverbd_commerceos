# Create Order Modal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current vertical Create Order dialog with a responsive, two-column Order Desk that matches Merchant Suite's Customers, Dashboard, and Inbox Orders UI while preserving all existing order behavior.

**Architecture:** Keep the existing `OrderCreatorModal` state, handlers, API calls, and Radix dialog. Replace only its JSX composition with a shell containing a header, scrollable two-column content area, and sticky action footer. Add a focused component test for the new structure and preserve the existing product-picker scroll regression test.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Radix Dialog, Framer Motion, Vitest, Testing Library.

## Global Constraints

- Do not change API routes, request payloads, validation rules, extraction behavior, fraud-check behavior, or reset behavior.
- Continue using `apiFetch()` for every API call.
- Preserve Radix dialog semantics, visible title/description, keyboard dismissal, and focus-visible states.
- Use the existing Merchant Suite visual language: warm white surfaces, black typography, soft black-tinted fields, rounded-2xl sections, thin low-contrast borders, compact uppercase labels, and restrained motion.
- Keep the catalog picker viewport-safe and independently scrollable.
- Do not add a new dependency or modify backend/database code.

---

### Task 1: Add a failing Order Desk structure test

**Files:**
- Create: `src/test/orderCreatorModal.test.tsx`
- Read: `src/components/OrderCreatorModal.tsx`

**Interfaces:**
- Consumes: `OrderCreatorModal` with `open`, `onOpenChange`, and `onCreated` props.
- Produces: a regression test requiring the header eyebrow, capture/cart sections, sticky action footer, and existing catalog-loading behavior.

- [ ] **Step 1: Write the failing test**

Create a test that mocks `apiFetch` only for the modal's initial `/api/products` request, renders the open modal, waits for the catalog picker, and asserts the new accessible section labels and footer actions:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrderCreatorModal from "@/components/OrderCreatorModal";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/components/ui/sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), custom: vi.fn() },
  DarkToast: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("OrderCreatorModal", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ products: [] }) });
  });

  it("renders the Order Desk sections and persistent actions", async () => {
    render(<OrderCreatorModal open onOpenChange={vi.fn()} onCreated={vi.fn()} />);

    expect(screen.getByText("NEW ORDER")).toBeInTheDocument();
    expect(screen.getByText("Capture & customer")).toBeInTheDocument();
    expect(screen.getByText("Cart & order summary")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create order/i })).toBeInTheDocument();
    expect(screen.getByText("Run fraud check")).toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/products"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/test/orderCreatorModal.test.tsx`

Expected: FAIL because the current dialog has no `NEW ORDER`, `Capture & customer`, or `Cart & order summary` headings.

- [ ] **Step 3: Commit the red test**

```bash
git add src/test/orderCreatorModal.test.tsx
git commit -m "test: define order desk modal structure"
```

### Task 2: Replace the modal composition with the Order Desk layout

**Files:**
- Modify: `src/components/OrderCreatorModal.tsx:320-end`

**Interfaces:**
- Consumes: Existing state and handlers (`extractOrder`, `createOrder`, `addProductLine`, line editing handlers, totals, and product catalog).
- Produces: The same `OrderCreatorModal` public component with the new responsive visual structure and unchanged API behavior.

- [ ] **Step 1: Rebuild the dialog shell**

Keep the existing `DialogPrimitive.Root`, portal, overlay, motion transitions, and close button. Change the content class to a wide, viewport-safe shell such as:

```tsx
className="fixed left-1/2 top-1/2 z-50 grid max-h-[90vh] w-[calc(100%-1rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border border-black/10 bg-[#FAFAF8] shadow-2xl shadow-black/15 sm:w-[calc(100%-2rem)] sm:rounded-2xl"
```

Use a header row, a `min-h-0 overflow-y-auto` content row, and a footer row so actions remain visible while content scrolls.

- [ ] **Step 2: Add the new header and content columns**

Add the `NEW ORDER` eyebrow and supporting copy. Wrap the main form in a padded `min-h-0` content region with `grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.82fr)]`. Add visible `Capture & customer` and `Cart & order summary` headings without changing any form control bindings.

- [ ] **Step 3: Move existing controls into the left capture column**

Keep the AI textarea and extraction button in a distinct rounded section. Keep customer name, phone, and address in a rounded section using the existing labels/placeholders and state setters. Keep payment method and notes in a compact checkout-details section in this column on mobile and desktop.

- [ ] **Step 4: Move existing product/cart controls into the right column**

Keep the Products heading/count, image-led line rows, variant selector, quantity controls, unit price, line total, remove button, catalog `Combobox`, and empty catalog message. Keep the line list constrained with `min-h-0 max-h-[38vh] overflow-y-auto`. Keep the product picker independently scrollable through the existing `Combobox` fix.

- [ ] **Step 5: Add the summary block and sticky action footer**

Keep delivery, subtotal, discount, advance, total, due-after-advance, and taka formatting in a clear summary panel on the right. Move the fraud checkbox and Create Order button into a footer with a quiet Cancel button that calls `onOpenChange(false)`. Preserve the current loading state and `disabled={creating}` behavior.

- [ ] **Step 6: Run the focused test to verify it passes**

Run: `npm test -- --run src/test/orderCreatorModal.test.tsx src/test/combobox.test.tsx`

Expected: PASS for both tests.

- [ ] **Step 7: Commit the layout implementation**

```bash
git add src/components/OrderCreatorModal.tsx src/test/orderCreatorModal.test.tsx
git commit -m "feat: redesign create order modal"
```

### Task 3: Verify responsive behavior and production readiness

**Files:**
- Verify: `src/components/OrderCreatorModal.tsx`
- Verify: `src/test/orderCreatorModal.test.tsx`
- Verify: `src/test/combobox.test.tsx`

**Interfaces:**
- Consumes: The completed Order Desk layout and regression tests.
- Produces: Verified desktop/mobile behavior with no functional regressions.

- [ ] **Step 1: Run the full automated checks**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all tests pass, lint has no errors, build succeeds, and diff check is clean.

- [ ] **Step 2: Perform a local browser check**

At `http://localhost:5050`, open Dashboard → Create Order and verify:

1. Desktop shows the two-column Order Desk and visible footer.
2. Mobile stacks the sections without horizontal overflow.
3. Products opens an image-based picker whose list scrolls independently.
4. Adding a product keeps variant, quantity, price, totals, and footer accessible.
5. Extract Order Details, fraud checkbox, Cancel, and Create Order retain their current behavior.

- [ ] **Step 3: Commit any final test-only adjustments**

If the browser check exposes only styling/test-selector issues, update the focused test and commit:

```bash
git add src/test/orderCreatorModal.test.tsx
git commit -m "test: cover order desk responsive controls"
```

- [ ] **Step 4: Review the final diff**

Run: `git diff origin/main...HEAD --stat && git status --short`

Confirm only the approved design spec, implementation plan, modal UI, and tests are present.
