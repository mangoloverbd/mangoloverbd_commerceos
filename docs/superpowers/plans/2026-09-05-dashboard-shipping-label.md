# Dashboard Shipping Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print selected Dashboard orders as scannable 3-by-4-inch Mango Lover thermal shipping labels without changing invoice downloads or Inbox Orders printing.

**Architecture:** Add a focused shipping-label utility that resolves CN values, generates Code 128 SVG barcodes, builds escaped print HTML, validates the whole selection, and opens the existing hidden-iframe print flow. Wire only the Dashboard orders table to this utility. Reuse the API's existing item enrichment, which already supplies variant-first, product-fallback `weight_kg` values.

**Tech Stack:** TypeScript, browser DOM/SVG, JsBarcode, Vitest, existing React/toast integration

## Global Constraints

- Physical output is exactly 3 inches wide by 4 inches high, portrait.
- Output is black-and-white and suitable for thermal printers.
- Barcode and CN prefer `consignment_id` to match fulfillment and fall back to `tracking_code`.
- Printing stops before opening a dialog if any selected order lacks both identifiers.
- Product rows show Product, Weight, and Quantity; Weight displays the selected variant label.
- The downloadable Invoice PDF and Inbox Orders print action remain unchanged.
- Every selected order prints on its own page.

## File Structure

- Create `src/utils/shippingLabelPrinter.ts`: label data types, validation, barcode SVG generation, escaped HTML generation, and iframe printing.
- Create `src/test/shippingLabelPrinter.test.ts`: unit coverage for CN resolution, validation, content, escaping, barcode, item weights, dimensions, and pagination.
- Modify `src/components/OrdersTable.tsx`: expose enriched item weight in the local type and route Dashboard Print to the new utility with a warning toast.
- Add `public/mango-lover-print-logo.png`: browser-compatible monochrome-capable source converted from the supplied AVIF.
- Modify `package.json` and `package-lock.json`: add `jsbarcode` and its TypeScript declarations.

---

### Task 1: Build and test the shipping-label generator

**Files:**
- Create: `src/utils/shippingLabelPrinter.ts`
- Create: `src/test/shippingLabelPrinter.test.ts`
- Create: `public/mango-lover-print-logo.png`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `getShippingLabelCn(order): string | null`
- Produces: `buildShippingLabelHtml(orders, businessName?): { ok: true; html: string } | { ok: false; missingOrderNumbers: string[] }`
- Produces: `printShippingLabels(orders, businessName?): { ok: true } | { ok: false; missingOrderNumbers: string[] }`

- [ ] **Step 1: Write the failing utility tests**

Create tests using representative structured items:

```ts
const order = {
  id: "order-1",
  order_number: "#ML567907",
  customer_name: "Rahim Uddin",
  phone: "01700000000",
  address: "Dhaka, Bangladesh",
  product: null,
  quantity: 3,
  price: 1500,
  delivery_rate: 80,
  tracking_code: "20250523001",
  consignment_id: 999,
  items: [{ product_name: "Honey", variant_name: "1 kg", weight_kg: 1, quantity: 2 }],
};
```

Assert that consignment ID wins over tracking code, missing CN returns all affected order numbers without HTML, generated HTML contains Code 128 SVG bars and all customer/COD/item fields, dangerous HTML is escaped, CSS includes `@page { size: 3in 4in; margin: 0; }`, and two orders yield two page sections.

- [ ] **Step 2: Run the focused test and verify red**

Run: `npm test -- src/test/shippingLabelPrinter.test.ts`

Expected: FAIL because `@/utils/shippingLabelPrinter` does not exist.

- [ ] **Step 3: Add the barcode dependency and print logo**

Run:

```bash
npm install jsbarcode
npm install --save-dev @types/jsbarcode
sips -s format png "$HOME/Downloads/imgi_67_mango-lover-desktop-header-footer-img-700x137.avif" --out public/mango-lover-print-logo.png
```

- [ ] **Step 4: Implement the generator**

Define a narrow `ShippingLabelOrder` type and implement:

```ts
export function getShippingLabelCn(order: ShippingLabelOrder): string | null {
  const value = order.consignment_id || order.tracking_code;
  return value == null || String(value).trim() === "" ? null : String(value).trim();
}
```

Generate Code 128 as an inline SVG with `JsBarcode(svg, cn, { format: "CODE128", displayValue: false, margin: 0, background: "#fff", lineColor: "#000" })`. Build one `.shipping-label` section per order with logo, barcode, CN, order/customer details, phone, address, COD, and structured item rows. Display each selected variant label in the Weight column. Fall back to legacy product and quantity fields when `items` is empty. Escape every dynamic HTML value.

Validate all orders before generating any page. `printShippingLabels` must create no iframe for an invalid selection; for valid data it writes the HTML into a hidden iframe, waits for embedded images to settle, focuses the frame, prints, and removes it after the existing cleanup delay.

- [ ] **Step 5: Run the focused test and verify green**

Run: `npm test -- src/test/shippingLabelPrinter.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the generator**

```bash
git add package.json package-lock.json public/mango-lover-print-logo.png src/utils/shippingLabelPrinter.ts src/test/shippingLabelPrinter.test.ts
git commit -m "feat: add thermal shipping label printer"
```

---

### Task 2: Wire Dashboard Print and verify isolation

**Files:**
- Modify: `src/components/OrdersTable.tsx:136-169,915-925`
- Modify: `src/test/shippingLabelPrinter.test.ts`

**Interfaces:**
- Consumes: `printShippingLabels(orders, businessName?)`
- Preserves: shared `printInvoice()` use in `src/pages/InboxOrders.tsx`

- [ ] **Step 1: Add a failing wiring/isolation test**

Read `OrdersTable.tsx` and `InboxOrders.tsx` as source text. Assert that the Dashboard imports and calls `printShippingLabels`, its item type includes `weight_kg`, and Inbox Orders still imports and calls `printInvoice`.

- [ ] **Step 2: Run the focused test and verify red**

Run: `npm test -- src/test/shippingLabelPrinter.test.ts`

Expected: FAIL because the Dashboard still imports `printInvoice` dynamically.

- [ ] **Step 3: Wire the Dashboard action**

Extend `OrderItemSummary` with `weight_kg: number | null`. Replace the Dashboard Print handler's dynamic invoice import with `printShippingLabels`. If it returns `{ ok: false }`, show one error toast listing the missing order numbers and do not print. Keep the existing generic catch toast for unexpected failures.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/test/shippingLabelPrinter.test.ts`

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all commands succeed without errors.

- [ ] **Step 6: Commit the wiring**

```bash
git add src/components/OrdersTable.tsx src/test/shippingLabelPrinter.test.ts
git commit -m "feat: print dashboard orders as shipping labels"
```

---

### Task 3: Review and merge locally

**Files:**
- Review: all changes from `main..feat/dashboard-shipping-label`

**Interfaces:**
- Produces: local `main` containing the tested shipping-label feature.

- [ ] **Step 1: Review the branch diff**

Confirm that no authenticated API call, database query, schema, Invoice PDF behavior, or Inbox Orders print behavior changed. Confirm dynamic values are escaped and barcodes are generated locally.

- [ ] **Step 2: Re-run completion verification**

Run: `npm test && npm run lint && npm run build && git diff --check main...HEAD`

Expected: all commands succeed.

- [ ] **Step 3: Merge into local main**

```bash
git switch main
git merge --no-ff feat/dashboard-shipping-label
```

- [ ] **Step 4: Confirm local merge state**

Run: `git status --short && git log -4 --oneline`

Expected: clean working tree with the merge commit at local `main`; do not push.
