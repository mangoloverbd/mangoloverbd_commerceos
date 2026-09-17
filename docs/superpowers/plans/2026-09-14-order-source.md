# Order Source on Create and Edit Order Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a required, editable Order Source field to Create Order and Order Editor while preserving automatic source detection and manual overrides.

**Architecture:** Reuse the existing nullable `orders.source` column with six canonical values. A small shared frontend source module owns labels and legacy normalization for the UI, while the Express server validates source writes and assigns Website at public storefront insertion boundaries. The Order Editor keeps source editing independent from courier/cart locks and sends a source-only patch when appropriate.

**Tech Stack:** React 18, TypeScript, Vite, shadcn/ui, Phosphor Icons, TanStack Query, Express.js, Supabase service client, Vitest, Testing Library.

## Global Constraints

- Store only `website`, `facebook`, `instagram`, `whatsapp`, `phone`, or `manual_other` for the new source contract.
- Display `manual_other` as `Manual / Other`.
- Use `apiFetch()` for every authenticated frontend API call.
- Preserve the authenticated Mango Lover BD `org_id` guard on every order query and mutation.
- Keep Order Source editable after courier dispatch; do not couple it to cart editability.
- Courier webhooks and sync paths must not overwrite `orders.source`.
- No database schema migration is needed; `public.orders.source` already exists.
- Use Phosphor Icons with `weight="light"` for any new icon.
- Do not add an Order Source dashboard-table column in this feature.

---

## File Map

- Create `src/lib/orderSource.ts` — frontend source type, options, labels, and legacy normalization.
- Create `src/components/order-editor/OrderSourceSelect.tsx` — reusable controlled selector for both order pages.
- Modify `src/pages/NewOrder.tsx` — source state, selector, and create payload.
- Modify `src/pages/OrderDetail.tsx` — source state, dirty tracking, and source-only patch handling.
- Modify `src/components/order-editor/CustomerPanel.tsx` — optionally render the always-editable source control when used by Order Editor.
- Modify `server/index.js` — source constants/validation, create and patch handling, and storefront/abandoned-checkout detection.
- Modify `server/customers.js` — map canonical Website/Phone/Manual values into the existing customer analytics vocabulary.
- Create `src/test/orderSource.test.ts` — pure source normalization and label tests.
- Modify `src/test/orderCreatorModal.test.tsx` — Create Order selector and request regression coverage.
- Modify `src/test/order-detail.test.ts` — Order Editor rendering, source-only save, and dispatched-order edit coverage.
- Modify `src/test/customers.test.ts` — canonical source compatibility coverage.
- Create `src/test/orderSourceRouteWiring.test.ts` — route-level source validation/detection wiring checks.

---

### Task 1: Establish the source contract and frontend selector

**Files:**
- Create: `src/lib/orderSource.ts`
- Create: `src/components/order-editor/OrderSourceSelect.tsx`
- Create: `src/test/orderSource.test.ts`

**Interfaces:**
- Produces `OrderSource`, `ORDER_SOURCE_OPTIONS`, `orderSourceLabel(source)`, and `normalizeOrderSource(source)` for page components.
- Produces `OrderSourceSelect({ value, onChange, disabled? })` with `aria-label="Order source"`.

- [ ] **Step 1: Write failing source contract tests**

Add tests covering the exact public behavior:

```ts
import { describe, expect, it } from "vitest";
import {
  ORDER_SOURCE_OPTIONS,
  normalizeOrderSource,
  orderSourceLabel,
} from "@/lib/orderSource";

describe("order source", () => {
  it("exposes the six selectable values in display order", () => {
    expect(ORDER_SOURCE_OPTIONS).toEqual([
      { value: "website", label: "Website" },
      { value: "facebook", label: "Facebook" },
      { value: "instagram", label: "Instagram" },
      { value: "whatsapp", label: "WhatsApp" },
      { value: "phone", label: "Phone" },
      { value: "manual_other", label: "Manual / Other" },
    ]);
  });

  it("normalizes legacy and missing values", () => {
    expect(normalizeOrderSource("custom_store")).toBe("website");
    expect(normalizeOrderSource("custom_website_tracker")).toBe("website");
    expect(normalizeOrderSource(null)).toBe("manual_other");
    expect(normalizeOrderSource("unknown")).toBe("manual_other");
  });

  it("returns labels for canonical and fallback values", () => {
    expect(orderSourceLabel("website")).toBe("Website");
    expect(orderSourceLabel("manual_other")).toBe("Manual / Other");
    expect(orderSourceLabel("legacy-value")).toBe("Manual / Other");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- src/test/orderSource.test.ts`

Expected: FAIL because `src/lib/orderSource.ts` does not exist yet.

- [ ] **Step 3: Implement the pure source module**

Implement this exact contract:

```ts
export const ORDER_SOURCE_OPTIONS = [
  { value: "website", label: "Website" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Phone" },
  { value: "manual_other", label: "Manual / Other" },
] as const;

export type OrderSource = (typeof ORDER_SOURCE_OPTIONS)[number]["value"];

const SOURCE_LABELS: Record<OrderSource, string> = Object.fromEntries(
  ORDER_SOURCE_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<OrderSource, string>;

export function normalizeOrderSource(value: string | null | undefined): OrderSource {
  const normalized = String(value || "").trim().toLowerCase();
  if (["custom_store", "custom_website", "custom_website_tracker", "storefront", "webhook", "website"].includes(normalized)) return "website";
  if (ORDER_SOURCE_OPTIONS.some((option) => option.value === normalized)) return normalized as OrderSource;
  return "manual_other";
}

export function orderSourceLabel(value: string | null | undefined): string {
  return SOURCE_LABELS[normalizeOrderSource(value)];
}
```

- [ ] **Step 4: Implement the reusable selector**

Use the existing base select component and render `ORDER_SOURCE_OPTIONS`. Keep it controlled and call `onChange(String(key) as OrderSource)`. The trigger must expose `aria-label="Order source"`, accept `disabled`, and use the existing order-editor select sizing/classes.

- [ ] **Step 5: Run the focused test and confirm it passes**

Run: `npm test -- src/test/orderSource.test.ts`

Expected: PASS with all source contract assertions green.

- [ ] **Step 6: Commit the source contract**

```bash
git add src/lib/orderSource.ts src/components/order-editor/OrderSourceSelect.tsx src/test/orderSource.test.ts
git commit -m "feat: add order source contract"
```

---

### Task 2: Add server validation and automatic source assignment

**Files:**
- Modify: `server/index.js: create order route, public storefront insertion, abandoned-checkout conversion, and order patch route`
- Modify: `server/customers.js: detectCustomerOrderSource`
- Create: `src/test/orderSourceRouteWiring.test.ts`
- Modify: `src/test/customers.test.ts`

**Interfaces:**
- The server accepts only canonical source values on `POST /api/orders` and `PATCH /api/orders/:id`.
- Omitted source defaults to `manual_other` for backward compatibility.
- Public storefront and abandoned storefront checkout insertions use `website`.
- `detectCustomerOrderSource()` continues returning the existing analytics values (`custom_website`, `manual`, etc.) when it receives canonical order source values.

- [ ] **Step 1: Write failing route and analytics tests**

Create source inspection tests following the repository’s existing route-wiring style:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { detectCustomerOrderSource } from "../../server/customers.js";

const serverSource = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

describe("order source route wiring", () => {
  it("validates and defaults source on main order writes", () => {
    const createStart = serverSource.indexOf('app.post("/api/orders"');
    const patchStart = serverSource.indexOf('app.patch("/api/orders/:id"');
    const patchEnd = serverSource.indexOf('app.post("/api/orders/:id/send-sms"', patchStart);
    const createRoute = serverSource.slice(createStart, patchStart);
    const patchRoute = serverSource.slice(patchStart, patchEnd);
    for (const route of [createRoute, patchRoute]) {
      expect(route).toContain("manual_other");
      expect(route).toContain("website");
      expect(route).toContain("facebook");
      expect(route).toContain("instagram");
      expect(route).toContain("whatsapp");
      expect(route).toContain("phone");
    }
    expect(createRoute).toContain('"source"');
    expect(patchRoute).toContain('"source"');
  });

  it("sets Website at public storefront insertion boundaries", () => {
    expect(serverSource).toContain('source: "website"');
  });
});

describe("canonical order sources in customer analytics", () => {
  it("maps canonical values without changing customer source vocabulary", () => {
    expect(detectCustomerOrderSource({ source: "website" }, "order")).toBe("custom_website");
    expect(detectCustomerOrderSource({ source: "phone" }, "order")).toBe("manual");
    expect(detectCustomerOrderSource({ source: "manual_other" }, "order")).toBe("manual");
    expect(detectCustomerOrderSource({ source: "facebook" }, "social")).toBe("facebook");
  });
});
```

- [ ] **Step 2: Run the focused route and customer tests to verify failure**

Run: `npm test -- src/test/orderSourceRouteWiring.test.ts src/test/customers.test.ts`

Expected: FAIL because the create/patch routes do not yet validate source, storefront inserts use legacy source values, and customer detection does not recognize `website`.

- [ ] **Step 3: Add server-side source constants and validation**

In `server/index.js`, add a canonical allowlist/helper near the other order helpers:

```js
const ORDER_SOURCE_VALUES = new Set(["website", "facebook", "instagram", "whatsapp", "phone", "manual_other"]);

function isCanonicalOrderSource(value) {
  return typeof value === "string" && ORDER_SOURCE_VALUES.has(value.trim().toLowerCase());
}
```

In `POST /api/orders`, include `source` in the allowed keys, reject a provided unsupported value with status 400, and set `row.source = req.body?.source || "manual_other"` after validation. Preserve the route’s existing auth and `org_id` flow.

In `PATCH /api/orders/:id`, include `source` in the allowed keys and reject unsupported provided values with status 400 before the existing order update. Do not add source to any courier update payload.

- [ ] **Step 4: Set Website for storefront-originated main orders**

Change the public storefront order row initializer from `source: "custom_store"` to `source: "website"`. Add `source: "website"` to the main order insert in `POST /api/abandoned-checkouts/:id/convert`, because these drafts originate from storefront checkout.

- [ ] **Step 5: Preserve customer analytics compatibility**

Update `server/customers.js` so `detectCustomerOrderSource()` maps `website` to `custom_website`, `phone` and `manual_other` to `manual`, and retains the existing social mappings and legacy mappings. Do not change the customer API’s existing source vocabulary or customer filter labels.

- [ ] **Step 6: Run focused tests and confirm they pass**

Run: `npm test -- src/test/orderSourceRouteWiring.test.ts src/test/customers.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit server source handling**

```bash
git add server/index.js server/customers.js src/test/orderSourceRouteWiring.test.ts src/test/customers.test.ts
git commit -m "feat: validate and detect order sources"
```

---

### Task 3: Add source selection to Create Order

**Files:**
- Modify: `src/pages/NewOrder.tsx`
- Modify: `src/test/orderCreatorModal.test.tsx`

**Interfaces:**
- `NewOrder` owns `source` state initialized to `"manual_other"`.
- The create payload includes `source` as a canonical value.
- The selector remains unchanged when AI extraction updates customer/product fields.

- [ ] **Step 1: Write failing Create Order tests**

Extend `src/test/orderCreatorModal.test.tsx` with a test that renders the page, verifies the default, opens the selector, chooses Phone, fills the minimum required fields, adds a manual line if needed, clicks Create order, and asserts the request body:

```tsx
it("defaults the source to Manual / Other and submits a selected source", async () => {
  const user = userEvent.setup();
  apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/products") return { ok: true, json: async () => ({ products: [] }) } as Response;
    if (url === "/api/orders" && init?.method === "POST") return { ok: true, json: async () => ({ order: { id: "order-1" } }) } as Response;
    throw new Error(`Unexpected API request: ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/orders/new"]}><NewOrder /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByRole("combobox", { name: "Order source" })).toHaveTextContent("Manual / Other");
  await user.click(screen.getByRole("combobox", { name: "Order source" }));
  await user.click(await screen.findByRole("option", { name: "Phone" }));
  await user.type(screen.getByRole("textbox", { name: "Customer name" }), "Rahim Uddin");
  await user.type(screen.getByRole("textbox", { name: "Phone" }), "01712345678");
  await user.type(screen.getByRole("textbox", { name: "Delivery address" }), "Dhanmondi, Dhaka");
  await user.click(screen.getByRole("button", { name: /create order/i }));

  await waitFor(() => {
    const call = apiFetch.mock.calls.find(([url, init]) => url === "/api/orders" && init?.method === "POST");
    expect(call).toBeDefined();
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ source: "phone" });
  });
});
```

Use the existing test’s product/line setup if the page’s minimum line validation requires a catalog item; the assertion must still inspect the exact POST body.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- src/test/orderCreatorModal.test.tsx`

Expected: FAIL because the page has no Order Source control or `source` state/payload.

- [ ] **Step 3: Implement Create Order state and payload**

Import `OrderSourceSelect` and `OrderSource` from the new modules. Add:

```ts
const [source, setSource] = useState<OrderSource>("manual_other");
```

Render the selector in the Customer and order section beside the customer fields with label `Order source`. Add `source` to the JSON body sent to `POST /api/orders`. Do not change `extractOrder()` to mutate this state.

- [ ] **Step 4: Run the focused tests and confirm they pass**

Run: `npm test -- src/test/orderCreatorModal.test.tsx`

Expected: PASS, including the existing Create Order tests and the new source request assertion.

- [ ] **Step 5: Commit Create Order support**

```bash
git add src/pages/NewOrder.tsx src/test/orderCreatorModal.test.tsx
git commit -m "feat: add order source to create order"
```

---

### Task 4: Add always-editable source to Order Editor

**Files:**
- Modify: `src/pages/OrderDetail.tsx`
- Modify: `src/components/order-editor/CustomerPanel.tsx`
- Modify: `src/test/order-detail.test.ts`

**Interfaces:**
- `OrderDetail` owns `sourceDraft: OrderSource` and passes it to `CustomerPanel`.
- `CustomerPanel` optionally receives `source`, `onSourceChange`, and `sourceDisabled`, independently of customer/cart editing; abandoned checkout usage does not render the control.
- A source-only save sends `{ source: "..." }` through `PATCH /api/orders/:id`.

- [ ] **Step 1: Write failing Order Editor tests**

Add tests covering display, source-only save, and dispatch independence:

```tsx
it("shows the detected source and saves a source-only edit", async () => {
  apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/orders/order-1" && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      return response({ success: true, order: { ...order, source: body.source } });
    }
    if (url === "/api/orders/order-1") return response({ ...detail, order: { ...order, source: "website" } });
    if (url === "/api/products") return response(products);
    throw new Error(`Unexpected API request: ${url}`);
  });
  renderPage();
  const user = userEvent.setup();
  const source = await screen.findByRole("combobox", { name: "Order source" });
  expect(source).toHaveTextContent("Website");
  await user.click(source);
  await user.click(await screen.findByRole("option", { name: "Phone" }));
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => {
    const patch = apiFetch.mock.calls.find(([url, init]) => url === "/api/orders/order-1" && init?.method === "PATCH");
    expect(patch).toBeDefined();
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ source: "phone" });
  });
});

it("keeps the source selector enabled after courier dispatch", async () => {
  renderPage();
  const source = await screen.findByRole("combobox", { name: "Order source" });
  expect(source).not.toBeDisabled();
});
```

For the dispatched test fixture, set `detail.canEditItems` to false and `order.sent_to_courier` to true while keeping the source assertion unchanged.

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `npm test -- src/test/order-detail.test.ts`

Expected: FAIL because OrderDetail has no source draft/change tracking and CustomerPanel has no source selector.

- [ ] **Step 3: Add source state and dirty tracking to OrderDetail**

Import `OrderSource` and `normalizeOrderSource`. Add `source?: string | null` to the local `Order` type and initialize `sourceDraft` from `normalizeOrderSource(detailQuery.data.order.source)` in the existing order initialization effect.

Compute `sourceChanged = sourceDraft !== normalizeOrderSource(order?.source)` and include it in the no-op save guard. Add `source?: OrderSource` to `orderPatch`; when `sourceChanged`, set `orderPatch.source = sourceDraft`. Keep the existing sequential patch behavior and cache update, and reset `sourceDraft` from the saved order after success.

- [ ] **Step 4: Add the selector to CustomerPanel**

Extend `CustomerPanelProps` with optional source props:

```ts
source?: OrderSource;
onSourceChange?: (source: OrderSource) => void;
sourceDisabled?: boolean;
```

Render `OrderSourceSelect` only when both `source` and `onSourceChange` are provided, outside the customer-only edit toggle, so it remains interactive while customer/cart editing is locked. Pass `sourceDisabled={saving}` from OrderDetail, not `canEditCart`; leave AbandonedDetail unchanged.

- [ ] **Step 5: Wire OrderDetail to CustomerPanel**

Pass `source={sourceDraft}`, `onSourceChange={setSourceDraft}`, and `sourceDisabled={saving}` to `CustomerPanel`. Because the source props are optional, direct AbandonedDetail and CustomerPanel test call sites remain unchanged and do not render an Order Source field.

- [ ] **Step 6: Run the focused tests and confirm they pass**

Run: `npm test -- src/test/order-detail.test.ts`

Expected: PASS, including existing customer/cart/status tests and the new source-only/dispatched tests.

- [ ] **Step 7: Commit Order Editor support**

```bash
git add src/pages/OrderDetail.tsx src/components/order-editor/CustomerPanel.tsx src/test/order-detail.test.ts
git commit -m "feat: make order source editable"
```

---

### Task 5: Full verification and diff audit

**Files:**
- No source changes expected unless a failing regression requires a targeted fix.

- [ ] **Step 1: Run all focused source tests**

Run: `npm test -- src/test/orderSource.test.ts src/test/orderSourceRouteWiring.test.ts src/test/orderCreatorModal.test.tsx src/test/order-detail.test.ts src/test/customers.test.ts`

Expected: PASS.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test`

Expected: all test files and tests pass with zero failures.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: exit code 0; existing warnings may remain, but no new errors.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 5: Audit the final diff**

Run:

```bash
git diff --check HEAD~4..HEAD
git status --short
git diff --stat origin/main...HEAD
```

Confirm only the source contract, selector, create/edit pages, server/customer compatibility, tests, and the approved plan/spec are included. Confirm the pre-existing `.gitignore` modification remains unstaged and untouched.
