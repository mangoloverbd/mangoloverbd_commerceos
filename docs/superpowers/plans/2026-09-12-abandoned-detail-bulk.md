# Abandoned Detail Page and Bulk Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-page abandoned checkout editor at `/abandoned/:id` reusing the order-editor panels, plus queue row selection with a same-styled bulk Update Status button in the dashboard toolbar.

**Architecture:** `CartPanel` gains an additive `hideOrderSections` prop that hides the status select, notes field, and discount editors. A new `AbandonedDetail` page composes `CustomerPanel`, `CatalogPanel`, and `CartPanel` against draft data and saves through the existing staff-edit PATCH endpoint. `AbandonedCheckoutQueue` gains checkboxes and row-click navigation; `Dashboard.tsx` owns selection state and bulk handlers reusing the single-row PATCH/convert/dismiss paths.

**Tech Stack:** React 18 + TypeScript + React Router v6 + TanStack Query; Vitest + Testing Library; Phosphor icons (`weight="light"`); `apiFetch()` for all frontend calls.

## Global Constraints

- All frontend API calls use `apiFetch()` from `@/lib/api`. Never raw `fetch()`.
- New routes use React Router v6 in `src/App.tsx`. Never `wouter`.
- Icons use `@phosphor-icons/react` with `weight="light"`. Never lucide for new icons.
- Taka amounts render with `৳`. Never "BDT" or "Tk".
- TypeScript strict: no `any` without a justifying comment.
- No new server routes in this plan. Draft ownership stays server-enforced by the existing workspace-scoped endpoints.
- TDD: write the failing test first for every behavior, watch it fail, then implement.
- Copy the OrdersTable checkbox class strings verbatim (Task 3). Copy the toolbar PopButton/Popover class strings verbatim (Task 4).

---

## File map

| File | Responsibility |
|---|---|
| `src/components/order-editor/CartPanel.tsx` | Additive optional `hideOrderSections?: boolean` prop hiding status select, notes, per-line and overall discount editors. |
| `src/pages/AbandonedDetail.tsx` | New `/abandoned/:id` page reusing the three editor panels against draft data. |
| `src/App.tsx` | Register `/abandoned/:id` route (`AbandonedDetail`, lazy-loaded like `OrderDetail`). |
| `src/components/orders/AbandonedCheckoutQueue.tsx` | Checkboxes, select-all bar, row-click navigation via new props. |
| `src/pages/Dashboard.tsx` | `selectedAbandonedIds` state, bulk Update Status button + menu, bulk handlers, row-open navigation, tab restore from location state. |
| `src/test/cartPanel.test.tsx` | Extend: draft-mode hiding tests. |
| `src/test/abandonedDetail.test.tsx` | New: detail page tests. |
| `src/test/abandonedCheckoutQueue.test.tsx` | Extend: selection + navigation tests. |
| `src/test/dashboardOrderStatusFilter.test.tsx` | Extend: bulk action tests. |

---

### Task 1: CartPanel draft mode

**Files:**
- Modify: `src/components/order-editor/CartPanel.tsx:10-35` (props type + destructure), render blocks at lines ~57 (per-line `DiscountEditor`), ~66 (`CartDiscountEditor`), ~71-90 (status select + notes)
- Test: `src/test/cartPanel.test.tsx` (extend; read the file first and follow its `renderCart` harness pattern)

**Interfaces:**
- Consumes: nothing new.
- Produces: `hideOrderSections?: boolean` (default `false`; order pages pass nothing and render byte-identical output).

- [ ] **Step 1: Write the failing tests.** Append to `src/test/cartPanel.test.tsx`:

```tsx
describe("CartPanel draft mode", () => {
  it("hides status, notes, and discount editors when hideOrderSections is set", () => {
    render(
      <CartPanel
        items={[]}
        totals={totals}
        canEdit
        locked={false}
        saving={false}
        status={null}
        onStatusChange={vi.fn()}
        notes=""
        onNotesChange={vi.fn()}
        overallDiscountType={null}
        overallDiscountValue={0}
        deliveryOn
        onToggleDelivery={vi.fn()}
        onOverallDiscount={vi.fn()}
        onRemoveOverallDiscount={vi.fn()}
        onQuantity={vi.fn()}
        onRemove={vi.fn()}
        onDiscount={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        hideOrderSections
      />,
    );

    expect(screen.queryByRole("button", { name: /order status/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/notes/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });

  it("keeps status and notes visible by default", () => {
    renderCart("confirmed");
    expect(screen.getByRole("button", { name: /order status/i })).toBeInTheDocument();
  });
});
```

(If the notes field in this repo has no accessible label, query it the way the existing tests do — read the file first and match its queries; keep the same assertions.)

- [ ] **Step 2: Run them to verify they fail.**

Run: `npm test -- src/test/cartPanel.test.tsx`
Expected: FAIL (unknown prop `hideOrderSections` → TypeScript/test error).

- [ ] **Step 3: Implement.** Add `hideOrderSections?: boolean` to `CartPanelProps`, destructure it (default `false`), and guard the three blocks:
  - per-line `<DiscountEditor ... />` → `{!hideOrderSections && <DiscountEditor ... />}`
  - `<CartDiscountEditor ... />` wrapper div → `{!hideOrderSections && (...)}`
  - status `BuiSelect` + hold reason + notes textarea block → `{!hideOrderSections && (...)}`
  Totals rows, delivery toggle, quantity/remove buttons, and Save/Cancel stay unconditional.

- [ ] **Step 4: Run the tests.**

Run: `npm test -- src/test/cartPanel.test.tsx`
Expected: PASS, including all pre-existing tests.

- [ ] **Step 5: Commit.**

```bash
git add src/components/order-editor/CartPanel.tsx src/test/cartPanel.test.tsx
git commit -m "feat: add draft mode to cart panel"
```

---

### Task 2: AbandonedDetail page + route

**Files:**
- Create: `src/pages/AbandonedDetail.tsx`
- Modify: `src/App.tsx` (lazy import + `<Route path="/abandoned/:id" element={<AbandonedDetail />} />` directly after the `/orders/:id` line), `src/pages/Dashboard.tsx` (tab restore — see Step 3)
- Test: `src/test/abandonedDetail.test.tsx`

**Interfaces:**
- Consumes: `CustomerPanel` + `CustomerDraft`, `CatalogPanel`, `CartPanel` (with Task 1's `hideOrderSections`), `computeAbandonedCheckoutTotals` from `@/lib/abandonedCheckouts`, `calculateCartTotals` + `OrderEditorItem` from `@/lib/orderEditor`, PATCH staff-edit endpoint shape `{ customerName, phone, address, items, deliveryRate }`, abandoned list cache key `["/api/abandoned-checkouts"]`.
- Produces: route `/abandoned/:id`; Dashboard restores the Abandoned tab from `location.state.fulfillmentTab`.

- [ ] **Step 1: Write the failing tests.** Create `src/test/abandonedDetail.test.tsx`. Mock `@/lib/api` (`apiFetch`), `react-router-dom` partially is unnecessary — render inside `<MemoryRouter initialEntries={["/abandoned/draft-1"]}><Routes><Route path="/abandoned/:id" element={<AbandonedDetail />} /></Routes></MemoryRouter>` with a `QueryClientProvider` (follow `dashboardOrderStatusFilter.test.tsx` mock boilerplate for `useAuth`). Fixture draft (same shape as the queue tests):

```tsx
const draft = {
  id: "draft-1", status: "open", customer_name: "Abandoned Customer",
  phone: "01712345678", address: "House 1, Dhaka",
  cart: [{ productName: "Sundarbans Honey", variantName: "1 kg", quantity: 1, unitPrice: 750 }],
  subtotal: 750, delivery_rate: 100, total: 850, source: "storefront",
  source_path: "/checkout", campaign: {}, contacted_at: null,
  created_at: "2026-09-11T12:00:00.000Z", updated_at: "2026-09-11T12:00:00.000Z",
};
```

Tests:
  1. renders the draft name, phone, cart line, and total; shows no order-status select and no discount UI.
  2. saving with an invalid phone shows a validation error and never calls `apiFetch` with PATCH.
  3. editing the name and saving calls `apiFetch("/api/abandoned-checkouts/draft-1", { method: "PATCH", ... })` with a JSON body containing `customerName` and no `action` key.
  4. when the list endpoint returns no matching draft, shows "Checkout not found." with a back link.

- [ ] **Step 2: Run them to verify they fail.**

Run: `npm test -- src/test/abandonedDetail.test.tsx`
Expected: FAIL (module `@/pages/AbandonedDetail` does not exist).

- [ ] **Step 3: Implement the page.** `src/pages/AbandonedDetail.tsx` modeled on `src/pages/OrderDetail.tsx:127-370`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { Button as BuiButton } from "@/components/base/buttons/button";
import { Spinner } from "@/components/ui/ios-spinner";
import { CustomerPanel, type CustomerDraft } from "@/components/order-editor/CustomerPanel";
import { CatalogPanel } from "@/components/order-editor/CatalogPanel";
import { CartPanel } from "@/components/order-editor/CartPanel";
import {
  abandonedCheckoutCartSummary,
  computeAbandonedCheckoutTotals,
  type AbandonedCheckout,
  type AbandonedCheckoutResponse,
} from "@/lib/abandonedCheckouts";
import {
  calculateCartTotals,
  type CatalogProduct,
  type CatalogVariant,
  type OrderEditorItem,
} from "@/lib/orderEditor";
```

  Data: `const { id } = useParams();` read `queryClient.getQueryData<AbandonedCheckoutResponse>(["/api/abandoned-checkouts"])`; if the draft is absent, `useQuery` the list endpoint `apiFetch("/api/abandoned-checkouts")` once and find by id (reuse the response shape). Loading spinner (`data-testid="abandoned-detail-loading"`), not-found block ("Checkout not found." + back button navigating to `/` with `{ state: { fulfillmentTab: "abandoned" } }`).
  Customer: `useState<CustomerDraft>` initialized from the draft; `<CustomerPanel order={{}} customer={customer} disabled={saving} onApply={setCustomer} />` (empty order object: all display fields render empty; history omitted).
  Cart draft: map draft lines to `OrderEditorItem`:

```tsx
function draftLineToItem(line: AbandonedCheckout["cart"][number], index: number, draftId: string): OrderEditorItem {
  return {
    id: `draft-${draftId}-${index}`,
    product_id: null,
    variant_id: null,
    product_name: line.productName,
    variant_name: line.variantName,
    product_slug: null,
    image_url: null,
    weight_kg: null,
    available_stock: null,
    unit_price: Number(line.unitPrice) || 0,
    discount_type: null,
    discount_value: 0,
    unit_discount: 0,
    quantity: line.quantity,
  };
}
```

  Catalog add (name-match merge, no catalog ids stored):

```tsx
function addCatalogItem(product: CatalogProduct, variant?: CatalogVariant) {
  const variantName = variant ? variantLabelOf(variant) : null;
  const unitPrice = (product.selling_price ?? 0) + (variant?.price_adjustment || 0);
  setDraft((items) => {
    const existing = items.find((item) => item.product_name === product.name && (item.variant_name || null) === variantName);
    if (existing) {
      return items.map((item) => item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item);
    }
    return [...items, {
      id: `draft-${draftId}-custom-${Date.now()}`,
      product_id: null, variant_id: null, product_name: product.name,
      variant_name: variantName, product_slug: null, image_url: null,
      weight_kg: null, available_stock: null, unit_price: unitPrice,
      discount_type: null, discount_value: 0, unit_discount: 0, quantity: 1,
    }];
  });
}
```

  `variantLabelOf` mirrors the editor's label logic: join truthy `Object.values(variant.attributes || {})` with `" · "`, falling back to `null`. (Check `variantLabel` in `OrderCreatorModal.tsx` first; if it is exported, import it instead of duplicating.)
  Totals: `calculateCartTotals(draft, deliveryOn ? deliveryRate : 0, 0)` (overall amount always 0 — no discounts on drafts). Delivery toggle mirrors OrderDetail.
  Save: validate (phone stripped of non-digits must match `/^01\d{9}$/`; every line needs a trimmed non-empty `product_name`, integer `quantity >= 1`, finite `unit_price >= 0`; at least one line; delivery finite `>= 0`). On invalid, set inline error and return. Otherwise PATCH:

```tsx
body: JSON.stringify({
  customerName: customer.customerName.trim(),
  phone: customer.phone.replace(/\D/g, ""),
  address: customer.address.trim(),
  items: draft.map((item) => ({
    productName: (item.product_name || "").trim(),
    variantName: item.variant_name,
    quantity: item.quantity,
    unitPrice: item.unit_price,
  })),
  deliveryRate: deliveryOn ? deliveryRate : 0,
}),
```

  On success update the `["/api/abandoned-checkouts"]` cache entry from `data.checkout`, toast "Checkout updated", and re-init local state. On 404/409 toast "Checkout is no longer active" and navigate to `/` with `{ state: { fulfillmentTab: "abandoned" } }`.
  Toolbar mirrors OrderDetail's (`order-editor-toolbar` testid pattern → use `abandoned-editor-toolbar`; Back button `aria-label="Back"` navigating to `/` with the tab state; title "Abandoned editor" plus captured-time/phone subtitle).
  CartPanel usage: `hideOrderSections`, `overallDiscountType={null}`, `overallDiscountValue={0}`, `status={null}`, `onStatusChange={() => {}}`, `notes=""`, `onNotesChange={() => {}}`, `onOverallDiscount={() => {}}`, `onRemoveOverallDiscount={() => {}}`, `onDiscount={() => {}}`, `onCancel={() => navigate("/", { state: { fulfillmentTab: "abandoned" } })}`.

- [ ] **Step 4: Register the route + tab restore.** In `src/App.tsx` add the lazy import next to OrderDetail and the route directly after `/orders/:id`. In `src/pages/Dashboard.tsx`, initialize the fulfillment tab from location state:

```tsx
const location = useLocation();
// inside component, before useState for the tab:
const initialTab = (location.state as { fulfillmentTab?: unknown } | null)?.fulfillmentTab;
const [fulfillmentTab, setFulfillmentTab] = useState<FulfillmentQueueTab>(
  initialTab === "abandoned" ? "abandoned" : "all",
);
```

(Find the exact existing `fulfillmentTab` state declaration in Dashboard and adapt; keep the `"all"` default for every other value.)

- [ ] **Step 5: Run the tests.**

Run: `npm test -- src/test/abandonedDetail.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/pages/AbandonedDetail.tsx src/App.tsx src/pages/Dashboard.tsx src/test/abandonedDetail.test.tsx
git commit -m "feat: add abandoned checkout detail page"
```

---

### Task 3: Queue selection + row navigation

**Files:**
- Modify: `src/components/orders/AbandonedCheckoutQueue.tsx` (props, checkbox column, select-all bar, row click)
- Test: `src/test/abandonedCheckoutQueue.test.tsx` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: new optional props `selectedIds?: Set<string>` (default `new Set()`), `onToggleSelect?: (id: string) => void` (default noop), `onSelectAll?: () => void` (default noop), `onOpenCheckout?: (id: string) => void` (default noop). All optional with defaults so existing call sites compile.

- [ ] **Step 1: Write the failing tests.** Append to `src/test/abandonedCheckoutQueue.test.tsx`:

```tsx
it("supports selection and opens the detail page on row click", async () => {
  const user = userEvent.setup();
  const onToggleSelect = vi.fn();
  const onSelectAll = vi.fn();
  const onOpenCheckout = vi.fn();
  render(
    <AbandonedCheckoutQueue
      checkouts={[checkout]}
      loading={false}
      error={null}
      actionInFlightId={null}
      onAction={vi.fn()}
      selectedIds={new Set()}
      onToggleSelect={onToggleSelect}
      onSelectAll={onSelectAll}
      onOpenCheckout={onOpenCheckout}
    />,
  );

  await user.click(screen.getByTestId(`checkbox-abandoned-${checkout.id}`));
  expect(onToggleSelect).toHaveBeenCalledWith(checkout.id);
  expect(onOpenCheckout).not.toHaveBeenCalled();

  await user.click(screen.getByTestId("checkbox-abandoned-all"));
  expect(onSelectAll).toHaveBeenCalled();

  await user.click(screen.getByText("Farzana Akter"));
  expect(onOpenCheckout).toHaveBeenCalledWith(checkout.id);
});

it("marks selected rows", () => {
  render(
    <AbandonedCheckoutQueue
      checkouts={[checkout]}
      loading={false}
      error={null}
      actionInFlightId={null}
      onAction={vi.fn()}
      selectedIds={new Set([checkout.id])}
    />,
  );
  expect(screen.getByTestId(`checkbox-abandoned-${checkout.id}`)).toHaveAttribute("aria-checked", "true");
});
```

- [ ] **Step 2: Run them to verify they fail.**

Run: `npm test -- src/test/abandonedCheckoutQueue.test.tsx`
Expected: FAIL (testids absent).

- [ ] **Step 3: Implement.**
  - Checkbox element: copy the OrdersTable per-row checkbox `div` (the `w-[18px] h-[18px] rounded-[5px] border-[1.5px] ...` block with `bg-[#0285F7]` selected styling and check svg) verbatim, with `data-testid={`checkbox-abandoned-${checkout.id}`}`, `role="checkbox"`, `aria-checked={selected}`, `tabIndex={0}`, click + Enter/Space key handling calling `onToggleSelect(checkout.id)`. Place it as the first element of each article row (adjust the article grid to add an auto column).
  - Select-all bar: a slim row above the list (`data-testid="checkbox-abandoned-all"`, same checkbox styling, `aria-checked` true only when every visible checkout is selected and the list is non-empty) plus a `{n} selected` label. Clicking calls `onSelectAll()`.
  - Row click: on the `article`, add `onClick` + `onKeyDown` (Enter/Space) mirroring OrdersTable's guard exactly:

```tsx
const target = event.target as HTMLElement;
if (target.closest("button, a, input, textarea, select, [role='button'], [role='checkbox'], [data-row-interactive='true']")) return;
onOpenCheckout(checkout.id);
```

  (`role='checkbox'` is added to OrdersTable's selector list because the custom checkbox divs there use `data-row-interactive`; here the guard must cover the custom checkbox explicitly.) Add `cursor-pointer` to the article class list; keep all other classes.

- [ ] **Step 4: Run the tests.**

Run: `npm test -- src/test/abandonedCheckoutQueue.test.tsx`
Expected: PASS, including pre-existing tests.

- [ ] **Step 5: Commit.**

```bash
git add src/components/orders/AbandonedCheckoutQueue.tsx src/test/abandonedCheckoutQueue.test.tsx
git commit -m "feat: add selection and navigation to abandoned queue"
```

---

### Task 4: Dashboard bulk Update Status + wiring

**Files:**
- Modify: `src/pages/Dashboard.tsx` (selection state, toolbar bulk button + menu, bulk handlers, queue props, bulk dismiss confirm)
- Test: `src/test/dashboardOrderStatusFilter.test.tsx` (extend)

**Interfaces:**
- Consumes: `updateAbandonedCheckout`, `convertAbandonedCheckout`, `fetchAbandonedCheckouts`, `fetchOrders` (all exist in Dashboard); queue's new selection/navigation props (Task 3); `/abandoned/:id` route (Task 2).
- Produces: no new exports; toolbar behavior only.

- [ ] **Step 1: Write the failing tests.** Read the tail of `src/test/dashboardOrderStatusFilter.test.tsx` for the apiFetch mock pattern, then append:

```tsx
it("bulk-marks abandoned checkouts as contacted with the toolbar button", async () => {
  // Mock returns the orders payload, the abandoned payload (2 open drafts),
  // and { checkout } for PATCH. Open the Abandoned tab, click both
  // row checkboxes (testids checkbox-abandoned-<id>), click
  // button-bulk-abandoned-status, choose "Mark contacted", and expect two
  // PATCH calls with { action: "contacted" } and a summary toast.
});

it("bulk-converts abandoned checkouts and keeps failures selected", async () => {
  // Mock convert POST to succeed for the first draft and 409 for the second.
  // Select both, choose Move to Pending from the bulk menu, confirm, and
  // expect the succeeded draft gone from the queue and the failed one still
  // present (and still selected).
});
```

Write both tests with the file's real mock helpers and fixture shapes (no placeholders — read the file first).

- [ ] **Step 2: Run them to verify they fail.**

Run: `npm test -- src/test/dashboardOrderStatusFilter.test.tsx`
Expected: FAIL (no bulk button/checkboxes in abandoned mode).

- [ ] **Step 3: Implement selection state + queue wiring.** In `src/pages/Dashboard.tsx` next to `selectedOrderIds`:

```tsx
const [selectedAbandonedIds, setSelectedAbandonedIds] = useState<Set<string>>(new Set());
```

Clear it whenever the tab changes (extend the existing tab `onChange` to also `setSelectedAbandonedIds(new Set())`) and after each bulk run. Pass to the queue:

```tsx
selectedIds={selectedAbandonedIds}
onToggleSelect={(checkoutId) => setSelectedAbandonedIds((prev) => {
  const next = new Set(prev);
  if (next.has(checkoutId)) next.delete(checkoutId);
  else next.add(checkoutId);
  return next;
})}
onSelectAll={() => setSelectedAbandonedIds((prev) => (
  prev.size === filteredAbandonedCheckouts.length && filteredAbandonedCheckouts.length > 0
    ? new Set()
    : new Set(filteredAbandonedCheckouts.map((checkout) => checkout.id))
))}
onOpenCheckout={(checkoutId) => navigate(`/abandoned/${checkoutId}`)}
```

(`navigate` and `filteredAbandonedCheckouts` already exist in Dashboard — verify names and reuse them.)

- [ ] **Step 4: Implement the toolbar bulk button.** Inside the `{!isAbandonedQueue && (<>...</>)}` toolbar group region, add an abandoned-mode branch rendering the identical structure with new testids — copy the `PopButton` (color="sky", size="sm", same className), `UpdateStatusIcon`, `CaretDown`, and `PopoverContent` class strings verbatim:

```tsx
{isAbandonedQueue && (
  <Popover open={abandonedBulkMenuOpen} onOpenChange={setAbandonedBulkMenuOpen}>
    <PopoverTrigger asChild>
      <PopButton
        color="sky"
        size="sm"
        disabled={bulkAbandonedRunning || selectedAbandonedIds.size === 0}
        className="gap-1.5 px-3 text-[11px] font-bold tracking-normal max-md:w-full max-md:justify-center"
        data-testid="button-bulk-abandoned-status"
      >
        {bulkAbandonedRunning ? <Spinner size="sm" /> : <UpdateStatusIcon className="h-3.5 w-3.5" />}
        Update Status
        <CaretDown weight="bold" className={cn("h-3 w-3 transition-transform duration-200", abandonedBulkMenuOpen && "rotate-180")} />
      </PopButton>
    </PopoverTrigger>
    <PopoverContent data-testid="bulk-abandoned-status-menu" className="w-[180px] rounded-2xl border border-black/10 bg-white/95 p-2 shadow-2xl shadow-black/10 backdrop-blur-xl" align="end">
      <div className="flex flex-col gap-1">
        {[
          { id: "contacted", label: "Mark contacted" },
          { id: "pending", label: "Pending" },
          { id: "on_hold", label: "On Hold" },
          { id: "approved", label: "Approved" },
          { id: "dismiss", label: "Dismiss" },
        ].map((target) => (
          <button
            key={target.id}
            onClick={() => void applyBulkAbandoned(target.id)}
            disabled={bulkAbandonedRunning}
            className="flex h-9 w-full items-center rounded-xl border border-transparent px-3 text-left text-xs font-medium capitalize transition-all text-foreground hover:border-black/10 hover:bg-black/[0.04] disabled:opacity-40"
          >
            {target.label}
          </button>
        ))}
      </div>
    </PopoverContent>
  </Popover>
)}
```

- [ ] **Step 5: Implement bulk handlers.** Next to `updateAbandonedCheckout`:

```tsx
const applyBulkAbandoned = async (target: string) => {
  if (bulkAbandonedRunning || selectedAbandonedIds.size === 0) return;
  if (target === "dismiss") {
    setAbandonedBulkMenuOpen(false);
    setBulkDismissCount(selectedAbandonedIds.size);
    return;
  }
  setAbandonedBulkMenuOpen(false);
  setBulkAbandonedRunning(true);
  const ids = filteredAbandonedCheckouts
    .filter((checkout) => selectedAbandonedIds.has(checkout.id))
    .map((checkout) => checkout.id);
  let succeeded = 0;
  const failed: string[] = [];
  try {
    for (const checkoutId of ids) {
      try {
        if (target === "contacted") {
          await runAbandonedContacted(checkoutId);
        } else {
          await runAbandonedConvert(checkoutId, target as "pending" | "on_hold" | "approved", {});
        }
        succeeded += 1;
      } catch {
        failed.push(checkoutId);
      }
    }
    // ...toasts + selection update below
  } finally {
    setBulkAbandonedRunning(false);
  }
};
```

This requires refactoring the bodies of `updateAbandonedCheckout` and `convertAbandonedCheckout` into `runAbandonedContacted(checkoutId)` / `runAbandonedConvert(checkoutId, status, overrides)` primitives that throw on failure (no toasts inside), with the existing single-row functions becoming thin wrappers that toast. Do that refactor first within this task — keep every existing behavior and test passing. Summary toasts:

```tsx
if (target === "contacted") {
  toast.success(succeeded === 1 ? "1 checkout marked as contacted" : `${succeeded} checkouts marked as contacted`);
} else {
  const statusLabel = target === "on_hold" ? "On Hold" : target === "approved" ? "Approved" : "Pending";
  toast.success(succeeded === 1 ? `1 order moved to ${statusLabel}` : `${succeeded} orders moved to ${statusLabel}`);
}
if (failed.length > 0) toast.error(`${failed.length} failed — kept selected`);
setSelectedAbandonedIds(new Set(failed));
void fetchAbandonedCheckouts(true);
if (target !== "contacted") void fetchOrders();
```

Bulk dismiss confirm: reuse the queue's dismiss `AlertDialog` pattern at Dashboard level — an `AlertDialog` open when `bulkDismissCount > 0`, text `Dismiss ${bulkDismissCount} checkouts? This cannot be undone.`, confirm loops `runAbandonedDismissed` (same primitive treatment: extract the dismissed branch into a throwing primitive), then summary toast + `setSelectedAbandonedIds(new Set())` + refresh. (Single-row dismiss stays inside the queue component untouched.)

- [ ] **Step 6: Run the tests, then the full suite + lint.**

Run: `npm test -- src/test/dashboardOrderStatusFilter.test.tsx src/test/abandonedCheckoutQueue.test.tsx`
Expected: PASS.
Then run: `npm test` and `npm run lint`
Expected: all green, 0 errors.

- [ ] **Step 7: Commit.**

```bash
git add src/pages/Dashboard.tsx src/test/dashboardOrderStatusFilter.test.tsx
git commit -m "feat: add bulk update status to abandoned queue"
```

---

## Self-review

- Spec coverage: detail page + route + tab restore → Task 2; panel reuse with hidden discount/status/notes → Tasks 1-2; checkboxes + select-all + row navigation → Task 3; same-styled bulk button with contacted/convert/dismiss + summary toasts + failures stay selected → Task 4; per-row actions untouched → no task (correctly absent); no new server routes → none added.
- No placeholders: every step names exact files, line anchors, prop names, payloads, testids, and commands; code blocks are complete.
- Type consistency: `onConvert(checkout, status)` status union `pending | on_hold | approved` matches the convert endpoint and Task 4's bulk cast; edit PATCH body keys match the Task 1 parser's `STAFF_EDIT_KEYS`; `selectedAbandonedIds: Set<string>` mirrors `selectedOrderIds`.

---

Plan complete and saved to `docs/superpowers/plans/2026-09-12-abandoned-detail-bulk.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session with checkpoints for review

Which approach?
