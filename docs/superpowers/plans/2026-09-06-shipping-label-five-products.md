# Shipping Label Five-Product Capacity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compress the shipping-label summary to about 40% of the label so the product table can fit up to five normal product rows.

**Architecture:** Group all content above the product table in `.label-summary`, give it a 1.58-inch minimum height, and reduce only its vertical dimensions. Give product rows predictable compact heights while preserving the existing 3-by-4-inch page and all content.

**Tech Stack:** TypeScript, HTML/CSS print template, Vitest

## Global Constraints

- Keep one 3-inch by 4-inch label per order.
- Preserve barcode scanability, full recipient data, and the single-line adaptive contact row.
- Let wrapping addresses grow slightly rather than clip.
- Fit five normal bilingual product entries without changing product data.

---

### Task 1: Allocate label height for five products

**Files:**
- Test: `src/test/shippingLabelPrinter.test.ts`
- Modify: `src/utils/shippingLabelPrinter.ts`

**Interfaces:**
- Consumes: `buildShippingLabelHtml(orders, businessName?)`
- Produces: unchanged `ShippingLabelHtmlResult` with compact summary and table CSS

- [ ] **Step 1: Write failing capacity tests**

Generate an order with five structured items and assert all five rows render. Assert `.label-summary` wraps the top content and its CSS includes `min-height: 1.58in`. Assert product rows use `height: 0.29in`.

- [ ] **Step 2: Verify red**

Run `npm test -- src/test/shippingLabelPrinter.test.ts`; expect failure because `.label-summary` and row-height allocation do not exist.

- [ ] **Step 3: Implement compact summary and table sizing**

Wrap the header, barcode, CN, and recipient details in:

```html
<div class="label-summary">...</div>
```

Add `.label-summary { min-height: 1.58in; flex: 0 0 auto; }`. Reduce the logo area to 0.25in, barcode area to 0.32in, barcode SVG to 0.29in, CN type to 14px, and summary padding/gaps proportionally. Set product rows to 0.29in with compact 7.1px table type.

- [ ] **Step 4: Verify green**

Run `npm test -- src/test/shippingLabelPrinter.test.ts`.

- [ ] **Step 5: Verify, review, and commit**

Run `npm test`, `npm run lint`, `npm run build`, and `git diff --check`; review the diff and commit as `feat: fit five products on shipping labels`.

- [ ] **Step 6: Merge locally**

Merge `feat/shipping-label-five-products` into local `main`, rerun `npm test`, and delete the feature branch. Do not push.
