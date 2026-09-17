# Black Seed Honey Free Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delivery charge becomes ৳0 for any storefront cart containing কালোজিরা ফুলের মধু | Black Seed Flower Honey, while all other products keep current behavior.

**Architecture:** Hardcoded allowlist (product id + slug) in both repos. Merchant-Suite backend stays authoritative (overrides shipping to 0 after variant validation); storefront mirrors the rule for checkout display only. No schema change, no new API.

**Tech Stack:** Node 20 ESM Express backend (`server/`), Vitest, React 18 + Vite TypeScript storefront (`mangoloverbd_storefront/client/src`), Zod (untouched).

## Global Constraints

- Every DB query on user data keeps the resolved `org_id` filter; never accept org/tenant id from the client.
- All new Merchant-Suite API behavior keeps existing auth guards; public storefront routes stay unauthenticated by handle but org-scoped server-side.
- No secrets in code or commits; `.env` stays uncommitted.
- Phone numbers keep going through `normalizeBdPhone()`; no change here.
- Currency symbol is `৳`, never "BDT"/"Tk".
- Storefront icons stay Phosphor `weight="light"` (no icon change in this plan anyway).

---

### Task 1: Backend free-delivery helper + unit tests (Merchant-Suite)

**Files:**
- Modify: `/Users/noorkarimmehedi/conductor/repos/mangoloverbd_commerceos/server/shippingCalculation.js` (append constants + helper, touch nothing else)
- Test: `/Users/noorkarimmehedi/conductor/repos/mangoloverbd_commerceos/src/test/shippingCalculation.test.ts` (append new describe block, touch nothing else)

**Interfaces:**
- Consumes: nothing new (pure function over order-item shapes already built in `server/index.js`).
- Produces: `FREE_DELIVERY_PRODUCT_IDS: string[]`, `FREE_DELIVERY_PRODUCT_SLUGS: string[]`, `cartHasFreeDeliveryProduct(orderItems: Array<{productId?: unknown; productName?: unknown} | null | undefined> | null | undefined) => boolean` — Task 2 imports the helper.

- [ ] **Step 1: Write the failing test**

Append to the end of `src/test/shippingCalculation.test.ts`:

```ts
import { cartHasFreeDeliveryProduct } from "../../server/shippingCalculation.js";

describe("cartHasFreeDeliveryProduct", () => {
  it("returns true when the cart contains only Black Seed Flower Honey", () => {
    expect(cartHasFreeDeliveryProduct([
      { productId: "814979aa-8446-429b-917f-e6d94cf6b334", productName: "কালোজিরা ফুলের মধু | Black Seed Flower Honey" },
    ])).toBe(true);
  });

  it("returns true for a mixed cart containing the honey plus another product", () => {
    expect(cartHasFreeDeliveryProduct([
      { productId: "814979aa-8446-429b-917f-e6d94cf6b334", productName: "কালোজিরা ফুলের মধু | Black Seed Flower Honey" },
      { productId: "other-id", productName: "Some Other Product" },
    ])).toBe(true);
  });

  it("returns false for carts without the honey", () => {
    expect(cartHasFreeDeliveryProduct([
      { productId: "other-id", productName: "Some Other Product" },
    ])).toBe(false);
  });

  it("returns false for empty, null, or undefined input", () => {
    expect(cartHasFreeDeliveryProduct([])).toBe(false);
    expect(cartHasFreeDeliveryProduct(null)).toBe(false);
    expect(cartHasFreeDeliveryProduct(undefined)).toBe(false);
  });
});
```

Note: keep the existing import line and add the new named import (merge into one import statement from `"../../server/shippingCalculation.js"`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/shippingCalculation.test.ts`
Expected: FAIL with `cartHasFreeDeliveryProduct is not a function` (or "does not provide an export named").

- [ ] **Step 3: Write minimal implementation**

Append to the end of `server/shippingCalculation.js` (after `calculateStorefrontShippingCost`, no changes above):

```js
// ─── Per-product free delivery ──────────────────────────────────────────────
// One-product promo: Black Seed Flower Honey always ships free when present
// in the cart, even mixed with other products. Matched on the canonical
// product id (authoritative) with a slug/name fallback for item shapes that
// only carry display names.
export const FREE_DELIVERY_PRODUCT_IDS = ["814979aa-8446-429b-917f-e6d94cf6b334"];
export const FREE_DELIVERY_PRODUCT_SLUGS = ["black-seed-flower-honey"];
const FREE_DELIVERY_PRODUCT_NAME_FRAGMENT = "কালোজিরা ফুলের মধু";

/**
 * @param {Array<{productId?: unknown, productName?: unknown}> | null | undefined} orderItems
 * @returns {boolean} true when any item is the free-delivery product.
 */
export function cartHasFreeDeliveryProduct(orderItems) {
  if (!Array.isArray(orderItems) || orderItems.length === 0) return false;
  return orderItems.some((item) => {
    if (!item || typeof item !== "object") return false;
    if (item.productId != null && FREE_DELIVERY_PRODUCT_IDS.includes(String(item.productId))) return true;
    const name = String(item.productName ?? "");
    if (!name) return false;
    const lowered = name.toLowerCase();
    if (FREE_DELIVERY_PRODUCT_SLUGS.some((slug) => lowered.includes(slug))) return true;
    return name.includes(FREE_DELIVERY_PRODUCT_NAME_FRAGMENT);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/shippingCalculation.test.ts`
Expected: PASS (all existing + 4 new tests).

- [ ] **Step 5: Commit**

```bash
git add server/shippingCalculation.js src/test/shippingCalculation.test.ts
git commit -m "feat: add cartHasFreeDeliveryProduct for black seed honey"
```

---

### Task 2: Enforce free shipping on both Merchant-Suite order paths

**Files:**
- Modify: `/Users/noorkarimmehedi/conductor/repos/mangoloverbd_commerceos/server/index.js`
  - (a) import line 17 area: `import { calculateStorefrontShippingCost } from "./shippingCalculation.js";`
  - (b) `handlePublicHandleOrderSubmit` shipping block (~lines 11456-11472)
  - (c) `approveHeldProtectionReview` shipping block (~lines 11141-11158)

**Interfaces:**
- Consumes: `cartHasFreeDeliveryProduct` from Task 1; existing `orderItems` arrays (`{productId, productName, ...}`) already built in both functions.
- Produces: `delivery_rate: 0` persisted on orders containing the honey; unchanged behavior otherwise. No new exports.

- [ ] **Step 1: Update the import (no test — covered by wiring check in Step 4)**

Replace:

```js
import { calculateStorefrontShippingCost } from "./shippingCalculation.js";
```

with:

```js
import { calculateStorefrontShippingCost, cartHasFreeDeliveryProduct } from "./shippingCalculation.js";
```

- [ ] **Step 2: Override shipping in `handlePublicHandleOrderSubmit`**

Replace:

```js
    const shippingResult = calculateStorefrontShippingCost(subtotal, shippingZoneId, shippingZones);
    if (shippingResult.error) {
      return res.status(400).json({ error: shippingResult.error });
    }
    shipping = shippingResult.cost;
```

with:

```js
    if (cartHasFreeDeliveryProduct(orderItems)) {
      shipping = 0;
    } else {
      const shippingResult = calculateStorefrontShippingCost(subtotal, shippingZoneId, shippingZones);
      if (shippingResult.error) {
        return res.status(400).json({ error: shippingResult.error });
      }
      shipping = shippingResult.cost;
    }
```

This sits after the `orderItems`/`subtotal` loop, so `orderItems` entries carry validated `productId`/`productName` from the DB (variantMap/productMap), not client-supplied names. `productSummary`, `total`, and `delivery_rate` below automatically pick up `shipping = 0`.

- [ ] **Step 3: Override shipping in `approveHeldProtectionReview`**

Replace:

```js
    const shippingResult = calculateStorefrontShippingCost(subtotal, review.shipping_zone_id, shippingZones);
    if (shippingResult.error) {
      const err = new Error("Shipping configuration changed; review remains on hold");
      err.statusCode = 409;
      throw err;
    }
    shipping = shippingResult.cost;
```

with:

```js
    if (cartHasFreeDeliveryProduct(orderItems)) {
      shipping = 0;
    } else {
      const shippingResult = calculateStorefrontShippingCost(subtotal, review.shipping_zone_id, shippingZones);
      if (shippingResult.error) {
        const err = new Error("Shipping configuration changed; review remains on hold");
        err.statusCode = 409;
        throw err;
      }
      shipping = shippingResult.cost;
    }
```

`orderItems` here is built from `variantMap`/`productMap` (DB-validated `productId`/`productName`), same guarantee as Step 2.

- [ ] **Step 4: Verify wiring + run tests**

Run:

```bash
node -e "import('./server/shippingCalculation.js').then(m => { if (typeof m.cartHasFreeDeliveryProduct !== 'function') throw new Error('helper missing'); console.log('helper ok'); })"
npx vitest run src/test/shippingCalculation.test.ts src/test/orderProtectionRouteWiring.test.ts src/test/orderRoutingWiring.test.ts
```

Expected: `helper ok`, then all three suites PASS (no existing shipping/protection behavior changed for non-honey carts).

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat: zero delivery charge when cart contains black seed honey"
```

---

### Task 3: Storefront checkout display (show Free for the honey)

**Files:**
- Create: `/Users/noorkarimmehedi/conductor/repos/mangoloverbd_storefront/client/src/lib/free-delivery.ts`
- Test: `/Users/noorkarimmehedi/conductor/repos/mangoloverbd_storefront/client/src/lib/free-delivery.test.ts`
- Modify: `/Users/noorkarimmehedi/conductor/repos/mangoloverbd_storefront/client/src/components/order-dialog.tsx`
  - (a) `OrderDialogBundle` type (~lines 30-40): add optional `productId?: string; productSlug?: string;`
  - (b) line 82: `const qualifiesForFreeDelivery = (bundle?.price ?? 0) >= freeDeliveryThreshold;`
  - (c) free-delivery info box text (~lines 492-494): `"Applied automatically for orders over ৳2600"`
- Modify: `/Users/noorkarimmehedi/conductor/repos/mangoloverbd_storefront/client/src/pages/product.tsx`
  - `orderBundle` construction (~lines 495-512): pass `productId`/`productSlug`

**Interfaces:**
- Consumes: bundle fields `title`, `productId`, `productSlug` (both optional; title fallback keeps old bundles working).
- Produces: `bundleHasFreeDeliveryProduct(bundle) => boolean` used by `OrderDialog`; `orderBundle` carries product identity into the dialog.

- [ ] **Step 1: Write the failing test**

Create `client/src/lib/free-delivery.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bundleHasFreeDeliveryProduct } from "./free-delivery";

describe("bundleHasFreeDeliveryProduct", () => {
  it("returns true for the Black Seed Flower Honey slug", () => {
    expect(bundleHasFreeDeliveryProduct({ title: "anything", productSlug: "black-seed-flower-honey" })).toBe(true);
  });

  it("returns true when the title is the honey name", () => {
    expect(bundleHasFreeDeliveryProduct({ title: "কালোজিরা ফুলের মধু | Black Seed Flower Honey" })).toBe(true);
  });

  it("returns false for other products", () => {
    expect(bundleHasFreeDeliveryProduct({ title: "কালোজিরা মিক্সড | Kalojira Mixed", productSlug: "kalojira-mixed" })).toBe(false);
  });

  it("returns false for null or empty bundles", () => {
    expect(bundleHasFreeDeliveryProduct(null)).toBe(false);
    expect(bundleHasFreeDeliveryProduct({ title: "" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (in `mangoloverbd_storefront`): `npx vitest run client/src/lib/free-delivery.test.ts`
Expected: FAIL with `Failed to resolve import "./free-delivery"`.

- [ ] **Step 3: Write minimal implementation**

Create `client/src/lib/free-delivery.ts`:

```ts
export const FREE_DELIVERY_PRODUCT_IDS = ["814979aa-8446-429b-917f-e6d94cf6b334"];
export const FREE_DELIVERY_PRODUCT_SLUGS = ["black-seed-flower-honey"];
const FREE_DELIVERY_PRODUCT_NAME_FRAGMENT = "কালোজিরা ফুলের মধু";

export type FreeDeliveryBundle = {
  title?: string | null;
  productId?: string | null;
  productSlug?: string | null;
} | null | undefined;

export function bundleHasFreeDeliveryProduct(bundle: FreeDeliveryBundle): boolean {
  if (!bundle || typeof bundle !== "object") return false;
  if (bundle.productId != null && FREE_DELIVERY_PRODUCT_IDS.includes(String(bundle.productId))) return true;
  const slug = String(bundle.productSlug ?? "").toLowerCase();
  if (slug && FREE_DELIVERY_PRODUCT_SLUGS.some((s) => slug.includes(s))) return true;
  const title = String(bundle.title ?? "");
  if (!title) return false;
  if (FREE_DELIVERY_PRODUCT_SLUGS.some((s) => title.toLowerCase().includes(s))) return true;
  return title.includes(FREE_DELIVERY_PRODUCT_NAME_FRAGMENT);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/lib/free-delivery.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire into `OrderDialog`**

In `client/src/components/order-dialog.tsx`, make exactly these edits:

(a) Add import after the existing `@/lib/...` imports:

```tsx
import { bundleHasFreeDeliveryProduct } from "@/lib/free-delivery";
```

(b) Extend the bundle type:

```tsx
export type OrderDialogBundle = {
  title: string;
  details: string;
  price: number;
  productId?: string;
  productSlug?: string;
  quantity?: number;
  // ... rest unchanged
```

(c) Replace:

```tsx
const qualifiesForFreeDelivery = (bundle?.price ?? 0) >= freeDeliveryThreshold;
```

with:

```tsx
const hasFreeDeliveryProduct = bundleHasFreeDeliveryProduct(bundle);
const qualifiesForFreeDelivery = (bundle?.price ?? 0) >= freeDeliveryThreshold || hasFreeDeliveryProduct;
```

(d) Make the Free-box caption accurate for both causes. Replace:

```tsx
Applied automatically for orders over ৳2600
```

with:

```tsx
{hasFreeDeliveryProduct ? "Free delivery on Black Seed Flower Honey" : "Applied automatically for orders over ৳2600"}
```

No other `order-dialog.tsx` logic changes: the existing `useEffect` that sets `deliveryCharge` to 0 on `qualifiesForFreeDelivery`, the `deliveryCharge === 0 ? "Free - ফ্রি"` total row, and the `deliveryCharge` sent in `placeOrder` all work unchanged.

- [ ] **Step 6: Pass product identity from `product.tsx`**

In `client/src/pages/product.tsx`, extend the `orderBundle` object literal to include identity (insert after `details: selectedBundle.title,`):

```tsx
productSlug: product.slug,
productId: product.id !== undefined ? String(product.id) : undefined,
```

Verify `product` in scope has `slug`/`id` (it does — used at lines 271, 303-305 for `relatedProducts` filter and analytics). If `product.id` is numeric, `String(...)` normalizes it for the helper.

- [ ] **Step 7: Run storefront tests + typecheck**

Run (in `mangoloverbd_storefront`):

```bash
npx vitest run client/src/lib/free-delivery.test.ts client/src/lib/site-pages.test.ts
npx tsc --noEmit
```

Expected: tests PASS (including the existing `POLICY_FACTS.freeDeliveryThreshold` assertion, untouched) and typecheck clean. If `tsc --noEmit` is not the repo's check command, use the storefront repo's own typecheck script instead and note the substitution in the commit message.

- [ ] **Step 8: Commit (storefront repo)**

```bash
git add client/src/lib/free-delivery.ts client/src/lib/free-delivery.test.ts client/src/components/order-dialog.tsx client/src/pages/product.tsx
git commit -m "feat: show free delivery for black seed flower honey"
```

---

### Task 4: End-to-end verification + rollout note

**Files:** none (verification only).

- [ ] **Step 1: Merchant-Suite suite**

Run: `npx vitest run src/test/shippingCalculation.test.ts`
Expected: PASS.

- [ ] **Step 2: Manual order checks (staging or dev backend + storefront)**

1. Honey only (e.g. 1 × ৳700 Black Seed Honey) → checkout shows "Free Delivery - ফ্রি ডেলিভারি ৳0", total ৳700; dashboard order has `delivery_rate: 0`.
2. Mixed (honey + any other product) → still ৳0 delivery.
3. Other product only (e.g. Kalojira Mixed) → still ৳100 delivery (or ৳0 only if ≥ ৳2600).

- [ ] **Step 3: Deploy order**

Merchant-Suite first, then storefront (Vercel redeploy). Until the storefront redeploys, backend already charges ৳0 but old clients still display ৳100 — announce the promo only after both are live.

## Self-Review

- Spec coverage: contains-rule → Tasks 1+2 (backend, both order paths) + Task 3 (display); honey-only identity (id/slug/name) → helper constants; other-products-unchanged → override is additive, existing tests kept; no-schema-change → no migration task. All covered.
- Placeholder scan: no TBD/TODO; every code step has exact code, exact file paths, exact commands, exact expected outputs.
- Type consistency: `cartHasFreeDeliveryProduct` signature identical in Task 1 (def) and Task 2 (use); `bundleHasFreeDeliveryProduct`/`FreeDeliveryBundle` identical in Task 3 steps 3/5; `OrderDialogBundle` extension (`productId?`/`productSlug?`) matches what `product.tsx` passes in Step 6.
