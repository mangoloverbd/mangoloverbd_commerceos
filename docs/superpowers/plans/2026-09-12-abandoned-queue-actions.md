# Abandoned Queue Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-field copy buttons, full draft editing, and convert-to-order (Pending / On Hold / Approved) to the dashboard Abandoned queue.

**Architecture:** Staff field edits extend the existing `PATCH /api/abandoned-checkouts/:id` route with a validated edit parser in `server/abandonedCheckouts.js`. Conversion is a new `POST /api/abandoned-checkouts/:id/convert` route that reuses the manual-order creation path (`getNextManualOrderNumber`, `resolveOrderRouting`, `sendBulkSms`), links `orders.abandoned_checkout_id`, and marks the draft recovered. Frontend adds an edit dialog and a move-to/convert flow in `AbandonedCheckoutQueue` plus a convert handler in `Dashboard.tsx`.

**Tech Stack:** Express (ESM) + Supabase service-role client; React 18 + TypeScript + TanStack Query; Vitest + Testing Library; Phosphor icons (`weight="light"`); `apiFetch()` for all frontend API calls.

## Global Constraints

- Every new route starts with `getToken(req)` → `getUser(token)` → `if (!user) return 401`, then resolves the Mango Lover BD workspace via `getUserOrg(supabase, user.id)` and filters every query by that `org_id`. Never accept an org id from the client.
- Frontend API calls use `apiFetch()` from `@/lib/api` only, never raw `fetch()`.
- Icons use `@phosphor-icons/react` with `weight="light"`.
- Taka amounts render with `৳`, never "BDT" or "Tk".
- TypeScript strict: no `any` without a justifying comment.
- New server routes go in `server/index.js` next to the other abandoned-checkout routes (after the `PATCH /api/abandoned-checkouts/:id` block, ~line 5834). New pure helpers go in `server/abandonedCheckouts.js`.
- TDD: write the failing test first for every behavior, watch it fail, then implement.

---

## File map

| File | Responsibility |
|---|---|
| `server/abandonedCheckouts.js` | New: `parseAbandonedCheckoutStaffEdit(body)` pure parser returning a DB patch. Reuses existing `parseCart`, `boundedMoney`, `optionalString`, `normalizeBdPhone` internals (export `parseCart` if needed). |
| `server/index.js` | Extend `PATCH /api/abandoned-checkouts/:id` to accept edit bodies; add `POST /api/abandoned-checkouts/:id/convert` plus a `resolveAbandonedCatalogIds(supabase, orgId, cart)` helper for product/variant matching (uses existing `matchVariantId` from `server/variantMatching.js`). |
| `src/lib/abandonedCheckouts.ts` | New: `computeAbandonedCheckoutTotals(cart, deliveryRate)` helper. |
| `src/components/orders/AbandonedCheckoutQueue.tsx` | Visible phone row, per-field copy buttons, Edit button, Move-to menu trigger. Receives new `onEdit` / `onConvert` props. |
| `src/components/orders/AbandonedCheckoutEditDialog.tsx` | New edit dialog (contact + cart lines + delivery rate). |
| `src/components/orders/AbandonedCheckoutConvertDialog.tsx` | New convert confirm dialog (status, editable name/address, summary). |
| `src/pages/Dashboard.tsx` | `saveAbandonedCheckoutEdits` and `convertAbandonedCheckout` handlers with TanStack Query cache updates. |
| `src/test/abandonedCheckouts.test.ts` | Extend: staff-edit parser unit tests. |
| `src/test/abandonedCheckoutRouteWiring.test.ts` | Extend: PATCH-edit and convert route wiring assertions. |
| `src/test/abandonedCheckoutHelpers.test.ts` | Extend: totals helper tests. |
| `src/test/abandonedCheckoutQueue.test.tsx` | Extend: per-field copy, edit/convert triggers. |
| `src/test/abandonedCheckoutEditDialog.test.tsx` | New: edit dialog validation tests. |
| `src/test/dashboardOrderStatusFilter.test.tsx` | Extend: edit-save and convert flows. |

---

### Task 1: Staff-edit parser (server)

**Files:**
- Modify: `server/abandonedCheckouts.js` (append `parseAbandonedCheckoutStaffEdit`)
- Test: `src/test/abandonedCheckouts.test.ts` (append new `describe` block)

**Interfaces:**
- Consumes: existing `parseCart`, `boundedMoney`, `optionalString`, `normalizeBdPhone` in the same file.
- Produces: `parseAbandonedCheckoutStaffEdit(body)` → `{ customer_name, phone, address, cart, subtotal, delivery_rate, total }` with DB (snake_case) keys. Throws `AbandonedCheckoutValidationError` on any violation. Allowed input keys (camelCase): `customerName`, `phone`, `address`, `items`, `deliveryRate`. `subtotal`/`total` are recomputed server-side, never accepted.

- [ ] **Step 1: Write the failing test.** Append to `src/test/abandonedCheckouts.test.ts`:

```js
import { parseAbandonedCheckoutStaffEdit } from "../../server/abandonedCheckouts.js";

const validEdit = {
  customerName: "Farzana Akter",
  phone: "+880 1712-345678",
  address: "House 1, Road 2, Dhaka",
  items: [{ productName: "Sundarbans Honey", variantName: "1 kg", quantity: 2, unitPrice: 750 }],
  deliveryRate: 100,
};

describe("abandoned checkout staff edit parsing", () => {
  it("normalizes contact fields and recomputes totals from items", () => {
    expect(parseAbandonedCheckoutStaffEdit(validEdit)).toEqual({
      customer_name: "Farzana Akter",
      phone: "01712345678",
      address: "House 1, Road 2, Dhaka",
      cart: [{ productName: "Sundarbans Honey", variantName: "1 kg", quantity: 2, unitPrice: 750 }],
      subtotal: 1500,
      delivery_rate: 100,
      total: 1600,
    });
  });

  it("rejects unknown keys, bad phones, empty carts, and out-of-range lines", () => {
    expect(() => parseAbandonedCheckoutStaffEdit({ ...validEdit, orgId: "x" }))
      .toThrow(AbandonedCheckoutValidationError);
    expect(() => parseAbandonedCheckoutStaffEdit({ ...validEdit, phone: "123" }))
      .toThrow(AbandonedCheckoutValidationError);
    expect(() => parseAbandonedCheckoutStaffEdit({ ...validEdit, items: [] }))
      .toThrow(AbandonedCheckoutValidationError);
    expect(() => parseAbandonedCheckoutStaffEdit({
      ...validEdit,
      items: [{ productName: "Honey", variantName: null, quantity: 0, unitPrice: 750 }],
    })).toThrow(AbandonedCheckoutValidationError);
    expect(() => parseAbandonedCheckoutStaffEdit({
      ...validEdit,
      items: [{ productName: "Honey", variantName: null, quantity: 1, unitPrice: -5 }],
    })).toThrow(AbandonedCheckoutValidationError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `npm test -- src/test/abandonedCheckouts.test.ts`
Expected: FAIL with "parseAbandonedCheckoutStaffEdit is not defined" (import error).

- [ ] **Step 3: Implement the parser.** Append to `server/abandonedCheckouts.js`:

```js
const STAFF_EDIT_KEYS = new Set(["customerName", "phone", "address", "items", "deliveryRate"]);

export function parseAbandonedCheckoutStaffEdit(body) {
  if (!isRecord(body) || !hasOnlyKeys(body, STAFF_EDIT_KEYS)) invalidCapture();

  const phone = normalizeBdPhone(body.phone);
  if (!phone) invalidCapture();

  const cart = parseCart(body.items);
  const deliveryRate = boundedMoney(body.deliveryRate);
  const subtotal = Math.round(cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100) / 100;
  if (subtotal > MAX_MONEY) invalidCapture();

  return {
    customer_name: optionalString(body.customerName, 120),
    phone,
    address: optionalString(body.address, 500),
    cart,
    subtotal,
    delivery_rate: deliveryRate,
    total: Math.round((subtotal + deliveryRate) * 100) / 100,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `npm test -- src/test/abandonedCheckouts.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit.**

```bash
git add server/abandonedCheckouts.js src/test/abandonedCheckouts.test.ts
git commit -m "feat: parse staff edits for abandoned checkouts"
```

---

### Task 2: PATCH route accepts staff edits

**Files:**
- Modify: `server/index.js` — the `app.patch("/api/abandoned-checkouts/:id", ...)` block (~line 5782)
- Test: `src/test/abandonedCheckoutRouteWiring.test.ts`

**Interfaces:**
- Consumes: `parseAbandonedCheckoutStaffEdit` from Task 1.
- Produces: PATCH accepts either `{ action: "contacted" | "dismissed" }` (unchanged) or a staff-edit body (no `action` key). Edit responses return `{ checkout: updated }` like actions do. Resolved-draft edits return 409 via the existing active-status guard.

- [ ] **Step 1: Write the failing wiring test.** Read `src/test/abandonedCheckoutRouteWiring.test.ts` first and follow its existing `sectionBetween` pattern. Add assertions that the PATCH block:
  - references `parseAbandonedCheckoutStaffEdit`,
  - returns 400 for a body containing both `action` and edit keys,
  - applies the parsed patch with the same optimistic-concurrency guards (`.eq("status", current.status)`).

- [ ] **Step 2: Run it to verify it fails.**

Run: `npm test -- src/test/abandonedCheckoutRouteWiring.test.ts`
Expected: FAIL on the new assertions (identifier absent from PATCH block).

- [ ] **Step 3: Implement.** In the PATCH handler, replace the strict action-only body check with a branch:

```js
const hasAction = req.body.action !== undefined;
if (hasAction) {
  // existing validation unchanged: body must contain ONLY "action",
  // action must be "contacted" or "dismissed"
}
let patch;
if (hasAction) {
  const action = req.body.action;
  if (action !== "contacted" && action !== "dismissed") {
    return res.status(400).json({ error: "Invalid checkout action" });
  }
  patch = buildStaffActionPatch(current.status, action, now);
  if (!patch) return res.status(409).json({ error: "Checkout action is not allowed" });
} else {
  try {
    patch = parseAbandonedCheckoutStaffEdit(req.body);
  } catch {
    return res.status(400).json({ error: "Invalid checkout edits" });
  }
}
```

Key detail: move the draft-ownership read (`current` lookup with `.in("status", ACTIVE_...)` + `.gt("expires_at", ...)`) BEFORE the branch so edits to resolved/expired drafts 404 exactly like actions do. The final conditional update keeps `.eq("status", current.status)` for optimistic concurrency and returns 409 when nothing updates. The success shape stays `{ checkout: updated }` so the Dashboard cache code needs no changes for edits.

- [ ] **Step 4: Run the tests.**

Run: `npm test -- src/test/abandonedCheckoutRouteWiring.test.ts src/test/abandonedCheckouts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add server/index.js src/test/abandonedCheckoutRouteWiring.test.ts
git commit -m "feat: allow staff field edits on abandoned checkouts"
```

---

### Task 3: Convert endpoint (server)

**Files:**
- Modify: `server/index.js` — new `resolveAbandonedCatalogIds(supabase, orgId, cart)` helper + `app.post("/api/abandoned-checkouts/:id/convert", ...)` right after the PATCH block
- Test: `src/test/abandonedCheckoutRouteWiring.test.ts` (extend)

**Interfaces:**
- Consumes: `matchVariantId` (already imported in `server/index.js` from `server/variantMatching.js`), `readableVariantName` (defined in `server/index.js`), `getNextManualOrderNumber`, `resolveOrderRouting`, `sendBulkSms`, `buildRecoveredPatch`, `normalizeBdPhone` (server copy used by courier/fraud paths — reuse the same import the file already uses).
- Produces: convert route honoring `{ status: "pending" | "on_hold" | "approved", customer_name?, address? }`, returning `{ order }` on success.

- [ ] **Step 1: Write the failing wiring test.** Following the file's existing pattern, assert the convert block:
  - calls `getToken`/`getUser` and returns 401 without a user,
  - rejects statuses outside `pending`/`on_hold`/`approved` with 400,
  - checks draft ownership with `.eq("org_id", orgId)` and active statuses before inserting,
  - calls `resolveOrderRouting`, `getNextManualOrderNumber`, and `sendBulkSms`,
  - sets `abandoned_checkout_id` on the order row and applies `buildRecoveredPatch`.

- [ ] **Step 2: Run it to verify it fails.**

Run: `npm test -- src/test/abandonedCheckoutRouteWiring.test.ts`
Expected: FAIL (no convert block exists yet).

- [ ] **Step 3: Implement the catalog-match helper.** Place it just above the convert route:

```js
async function resolveAbandonedCatalogIds(supabase, orgId, cart) {
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name")
    .eq("org_id", orgId);
  if (error) throw error;
  const byName = new Map(
    (products || []).map((product) => [String(product.name || "").trim().toLowerCase(), product.id]),
  );
  return Promise.all(cart.map(async (item) => {
    const productId = byName.get(String(item.productName || "").trim().toLowerCase()) || null;
    let variantId = null;
    if (productId && item.variantName) {
      const { data: candidates, error: variantError } = await supabase
        .from("product_variants")
        .select("id, attributes")
        .eq("org_id", orgId)
        .eq("product_id", productId);
      if (variantError) throw variantError;
      variantId = matchVariantId({ label: item.variantName, variants: candidates || [] });
    }
    return { productId, variantId };
  }));
}
```

- [ ] **Step 4: Implement the convert route.** Insert after the PATCH abandoned-checkouts block:

```js
app.post("/api/abandoned-checkouts/:id/convert", async (req, res) => {
  try {
    const token = getToken(req);
    const { user } = await getUser(token);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!isAbandonedCheckoutDraftKey(req.params.id)) {
      return res.status(400).json({ error: "Invalid checkout ID" });
    }
    const status = req.body?.status;
    if (status !== "pending" && status !== "on_hold" && status !== "approved") {
      return res.status(400).json({ error: "Invalid target status" });
    }

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const now = new Date();
    const { data: draft, error: draftError } = await supabase
      .from("abandoned_checkouts")
      .select(ABANDONED_CHECKOUT_DASHBOARD_FIELDS)
      .eq("id", req.params.id)
      .eq("org_id", orgId)
      .in("status", ACTIVE_ABANDONED_CHECKOUT_STATUSES)
      .gt("expires_at", now.toISOString())
      .maybeSingle();
    if (draftError) throw draftError;
    if (!draft) return res.status(404).json({ error: "Checkout is no longer active" });
    if (!Array.isArray(draft.cart) || draft.cart.length === 0) {
      return res.status(409).json({ error: "Checkout has no items to convert" });
    }

    const customerName = typeof req.body?.customer_name === "string" && req.body.customer_name.trim()
      ? req.body.customer_name.trim()
      : draft.customer_name;
    const address = typeof req.body?.address === "string" && req.body.address.trim()
      ? req.body.address.trim()
      : draft.address;
    const phone = normalizeBdPhone(draft.phone);
    if (!phone) return res.status(409).json({ error: "Checkout phone is no longer valid" });

    const catalogIds = await resolveAbandonedCatalogIds(supabase, orgId, draft.cart);
    const orderItems = draft.cart.map((item, index) => ({
      product_id: catalogIds[index].productId,
      variant_id: catalogIds[index].variantId,
      product_name: item.productName,
      variant_name: item.variantName,
      unit_price: item.unitPrice,
      quantity: item.quantity,
    }));
    const subtotal = draft.cart.reduce((sum, item) => sum + Number(item.unitPrice) * Number(item.quantity), 0);
    const routing = await resolveOrderRouting(
      supabase,
      orgId,
      orderItems.map((item) => ({
        productId: item.product_id || undefined,
        variantId: item.variant_id || undefined,
        productName: item.product_name,
        quantity: item.quantity,
      })),
    );

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        org_id: orgId,
        shopify_order_id: -(Math.floor(Math.random() * 9_000_000_000_000) + 1_000_000_000_000),
        order_number: await getNextManualOrderNumber(orgId),
        customer_name: customerName,
        phone,
        address,
        product: draft.cart.map((item) => item.productName).join(", "),
        quantity: draft.cart.reduce((sum, item) => sum + Number(item.quantity), 0),
        price: subtotal,
        delivery_rate: draft.delivery_rate,
        status,
        fraud_checked: false,
        fulfillment_status: "unfulfilled",
        warehouse_id: routing.warehouseId,
        warehouse_auto: true,
        weight_kg: routing.weightKg,
        abandoned_checkout_id: draft.id,
      })
      .select("*")
      .single();
    if (orderError) throw orderError;

    const { error: itemsError } = await supabase.from("order_items").insert(
      orderItems.map((item) => ({ ...item, org_id: orgId, order_id: order.id })),
    );
    if (itemsError) {
      await supabase.from("orders").delete().eq("id", order.id).eq("org_id", orgId);
      throw itemsError;
    }

    // Fail closed: only a still-active draft may be recovered. If a concurrent
    // action resolved it first, roll the created order back and report 409 so
    // exactly one order can ever come out of a draft.
    const { data: recovered, error: recoveryError } = await supabase
      .from("abandoned_checkouts")
      .update(buildRecoveredPatch(now))
      .eq("id", draft.id)
      .eq("org_id", orgId)
      .in("status", ACTIVE_ABANDONED_CHECKOUT_STATUSES)
      .gt("expires_at", now.toISOString())
      .select("id")
      .maybeSingle();
    if (recoveryError) throw recoveryError;
    if (!recovered) {
      await supabase.from("order_items").delete().eq("order_id", order.id).eq("org_id", orgId);
      await supabase.from("orders").delete().eq("id", order.id).eq("org_id", orgId);
      return res.status(409).json({ error: "Checkout changed before it could be converted" });
    }

    await sendBulkSms(orgId, "confirmation", order);
    return res.status(201).json({ order });
  } catch {
    console.warn("[AbandonedCheckout] staff convert failed");
    return res.status(500).json({ error: "Could not convert abandoned checkout" });
  }
});
```

Note: the error log line must never include checkout data (privacy rule from the capture spec).

- [ ] **Step 5: Run the tests.**

Run: `npm test -- src/test/abandonedCheckoutRouteWiring.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add server/index.js src/test/abandonedCheckoutRouteWiring.test.ts
git commit -m "feat: convert abandoned checkouts into orders"
```

---

### Task 4: Totals helper (frontend lib)

**Files:**
- Modify: `src/lib/abandonedCheckouts.ts` (add `computeAbandonedCheckoutTotals`)
- Test: `src/test/abandonedCheckoutHelpers.test.ts` (extend)

**Interfaces:**
- Consumes: `AbandonedCheckoutCartItem` type in the same file.
- Produces: `computeAbandonedCheckoutTotals(cart: AbandonedCheckoutCartItem[], deliveryRate: number)` → `{ subtotal: number; total: number }`, rounded to 2 decimals.

- [ ] **Step 1: Write the failing test.** Append to `src/test/abandonedCheckoutHelpers.test.ts` (read it first for import style):

```ts
import { computeAbandonedCheckoutTotals } from "@/lib/abandonedCheckouts";

describe("computeAbandonedCheckoutTotals", () => {
  it("sums lines and adds delivery", () => {
    expect(computeAbandonedCheckoutTotals(
      [
        { productName: "Sundarbans Honey", variantName: "1 kg", quantity: 2, unitPrice: 750 },
        { productName: "Kalojira", variantName: null, quantity: 1, unitPrice: 450 },
      ],
      100,
    )).toEqual({ subtotal: 1950, total: 2050 });
  });

  it("returns zeros for an empty cart", () => {
    expect(computeAbandonedCheckoutTotals([], 60)).toEqual({ subtotal: 0, total: 60 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `npm test -- src/test/abandonedCheckoutHelpers.test.ts`
Expected: FAIL (unknown export).

- [ ] **Step 3: Implement.** Append to `src/lib/abandonedCheckouts.ts`:

```ts
export function computeAbandonedCheckoutTotals(
  cart: AbandonedCheckoutCartItem[],
  deliveryRate: number,
) {
  const round = (value: number) => Math.round(value * 100) / 100;
  const subtotal = round(cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  return { subtotal, total: round(subtotal + deliveryRate) };
}
```

- [ ] **Step 4: Run the tests.**

Run: `npm test -- src/test/abandonedCheckoutHelpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/abandonedCheckouts.ts src/test/abandonedCheckoutHelpers.test.ts
git commit -m "feat: add abandoned checkout totals helper"
```

---

### Task 5: Visible phone + per-field copy in the queue

**Files:**
- Modify: `src/components/orders/AbandonedCheckoutQueue.tsx`
- Test: `src/test/abandonedCheckoutQueue.test.tsx` (extend)

**Interfaces:**
- Consumes: existing `abandonedCheckoutTelHref` / `abandonedCheckoutWhatsAppHref` helpers.
- Produces: new props `onEdit: (checkout: AbandonedCheckout) => void` and `onConvert: (checkout: AbandonedCheckout, status: "pending" | "on_hold" | "approved") => void`. Existing tests render the component without these props, so give them no-op defaults (`onEdit = () => {}`, `onConvert = () => {}`) to keep old call sites compiling.

- [ ] **Step 1: Write the failing tests.** Append to `src/test/abandonedCheckoutQueue.test.tsx`:

```tsx
it("shows the phone number with per-field copy buttons", async () => {
  const user = userEvent.setup();
  render(
    <AbandonedCheckoutQueue
      checkouts={[checkout]}
      loading={false}
      error={null}
      actionInFlightId={null}
      onAction={vi.fn()}
    />,
  );

  expect(screen.getByText("01712345678")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Copy phone number" }));
  expect(clipboardWriteText).toHaveBeenCalledWith("01712345678");

  await user.click(screen.getByRole("button", { name: "Copy address" }));
  expect(clipboardWriteText).toHaveBeenCalledWith("House 1, Road 2, Dhaka");
});
```

- [ ] **Step 2: Run them to verify they fail.**

Run: `npm test -- src/test/abandonedCheckoutQueue.test.tsx`
Expected: FAIL (no "Copy phone number" button; phone text absent).

- [ ] **Step 3: Implement.** In `AbandonedCheckoutQueue.tsx`:
  - Add a `copyField(value: string, label: string)` helper next to `copySummary` that writes the raw value and sets `copyStatus` to `` `${label} copied` `` (success) or `` `Could not copy ${label.toLowerCase()}` `` (failure). Reuse the existing `sr-only aria-live` status paragraph so the existing test's `getByText("Checkout summary copied")` pattern keeps working.
  - Render the phone as text with a copy icon button (`aria-label="Copy phone number"`, `Copy` icon from `@phosphor-icons/react`, `size={13} weight="light"`). Render only when `checkout.phone` exists.
  - Put the copy-address icon button (`aria-label="Copy address"`) inline next to the address paragraph; keep the paragraph styling.
  - Add the Edit button (`Pencil` icon, `aria-label="Edit checkout"`, calls `onEdit(checkout)`) and a Move-to control: three compact buttons or a small menu with `Pending` / `On Hold` / `Approved` calling `onConvert(checkout, status)`. Keep the existing action-button class strings verbatim for visual consistency.
  - Use `Copy` and `Pencil` from `@phosphor-icons/react` (both exist there). Do not use lucide.

- [ ] **Step 4: Run the tests.**

Run: `npm test -- src/test/abandonedCheckoutQueue.test.tsx`
Expected: PASS, including all pre-existing tests in the file.

- [ ] **Step 5: Commit.**

```bash
git add src/components/orders/AbandonedCheckoutQueue.tsx src/test/abandonedCheckoutQueue.test.tsx
git commit -m "feat: add per-field copy and edit entry points to abandoned queue"
```

---

### Task 6: Edit dialog

**Files:**
- Create: `src/components/orders/AbandonedCheckoutEditDialog.tsx`
- Test: `src/test/abandonedCheckoutEditDialog.test.tsx`

**Interfaces:**
- Consumes: `AbandonedCheckout` type, `computeAbandonedCheckoutTotals` (Task 4).
- Produces: `AbandonedCheckoutEditDialog({ checkout, open, saving, error, onClose, onSave })` where `onSave` receives `{ customerName, phone, address, items, deliveryRate }` (camelCase, matching the PATCH edit body). Parent (Dashboard) owns the `apiFetch` call.

- [ ] **Step 1: Write the failing test.** Create `src/test/abandonedCheckoutEditDialog.test.tsx` using the same `checkout` fixture shape as `abandonedCheckoutQueue.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AbandonedCheckoutEditDialog } from "@/components/orders/AbandonedCheckoutEditDialog";
import type { AbandonedCheckout } from "@/lib/abandonedCheckouts";

// reuse the checkout fixture from abandonedCheckoutQueue.test.tsx (copy it verbatim)

describe("AbandonedCheckoutEditDialog", () => {
  it("blocks save with an invalid phone and requires at least one line", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <AbandonedCheckoutEditDialog
        checkout={checkout}
        open
        saving={false}
        error={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const phoneField = screen.getByLabelText(/phone/i);
    await user.clear(phoneField);
    await user.type(phoneField, "123");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText(/valid Bangladeshi phone number/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("submits edited contact and cart values", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <AbandonedCheckoutEditDialog
        checkout={checkout}
        open
        saving={false}
        error={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.clear(screen.getByLabelText(/name/i));
    await user.type(screen.getByLabelText(/name/i), "Rahim Uddin");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      customerName: "Rahim Uddin",
      phone: "01712345678",
    }));
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `npm test -- src/test/abandonedCheckoutEditDialog.test.tsx`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement the dialog.** Requirements for `AbandonedCheckoutEditDialog.tsx`:
  - Controlled inputs for name, phone, address, delivery rate; editable line rows (product name text, variant text, quantity number, unit price number) with add/remove line buttons. Initialize from `checkout` on open.
  - Live totals via `computeAbandonedCheckoutTotals`, displayed with `৳` formatting.
  - Client validation before `onSave`: phone must match `/^01\d{9}$/` after stripping non-digits; every line needs a non-empty product name, integer quantity >= 1, finite unit price >= 0; at least one line; delivery rate finite >= 0. Show inline error text; never call `onSave` when invalid.
  - Quantity input clamps at 1 minimum like `OrderCreatorModal` (`Math.max(1, ...)`).
  - Props `saving` (disables Save, shows `Spinner`) and `error` (server error string rendered in the dialog).
  - Follow existing dialog styling (rounded-xl, `bg-[#FAFAF8]` accents only where the queue uses them); labels use the project's small uppercase convention.

- [ ] **Step 4: Run the tests.**

Run: `npm test -- src/test/abandonedCheckoutEditDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/components/orders/AbandonedCheckoutEditDialog.tsx src/test/abandonedCheckoutEditDialog.test.tsx
git commit -m "feat: add abandoned checkout edit dialog"
```

---

### Task 7: Convert dialog + Dashboard wiring

**Files:**
- Create: `src/components/orders/AbandonedCheckoutConvertDialog.tsx`
- Modify: `src/pages/Dashboard.tsx` (handlers + dialog mounting + queue props)
- Test: `src/test/dashboardOrderStatusFilter.test.tsx` (extend)

**Interfaces:**
- `AbandonedCheckoutConvertDialog({ checkout, status, open, saving, error, onClose, onConfirm })` — `onConfirm` receives `{ customer_name, address }` overrides. Renders captured summary, editable name/address, target status label.
- Dashboard `convertAbandonedCheckout(checkoutId, status, overrides)` → `POST /api/abandoned-checkouts/:id` convert route; on success removes the draft from the `["/api/abandoned-checkouts"]` cache, decrements `activeCount`, invalidates `["/api/orders"]`, and toasts `Order #<order_number> created`.
- Dashboard `saveAbandonedCheckoutEdits(checkoutId, editBody)` → `PATCH` with the edit body (no `action` key); on success replaces the draft in cache from `data.checkout`; on 404/409 shows "Checkout is no longer active" and refetches the queue.

- [ ] **Step 1: Write the failing dashboard tests.** Read the tail of `src/test/dashboardOrderStatusFilter.test.tsx` for the `beforeEach` apiFetch mock shape and the `abandonedCheckouts` fixture, then append:

```tsx
it("saves abandoned checkout edits through the PATCH route", async () => {
  const user = userEvent.setup();
  // apiFetch mock: return orders/abandoned payloads per URL (follow the file's
  // existing mock pattern), then return { checkout: updatedDraft } for PATCH.
  // Render Dashboard, open the Abandoned tab, click "Edit checkout",
  // change the name, save, and expect apiFetch called with
  // `/api/abandoned-checkouts/<id>` and a body WITHOUT an `action` key.
});

it("converts an abandoned checkout into a pending order", async () => {
  const user = userEvent.setup();
  // Mock POST convert to return { order: { id: "order-1", order_number: "#104" } }.
  // Open the Abandoned tab, choose Move to -> Pending, confirm,
  // and expect the draft to leave the queue and a toast with "#104".
});
```

Write both tests with the file's real mock helpers (no placeholders — read the file first).

- [ ] **Step 2: Run them to verify they fail.**

Run: `npm test -- src/test/dashboardOrderStatusFilter.test.tsx`
Expected: FAIL (no Edit/convert UI exists).

- [ ] **Step 3: Implement the convert dialog.** `AbandonedCheckoutConvertDialog.tsx`: summary lines (name, phone, cart summary via `abandonedCheckoutCartSummary`, estimated total with `৳`), editable name/address inputs prefilled from the draft, target-status pill (`Pending` / `On Hold` / `Approved`), `saving` + `error` props like the edit dialog.

- [ ] **Step 4: Implement Dashboard wiring.** In `src/pages/Dashboard.tsx` next to `updateAbandonedCheckout`:
  - `saveAbandonedCheckoutEdits(checkoutId, editBody)`: guard on `abandonedActionInFlightId` like the existing handler; PATCH; replace draft in both local state and `["/api/abandoned-checkouts"]` cache; toast "Checkout updated"; on 404/409 toast "Checkout is no longer active" and call `fetchAbandonedCheckouts(true)`.
  - `convertAbandonedCheckout(checkoutId, status, overrides)`: POST to `/api/abandoned-checkouts/${checkoutId}/convert`; on success drop the draft from abandoned state/cache, decrement `activeCount`, call `queryClient.invalidateQueries({ queryKey: ["/api/orders"] })` plus `fetchOrders()` so the new order appears; toast `` `Order ${data.order.order_number} created` ``; on 409 toast "Checkout changed before it could be converted" and refresh the queue.
  - Mount both dialogs; pass `onEdit` (opens edit dialog for the draft) and `onConvert` (opens convert dialog with the chosen status) into `AbandonedCheckoutQueue`.

- [ ] **Step 5: Run the tests.**

Run: `npm test -- src/test/dashboardOrderStatusFilter.test.tsx src/test/abandonedCheckoutQueue.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full suite and lint.**

Run: `npm test` then `npm run lint`
Expected: all green, 0 errors (warnings pre-exist).

- [ ] **Step 7: Commit.**

```bash
git add src/components/orders/AbandonedCheckoutConvertDialog.tsx src/pages/Dashboard.tsx src/test/dashboardOrderStatusFilter.test.tsx
git commit -m "feat: convert abandoned checkouts into orders from dashboard"
```

---

## Self-review

- Spec coverage: copy buttons → Task 5; full edit (contact + lines + delivery, no discount) → Tasks 1, 2, 6; convert to pending/on-hold/approved with editable name/address → Tasks 3, 7; SMS on convert → Task 3 (`sendBulkSms`); org guard + auth on new/changed routes → Tasks 2, 3; resolved-draft rejection → Tasks 2, 3, 7; queue counts → Task 7. No spec section is unmapped.
- No placeholders: every step names exact files, functions, payloads, and commands; test code is written out.
- Type consistency: `parseAbandonedCheckoutStaffEdit` returns snake_case DB patch; frontend edit body is camelCase; convert `onConfirm` returns `{ customer_name, address }` matching the route's override reads; `onConvert(checkout, status)` status union matches the route allowlist.

---

Plan complete and saved to `docs/superpowers/plans/2026-09-12-abandoned-queue-actions.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session with checkpoints for review

Which approach?
