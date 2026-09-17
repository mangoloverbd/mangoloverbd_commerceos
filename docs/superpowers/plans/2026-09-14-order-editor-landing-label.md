# Order Editor Landing-Page Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a landing-page order's campaign origin immediately visible beside the editable order source in Order Editor.

**Architecture:** Keep `source` as the canonical, editable order channel. Add a small read-only attribution block in `CustomerPanel` that formats the stored `/step/<slug>` path into a human-readable label and links to the exact local path. Orders without attribution show the label with an em-dash value.

**Tech Stack:** React 18, TypeScript, React Router, Tailwind CSS, Phosphor Icons, Vitest, Testing Library.

## Global Constraints

- Preserve `source: "website"` for landing-page orders.
- Do not add landing pages to the order-source dropdown.
- Do not modify New Order.
- Keep landing attribution read-only.
- Use Phosphor Icons with `weight="light"`.

---

### Task 1: Add readable linked attribution to CustomerPanel

**Files:**
- Modify: `src/components/order-editor/CustomerPanel.tsx`
- Test: `src/test/order-detail.test.ts`

**Interfaces:**
- Consumes: `CustomerPanel`'s existing `order.landing_page_path` value.
- Produces: A header attribution block with accessible label `Landing page`, human-readable slug text, and a link to the stored path.

- [x] **Step 1: Write the failing tests**

Add assertions to the existing OrderDetail tests:

```tsx
it("shows a readable linked landing page beside the order source", async () => {
  renderPage();

  const customerSection = await screen.findByRole("region", { name: "Customer and order" });
  const attribution = within(customerSection).getByTestId("landing-page-attribution");

  expect(attribution).toHaveTextContent("Landing page");
  expect(attribution).toHaveTextContent("Katimon Mango");
  expect(within(attribution).getByRole("link", { name: "Katimon Mango" })).toHaveAttribute("href", "/step/katimon-mango");
});

it("does not show a landing-page link when attribution is unavailable", async () => {
  const detailWithoutLandingPage = { ...detail, order: { ...order, landing_page_path: null } };
  apiFetch.mockImplementation(async (url: string) => {
    if (url === "/api/orders/order-1") return response(detailWithoutLandingPage);
    if (url === "/api/products") return response(products);
    throw new Error(`Unexpected API request: ${url}`);
  });
  renderPage();

  const customerSection = await screen.findByRole("region", { name: "Customer and order" });
  expect(within(customerSection).queryByTestId("landing-page-attribution")).not.toBeInTheDocument();
});
```

- [x] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- --run src/test/order-detail.test.ts -t 'readable linked landing page|landing-page link'`

Expected: FAIL because `landing-page-attribution` is not rendered yet.

- [x] **Step 3: Implement the minimal UI**

In `CustomerPanel.tsx`:

1. Import `ArrowUpRight` from `@phosphor-icons/react`.
2. Add a formatter that takes `/step/katimon-mango`, removes the `/step/` prefix, splits on hyphens, capitalizes each word, and returns `Katimon Mango`.
3. Render the attribution block next to the existing `order-source-control` for every order, showing `—` when `order.landing_page_path` is unavailable.
4. Use the stored path directly as the relative link target only for validated `/step/...` paths, with `target="_blank"`, `rel="noreferrer"`, and a title containing the exact path.
5. Remove the duplicate standalone field so the header is the single clear attribution location.

Target shape:

```tsx
<div data-testid="landing-page-attribution" className="flex min-w-0 items-center gap-2">
  <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/40">Landing page</p>
  {order.landing_page_path ? (
    <a href={order.landing_page_path} target="_blank" rel="noreferrer" title={order.landing_page_path}>
      {formatLandingPageLabel(order.landing_page_path)}
      <ArrowUpRight weight="light" size={14} aria-hidden="true" />
    </a>
  ) : (
    <span>—</span>
  )}
</div>
```

- [x] **Step 4: Run the focused tests to verify they pass**

Run: `npm test -- --run src/test/order-detail.test.ts -t 'readable linked landing page|landing-page link'`

Expected: PASS.

- [x] **Step 5: Run the complete verification**

Run: `npm test && npm run build && git diff --check`

Expected: 0 test failures, successful production build, and no whitespace errors.

- [x] **Step 6: Commit the implementation**

```bash
git add src/components/order-editor/CustomerPanel.tsx src/test/order-detail.test.ts
git commit -m "feat: show landing page label in order editor"
```
