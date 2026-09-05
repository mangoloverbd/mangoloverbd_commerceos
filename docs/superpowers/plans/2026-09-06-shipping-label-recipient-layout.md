# Shipping Label Recipient Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shipping label's dense customer field grid with the approved Recipient-first hierarchy.

**Architecture:** Keep all changes inside the existing Dashboard-only shipping-label generator. Replace the current order/customer and delivery-detail blocks with one recipient block, add a small local phone-display formatter, and update the focused HTML-generation tests before changing production code.

**Tech Stack:** TypeScript, HTML/CSS print templates, Vitest

## Global Constraints

- Keep the physical label at 3 inches wide by 4 inches high.
- Keep the output black-and-white and suitable for thermal printers.
- Keep barcode, CN resolution, product rows, Invoice PDF, and Inbox Orders printing unchanged.
- Show `ORDER #<number>` on the left and an outlined `COD ৳<amount>` box on the right.
- Use one thin solid divider under the metadata row; no dashed divider in the recipient section.
- Show `DELIVER TO`, then the large uppercase customer name, large phone number, and full-width address.
- Group a plain 11-digit Bangladeshi phone number as five digits plus six digits without changing its digits.
- Remove redundant `Name:`, `Phone:`, and `Address:` labels from this section.

---

### Task 1: Implement the Recipient-first details block

**Files:**
- Modify: `src/test/shippingLabelPrinter.test.ts`
- Modify: `src/utils/shippingLabelPrinter.ts`

**Interfaces:**
- Consumes: `buildShippingLabelHtml(orders, businessName?)`
- Produces: the same `ShippingLabelHtmlResult` with revised recipient markup and styling

- [x] **Step 1: Write failing recipient-layout tests**

Update the existing rendered-details test to assert:

```ts
expect(result.html).toContain('<div class="shipment-meta">');
expect(result.html).toContain('<span class="order-reference">ORDER <strong>#ML567907</strong></span>');
expect(result.html).toContain('<span class="cod-box">COD ৳1,580</span>');
expect(result.html).toContain('<div class="deliver-to">DELIVER TO</div>');
expect(result.html).toContain('<div class="recipient-name">Rahim Uddin</div>');
expect(result.html).toContain('<div class="recipient-phone">01700 000000</div>');
expect(result.html).toContain('<div class="recipient-address">Dhaka</div>');
expect(result.html).not.toContain("<b>Name:</b>");
expect(result.html).not.toContain("<b>Phone:</b>");
expect(result.html).not.toContain("<b>Address:</b>");
```

Add a second case with `phone: "+8801700000000"` and assert that non-11-digit values remain unchanged.

- [x] **Step 2: Run the focused test and verify red**

Run: `npm test -- src/test/shippingLabelPrinter.test.ts`

Expected: FAIL because the output still contains `.order-customer`, `.delivery-details`, and labeled fields.

- [x] **Step 3: Implement the minimal recipient markup and CSS**

Add a local formatter:

```ts
const formatShippingPhone = (phone: string) => {
  const value = phone.trim();
  return /^\d{11}$/.test(value) ? `${value.slice(0, 5)} ${value.slice(5)}` : value;
};
```

Replace the old details blocks with:

```html
<div class="recipient-details">
  <div class="shipment-meta">
    <span class="order-reference">ORDER <strong>#...</strong></span>
    <span class="cod-box">COD ৳...</span>
  </div>
  <div class="deliver-to">DELIVER TO</div>
  <div class="recipient-name">...</div>
  <div class="recipient-phone">...</div>
  <div class="recipient-address">...</div>
</div>
```

Style the metadata row with a solid bottom border, the COD amount with a 2px outline, the name at 18–20px bold uppercase, the phone at 14–16px bold, and the address at 10–12px with wrapping. Remove obsolete `.order-customer` and `.delivery-details` rules.

- [x] **Step 4: Run the focused test and verify green**

Run: `npm test -- src/test/shippingLabelPrinter.test.ts`

Expected: PASS.

- [x] **Step 5: Run repository verification**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: tests and build pass; lint reports no errors.

- [x] **Step 6: Review and commit**

Confirm only the Dashboard shipping-label HTML/CSS and its tests changed. Then commit:

```bash
git add src/test/shippingLabelPrinter.test.ts src/utils/shippingLabelPrinter.ts
git commit -m "feat: prioritize recipients on shipping labels"
```

### Task 2: Merge locally

**Files:**
- Review: `main..feat/shipping-label-recipient-layout`

**Interfaces:**
- Produces: local `main` containing the approved recipient layout

- [x] **Step 1: Run completion verification**

Run: `npm test && npm run lint && npm run build && git diff --check main...HEAD`

- [x] **Step 2: Merge without pushing**

```bash
git switch main
git merge --no-ff feat/shipping-label-recipient-layout -m "merge: improve shipping label recipient layout"
```

- [x] **Step 3: Confirm clean local state**

Run: `git status --short && git log -3 --oneline`

Expected: clean local `main`; do not push.
