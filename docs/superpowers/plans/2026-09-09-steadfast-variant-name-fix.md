# Steadfast Variant Name Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent dashboard Steadfast dispatch from failing when an order item has a variant name, while preserving readable item descriptions for single and bulk dispatch.

**Architecture:** Add a null-safe `readableVariantName(value)` helper next to the existing courier formatting helpers in `server/index.js`. It will normalize plain strings, JSON-encoded attribute objects, and object values before `formatCourierItems()` builds the string sent to Steadfast. The existing single-order and bulk-order routes will continue to use the shared formatter and existing API payloads.

**Tech Stack:** Node.js ESM, Express, Supabase service client, Vitest source-wiring tests.

## Global Constraints

- Preserve the Mango Lover BD workspace guard on all database queries.
- Keep frontend API calls behind `apiFetch()`; no frontend changes are needed.
- Keep `normalizeBdPhone()` before courier calls.
- Do not change the Steadfast API endpoint, authentication headers, or payload contract.
- Do not touch unrelated working-tree changes in `server/ai-actions.js`, `server/storefrontSeoRefresh.js`, or their tests.

---

### Task 1: Add regression coverage for safe Steadfast variant formatting

**Files:**
- Modify: `src/test/orderRoutingWiring.test.ts:238-247`

**Interfaces:**
- Consumes: `server/index.js` source text and the existing `sectionBetween()` test helper.
- Produces: A regression test that fails while `readableVariantName` is undefined and verifies both Steadfast routes use `formatCourierItems()`.

- [ ] **Step 1: Write the failing test**

Add a test that extracts `variantDisplay()` and `readableVariantName()` through `function formatCourierItems`, evaluates only those helpers, and verifies representative values:

```ts
  it("formats plain and JSON variant names without throwing", () => {
    const helperStart = source.indexOf("function variantDisplay");
    const helperEnd = source.indexOf("function formatCourierItems", helperStart);
    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperEnd).toBeGreaterThan(helperStart);

    const helperSource = source.slice(helperStart, helperEnd);
    const readableVariantName = new Function(
      `${helperSource}; return readableVariantName;`,
    )() as (value: unknown) => string | null;

    expect(readableVariantName("5 kg")).toBe("5 kg");
    expect(readableVariantName('{"size":"5 kg","color":"Green"}')).toBe("5 kg · Green");
    expect(readableVariantName({ size: "5 kg", color: "Green" })).toBe("5 kg · Green");
    expect(readableVariantName("   ")).toBeNull();
    expect(readableVariantName('{"size":"5 kg"')).toBe('{"size":"5 kg"');
  });

  it("uses the shared formatted item description in both Steadfast routes", () => {
    const bulkRoute = sectionBetween(
      'app.post("/api/send-to-courier/bulk"',
      'app.post("/api/send-to-courier"',
    );
    const singleRoute = sectionBetween(
      'app.post("/api/send-to-courier"',
      'app.post("/api/send-to-pathao"',
    );

    expect(bulkRoute).toContain("formatCourierItems(courierItems)");
    expect(singleRoute).toContain("formatCourierItems(courierItems)");
  });
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
npx vitest run src/test/orderRoutingWiring.test.ts
```

Expected: the new formatter test fails because `function readableVariantName` does not exist in `server/index.js`; the existing tests remain otherwise unchanged.

- [ ] **Step 3: Commit the failing regression test**

```bash
git add src/test/orderRoutingWiring.test.ts
git commit -m "test: cover steadfast variant formatting"
```

### Task 2: Implement the shared null-safe variant formatter

**Files:**
- Modify: `server/index.js:5535-5562`

**Interfaces:**
- Consumes: `variantDisplay(attributes)` and `item.variant_name` values returned by `getCourierOrderItems()`.
- Produces: `readableVariantName(value): string | null`, used by `formatCourierItems(items)` for both single and bulk dispatch.

- [ ] **Step 1: Add the minimal helper**

Insert this function after `variantDisplay()` and before `formatCourierItems()`:

```js
function readableVariantName(value) {
  if (value && typeof value === "object") return variantDisplay(value);
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") return variantDisplay(parsed);
    if (typeof parsed === "string") return parsed.trim() || null;
    if (parsed === null) return null;
    return String(parsed);
  } catch {
    return trimmed;
  }
}
```

Leave this existing call unchanged so all courier item descriptions receive the fix:

```js
const variantName = readableVariantName(item.variant_name);
```

- [ ] **Step 2: Run the focused tests to verify they pass**

Run:

```bash
npx vitest run src/test/orderRoutingWiring.test.ts
```

Expected: PASS, including plain text, JSON attribute, object, blank, and malformed JSON cases.

- [ ] **Step 3: Run the complete verification suite**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all Vitest tests pass, ESLint exits successfully, and the Vite production build completes successfully.

- [ ] **Step 4: Review the final diff and commit the implementation**

Run:

```bash
git diff --check
git diff -- server/index.js src/test/orderRoutingWiring.test.ts
```

Confirm only the helper and regression coverage are included, then commit:

```bash
git add server/index.js src/test/orderRoutingWiring.test.ts
git commit -m "fix: format variant names for steadfast dispatch"
```
