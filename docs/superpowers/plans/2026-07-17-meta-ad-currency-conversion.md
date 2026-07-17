# Meta Ad Currency Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the USD-to-BDT rate only to USD Meta ad accounts and pass through BDT account spend unchanged.

**Architecture:** Add a small pure currency conversion helper under `server/` so the decision is independently testable. Update the analytics route to load the selected ad account's currency and use that helper for total and daily spend. Unsupported or missing currencies will produce no ad-spend value rather than silently applying the USD rate.

**Tech Stack:** Express ESM, JavaScript, Vitest.

---

### Task 1: Add currency conversion regression tests

**Files:**
- Create: `server/metaAdCurrency.js`
- Create: `src/test/metaAdCurrency.test.ts`

- [ ] **Step 1: Write the failing tests**

Test `convertMetaSpendToBdt` for USD conversion, BDT pass-through, and unsupported currencies returning `null`.

```ts
import { describe, expect, it } from "vitest";
import { convertMetaSpendToBdt } from "../../server/metaAdCurrency.js";

describe("convertMetaSpendToBdt", () => {
  it("converts USD spend using the configured rate", () => {
    expect(convertMetaSpendToBdt(12.5, "USD", 110)).toBe(1375);
  });

  it("passes through BDT spend without applying the USD rate", () => {
    expect(convertMetaSpendToBdt(1250, "BDT", 110)).toBe(1250);
  });

  it("does not silently convert unsupported currencies", () => {
    expect(convertMetaSpendToBdt(100, "EUR", 110)).toBeNull();
    expect(convertMetaSpendToBdt(100, null, 110)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- src/test/metaAdCurrency.test.ts`

Expected: FAIL because `server/metaAdCurrency.js` and `convertMetaSpendToBdt` do not exist yet.

### Task 2: Implement and wire currency-aware spend calculation

**Files:**
- Modify: `server/metaAdCurrency.js`
- Modify: `server/index.js:2582-2661`

- [ ] **Step 1: Implement the minimal pure helper**

```js
export function convertMetaSpendToBdt(amount, currency, usdToBdt) {
  const normalizedCurrency = String(currency || "").trim().toUpperCase();
  if (normalizedCurrency === "BDT") return Number(amount.toFixed(2));
  if (normalizedCurrency === "USD") return Number((amount * usdToBdt).toFixed(2));
  return null;
}
```

- [ ] **Step 2: Load the selected account currency**

Change the OAuth fallback query from `select("ad_account_id")` to `select("ad_account_id, currency")`, keep the value in `fbAccountCurrency`, and initialize it from the stored account row used by the legacy/manual account path when available.

- [ ] **Step 3: Use the helper for total and daily spend**

Import `convertMetaSpendToBdt` in `server/index.js`. Convert the total and each daily USD value through the account currency. If conversion returns `null`, set `fbError` to an unsupported-currency message and leave `adSpend` as `null` so profit is not calculated from an invalid currency.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- src/test/metaAdCurrency.test.ts`

Expected: PASS.

### Task 3: Verify the application

**Files:**
- Review: `server/index.js`
- Review: `server/metaAdCurrency.js`
- Review: `src/test/metaAdCurrency.test.ts`

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: PASS with no new failures.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: Vite completes successfully.
