# Shipping Label Contact Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the shipping-label customer name and phone on one smaller line separated by a hyphen, with adaptive sizing for long names.

**Architecture:** Keep the existing Dashboard-only label generator. Replace the separate name and phone elements with one escaped contact row and assign one of four CSS size classes based on the unescaped combined display length.

**Tech Stack:** TypeScript, HTML/CSS print template, Vitest

## Global Constraints

- Render `<UPPERCASE NAME> - <PHONE>` on one no-wrap line.
- Use 15px normally, 13px above 32 characters, 11px above 40, and 9px above 48.
- Preserve 11-digit phone grouping, escaping, the Balanced stack metadata/address, barcode, products, and 3-by-4-inch pagination.

---

### Task 1: Add the adaptive contact row

**Files:**
- Test: `src/test/shippingLabelPrinter.test.ts`
- Modify: `src/utils/shippingLabelPrinter.ts`

**Interfaces:**
- Consumes: `buildShippingLabelHtml(orders, businessName?)`
- Produces: unchanged `ShippingLabelHtmlResult` with `.recipient-contact` markup

- [ ] **Step 1: Write failing tests**

Assert normal values render as:

```ts
expect(result.html).toContain(
  '<div class="recipient-contact contact-size-normal">Rahim Uddin - 01700 000000</div>',
);
expect(result.html).not.toContain('class="recipient-name"');
expect(result.html).not.toContain('class="recipient-phone"');
```

Add generated-HTML cases for lengths above 32, 40, and 48 characters and assert `contact-size-compact`, `contact-size-small`, and `contact-size-tight` respectively.

- [ ] **Step 2: Verify red**

Run `npm test -- src/test/shippingLabelPrinter.test.ts`; expect failures because name and phone still use separate elements.

- [ ] **Step 3: Implement size selection and markup**

Add:

```ts
const contactSizeClass = (length: number) => {
  if (length > 48) return "contact-size-tight";
  if (length > 40) return "contact-size-small";
  if (length > 32) return "contact-size-compact";
  return "contact-size-normal";
};
```

Build the display value from the raw fallback-aware name and formatted phone, calculate its code-point length, then escape the name and phone independently inside one `.recipient-contact` element.

Replace the separate CSS rules with a bold no-wrap contact row and the four specified font sizes.

- [ ] **Step 4: Verify green**

Run `npm test -- src/test/shippingLabelPrinter.test.ts`.

- [ ] **Step 5: Verify and commit**

Run `npm test`, `npm run lint`, `npm run build`, and `git diff --check`; then commit as `feat: combine shipping label contact details`.
