# Shipping Label Address Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the delivery address from Dashboard shipping labels and print phone numbers without inserted spaces.

**Architecture:** Keep the existing Dashboard-only HTML label generator. Remove address rendering and its CSS, return trimmed phone values unchanged, and release the summary block's old minimum height so products can use the reclaimed space.

**Tech Stack:** TypeScript, HTML/CSS print template, Vitest

## Global Constraints

- Keep the `CUSTOMER` label and `<UPPERCASE NAME> - <PHONE>` contact row.
- Keep the contact row on one line with its existing adaptive font classes.
- Do not render the delivery address or an `ADDRESS` heading.
- Do not insert spaces into phone numbers.
- Keep all non-Dashboard print flows unchanged.

---

### Task 1: Remove address and phone grouping

**Files:**
- Test: `src/test/shippingLabelPrinter.test.ts`
- Modify: `src/utils/shippingLabelPrinter.ts`

**Interfaces:**
- Consumes: `buildShippingLabelHtml(orders, businessName?)`
- Produces: unchanged `ShippingLabelHtmlResult`

- [ ] **Step 1: Write failing tests**

Update recipient assertions to require `Rahim Uddin - 01700000000`, reject `recipient-address`, `address-label`, and `ADDRESS`, and verify the removed address text is absent. Update the five-row layout assertion to require `.label-summary { flex: 0 0 auto; }` without the old `1.58in` minimum height.

- [ ] **Step 2: Verify red**

Run `npm test -- src/test/shippingLabelPrinter.test.ts`; expect failures from the grouped phone, rendered address, and old summary minimum height.

- [ ] **Step 3: Implement the minimal template change**

Make `formatShippingPhone()` return only `phone.trim()`. Remove address preparation, address markup, address CSS, and `min-height: 1.58in` from `.label-summary`.

- [ ] **Step 4: Verify green**

Run `npm test -- src/test/shippingLabelPrinter.test.ts`.

- [ ] **Step 5: Verify and commit**

Run `npm test`, `npm run lint`, `npm run build`, and `git diff --check`; then commit as `feat: remove addresses from shipping labels`.

- [ ] **Step 6: Merge locally**

Merge `feat/shipping-label-remove-address` into local `main`, rerun the full test suite, and delete the feature branch. Do not push.
