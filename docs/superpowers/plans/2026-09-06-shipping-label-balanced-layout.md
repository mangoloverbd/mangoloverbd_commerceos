# Shipping Label Balanced Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Dashboard shipping label's Recipient-first customer block with the approved Balanced stack layout.

**Architecture:** Keep the existing Dashboard-only HTML label generator and phone formatter. Change only the recipient markup/CSS and its focused unit assertions; barcode, CN handling, product rows, pagination, Invoice PDF, and Inbox Orders remain untouched.

**Tech Stack:** TypeScript, HTML/CSS print template, Vitest

## Global Constraints

- Preserve the 3-inch by 4-inch portrait thermal label.
- Use equal-width Order and COD columns without an outlined COD box.
- Use `CUSTOMER` and `ADDRESS` labels, a prominent phone number, solid rules, and no dashed separators inside the customer section.
- Preserve phone grouping for plain 11-digit numbers.
- Preserve all existing barcode, validation, product, pagination, and print-flow behavior.

---

### Task 1: Replace the recipient block

**Files:**
- Test: `src/test/shippingLabelPrinter.test.ts`
- Modify: `src/utils/shippingLabelPrinter.ts`

**Interfaces:**
- Consumes: `buildShippingLabelHtml(orders, businessName?)`
- Produces: unchanged `ShippingLabelHtmlResult` with Balanced stack markup

- [ ] **Step 1: Write failing layout assertions**

Replace the Recipient-first assertions with:

```ts
expect(result.html).toContain('<div class="meta-field"><span>ORDER</span><strong>#ML567907</strong></div>');
expect(result.html).toContain('<div class="meta-field"><span>COD</span><strong>৳1,580</strong></div>');
expect(result.html).toContain('<div class="customer-label">CUSTOMER</div>');
expect(result.html).toContain('<div class="recipient-phone">01700 000000</div>');
expect(result.html).toContain('<div class="address-label">ADDRESS</div>');
expect(result.html).not.toContain('class="cod-box"');
expect(result.html).not.toContain("DELIVER TO");
```

- [ ] **Step 2: Verify the focused test fails**

Run `npm test -- src/test/shippingLabelPrinter.test.ts` and confirm the failure is caused by the old Recipient-first markup.

- [ ] **Step 3: Implement the Balanced stack markup and CSS**

Replace the customer block with:

```html
<div class="recipient-details">
  <div class="shipment-meta">
    <div class="meta-field"><span>ORDER</span><strong>#...</strong></div>
    <div class="meta-field"><span>COD</span><strong>৳...</strong></div>
  </div>
  <div class="customer-label">CUSTOMER</div>
  <div class="recipient-name">...</div>
  <div class="recipient-phone">...</div>
  <div class="recipient-address">
    <div class="address-label">ADDRESS</div>
    <div>...</div>
  </div>
</div>
```

Use a two-column grid for `.shipment-meta`, a solid lower rule, 18px bold phone text, and a solid upper rule for `.recipient-address`. Remove `.cod-box` and `.deliver-to` styles while preserving escaped values.

- [ ] **Step 4: Verify the focused test passes**

Run `npm test -- src/test/shippingLabelPrinter.test.ts`.

- [ ] **Step 5: Verify the repository**

Run `npm test`, `npm run lint`, `npm run build`, and `git diff --check`.

- [ ] **Step 6: Review and commit**

Confirm only the Balanced stack plan, template, and tests changed, then commit with `feat: balance shipping label recipient details`.
