# A4 Printable Invoice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace invoice downloads with a shared A4 portrait Bold Shipping Style invoice that opens the native print dialog from Dashboard and Inbox Orders.

**Architecture:** Replace the jsPDF implementation in `invoiceGenerator.ts` with a pure HTML builder plus hidden-iframe print wrapper. Extend the printable order shape with structured items and notes, then wire Invoice to the A4 printer and Print to the existing shipping-label printer on both order screens.

**Tech Stack:** TypeScript, HTML/CSS print templates, JsBarcode, Vitest

## Global Constraints

- Use exact A4 portrait pages: 210mm by 297mm, one order per page.
- Use the approved black-and-white Bold Shipping Style.
- Product rows must use Product, Weight, and Qty without invented per-line prices.
- Invoice opens native print and never downloads a PDF.
- Invoice printing does not require a courier identifier; sticker printing still does.
- Dashboard and Inbox Orders must share the invoice design.

---

### Task 1: Build and test the A4 invoice document

**Files:**
- Create: `src/test/invoicePrinter.test.ts`
- Replace: `src/utils/invoiceGenerator.ts`

**Interfaces:**
- Produces: exported `InvoiceItem`, `InvoiceOrder`, `buildInvoiceHtml(orders, businessName?)`, and `printInvoice(orders, businessName?)`
- `InvoiceItem`: `{ product_name: string | null; variant_name: string | null; quantity: number }`
- `buildInvoiceHtml`: `(orders: InvoiceOrder[], businessName?: string) => string`
- `printInvoice`: `(orders: InvoiceOrder[], businessName?: string) => void`

- [x] **Step 1: Write failing invoice HTML tests**

Create tests using a structured two-item order. Assert A4 portrait CSS, 210mm by 297mm sizing, one `.invoice-page` per order, Bold Shipping header, date/status/courier/CN, customer/continuous phone/cleaned address, Product/Weight/Qty table, notes, subtotal/delivery/grand-total/due values, and HTML escaping. Add a tracking-only barcode case and a no-identifier case that renders `NOT ASSIGNED` without an SVG barcode.

- [x] **Step 2: Verify red**

Run `npm test -- src/test/invoicePrinter.test.ts`; expect failure because `buildInvoiceHtml` and structured invoice rows do not exist.

- [x] **Step 3: Replace the PDF generator with the HTML builder**

Implement the exported types and pure builder. Resolve barcode data from `consignment_id` then `tracking_code`, generate Code 128 locally, normalize phone whitespace, clean addresses, escape dynamic text, prefer structured item rows, and retain legacy comma/inline-quantity fallback. Render the approved A4 sections and print CSS.

- [x] **Step 4: Implement native printing**

Implement `printInvoice()` with a titled hidden iframe. Write `buildInvoiceHtml()` output, wait for images, call `focus()` and `print()`, clean up after five seconds, and throw if iframe document setup fails. Do not call any download fallback.

- [x] **Step 5: Verify green and commit**

Run `npm test -- src/test/invoicePrinter.test.ts` and `git diff --check`, then commit as `feat: redesign invoices for A4 printing`.

---

### Task 2: Wire Invoice and Print actions on both order screens

**Files:**
- Create: `src/test/invoiceActionWiring.test.ts`
- Modify: `src/components/OrdersTable.tsx`
- Modify: `src/pages/InboxOrders.tsx`
- Modify: `src/test/shippingLabelPrinter.test.ts`

**Interfaces:**
- Consumes: `printInvoice()` from Task 1
- Consumes: `printShippingLabels()` from `src/utils/shippingLabelPrinter.ts`
- Produces: exported `toInvoiceOrder()` mapping with structured printable items

- [x] **Step 1: Write failing wiring and mapping tests**

Assert Dashboard Invoice dynamically imports and calls `printInvoice`, Dashboard Print still calls `printShippingLabels`, Inbox Invoice calls `printInvoice`, and Inbox Print dynamically imports and calls `printShippingLabels`. Test `toInvoiceOrder()` maps product text, quantity, notes, delivery rate, consignment ID, and tracking code.

- [x] **Step 2: Verify red**

Run `npm test -- src/test/invoiceActionWiring.test.ts src/test/shippingLabelPrinter.test.ts`; expect failures because Invoice still downloads and Inbox Print still prints the old invoice.

- [x] **Step 3: Update Dashboard actions**

Replace the loading/download invoice handler with a native print handler that dynamically imports `printInvoice`, calls it for selected orders, and reports initialization errors. Keep the adjacent Print action connected to shipping labels.

- [x] **Step 4: Update Inbox mapping and actions**

Remove the `generateInvoice` import and download handler. Extend `toInvoiceOrder()` with structured items, notes, delivery rate, and courier identifiers. Connect Invoice to A4 invoice printing and Print to shipping-label printing, including the missing-CN/tracking warning.

- [x] **Step 5: Verify green and commit**

Run `npm test -- src/test/invoiceActionWiring.test.ts src/test/shippingLabelPrinter.test.ts src/test/invoicePrinter.test.ts` and `git diff --check`, then commit as `feat: print invoices from order actions`.

---

### Task 3: Remove obsolete PDF dependencies and verify

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Removes: unused direct dependencies `jspdf` and `jspdf-autotable`

- [ ] **Step 1: Remove dependencies**

Run `npm uninstall jspdf jspdf-autotable` after confirming no source imports remain.

- [ ] **Step 2: Run complete verification**

Run `npm test`, `npm run lint`, `npm run build`, and `git diff --check`.

- [ ] **Step 3: Review and commit**

Review the complete branch against `main`, then commit dependency changes as `chore: remove obsolete invoice PDF dependencies`.
