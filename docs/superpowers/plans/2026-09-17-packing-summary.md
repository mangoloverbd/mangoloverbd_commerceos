# Packing Summary Print Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Packing Summary` browser-print action to the Dashboard Print tab that summarizes all Print orders per product/pack with order counts, total kg, and tick boxes, plus a multi-item exception list.

**Architecture:** Pure frontend change following the existing `invoiceGenerator.ts` hidden-iframe print pattern. A new pure builder `src/utils/packingSummaryPrinter.ts` groups already-fetched Print orders (the server already enriches `items[].weight_kg` variant-first, product-fallback in `enrichOrderItems`, `server/index.js:6197`). Dashboard renders the button only in Print view and prints the full filtered list, not just the visible page. No backend route, no migration, no storefront change.

**Tech Stack:** React 18 + TypeScript (strict), Vitest, existing hidden-iframe print flow, `apiFetch`-loaded order data (no new fetch).

## Global Constraints

- Every new route that reads or writes user data MUST use the current Mango Lover BD workspace and preserve the `org_id` guard — no new routes in this plan.
- Always use `apiFetch()` from `src/lib/api.ts` for API calls — no new API calls in this plan.
- Use React Router v6 for routes — no new routes.
- Use Phosphor Icons (`weight="light"`) for icons.
- Never commit `.env` or secrets.
- Currency uses `৳`; weights display in kg with `—` for unknown (never silent 0).
- TypeScript strict — no `any` without a documented comment.

---

## File Structure

- Create `src/utils/packingSummaryPrinter.ts` — pure summary builder, print-HTML builder, iframe print wrapper. One responsibility: packing-sheet printing.
- Create `src/test/packingSummaryPrinter.test.ts` — unit + wiring tests for the above.
- Modify `src/components/OrdersTable.tsx:201-205` — extend `OrderItemSummary` with `weight_kg?: number | null` (type-only; runtime already carries it from the server).
- Modify `src/pages/Dashboard.tsx:140-163` — add optional `items` to the local `Order` interface (type-only, same shape).
- Modify `src/pages/Dashboard.tsx:1399-1486` — add `Packing Summary` button in `dashboard-order-actions`, rendered only in Print view.

---

### Task 1: Summary builder (grouping + kg math)

**Files:**
- Create: `src/utils/packingSummaryPrinter.ts`
- Test: `src/test/packingSummaryPrinter.test.ts`

**Interfaces:**
- Consumes: order objects shaped `{ id, order_number, product, quantity, items?: Array<{ product_name, variant_name, quantity, weight_kg? }> }` (structural; both Dashboard and OrdersTable order shapes satisfy this).
- Produces: `buildPackingSummary(orders)` returning `{ rows, exceptions, totalOrders, totalKg, hasUnknownWeight }` consumed by Task 2.

**Types (exact):**

```ts
export interface PackingSummaryItem {
  product_name: string | null;
  variant_name: string | null;
  quantity: number;
  weight_kg?: number | null;
}

export interface PackingSummaryOrder {
  id: string;
  order_number: string;
  product: string | null;
  quantity: number | null;
  items?: PackingSummaryItem[] | null;
}

export interface PackingSummaryRow {
  product: string;
  pack: string;
  orderCount: number;
  totalKg: number | null;
  hasUnknownWeight: boolean;
}

export interface PackingExceptionOrder {
  orderNumber: string;
  lines: string[];
}

export interface PackingSummary {
  rows: PackingSummaryRow[];
  exceptions: PackingExceptionOrder[];
  totalOrders: number;
  totalKg: number;
  hasUnknownWeight: boolean;
}
```

**Grouping rules (exact):**
- Expand each order to lines: `items` when non-empty, else parse legacy `product` text by splitting on `,` and parsing leading `Nx` quantities (same `parseInlineQuantity` regex as `invoiceGenerator.ts`: `/^(\d+)\s*(?:x|×)\s+(.+)$/i`).
- Line key: `product_name.trim() || "Item"` + `|||` + `(variant_name.trim() || "—")`. Display `pack` is the variant part.
- Per row: `orderCount` = distinct order ids containing the key; `totalKg` = sum over lines of `quantity * weight_kg` where `weight_kg` is a finite number, else mark `hasUnknownWeight` and exclude that line's kg. A row with no known weights has `totalKg: null` (renders `—`).
- `exceptions` = orders expanding to 2+ distinct line keys, sorted by `order_number`; each line renders as `Product` or `Product — Pack` (omit `—` pack suffix).
- Rows sorted by `product` then `pack` with `localeCompare("en")`; `totalOrders` = input length; `totalKg` = sum of row kg treating null as 0.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildPackingSummary } from "@/utils/packingSummaryPrinter";

describe("buildPackingSummary", () => {
  it("groups by product and pack with order counts and kg totals", () => {
    const summary = buildPackingSummary([
      {
        id: "o1", order_number: "#1", product: null, quantity: null,
        items: [{ product_name: "কাটিমন আম | Katimon Mango", variant_name: "6KG", quantity: 1, weight_kg: 6 }],
      },
      {
        id: "o2", order_number: "#2", product: null, quantity: null,
        items: [
          { product_name: "কাটিমন আম | Katimon Mango", variant_name: "6KG", quantity: 2, weight_kg: 6 },
          { product_name: "হিমসাগর | Himsagar", variant_name: "5KG", quantity: 1, weight_kg: 5 },
        ],
      },
    ]);

    expect(summary.totalOrders).toBe(2);
    const sixKg = summary.rows.find((row) => row.pack === "6KG");
    expect(sixKg).toMatchObject({ orderCount: 2, totalKg: 18 });
    expect(summary.exceptions.map((entry) => entry.orderNumber)).toEqual(["#2"]);
  });

  it("renders unknown weight as null and falls back to legacy product text", () => {
    const summary = buildPackingSummary([
      {
        id: "o3", order_number: "#3", product: "2x Dried Mango", quantity: 2,
        items: [],
      },
    ]);

    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0]).toMatchObject({ product: "Dried Mango", pack: "—", orderCount: 1, totalKg: null });
    expect(summary.hasUnknownWeight).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/packingSummaryPrinter.test.ts`
Expected: FAIL with "Failed to resolve import @/utils/packingSummaryPrinter"

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/packingSummaryPrinter.ts` with the five exported interfaces above plus:

```ts
const parseInlineQuantity = (value: string) => {
  const match = value.match(/^(\d+)\s*(?:x|×)\s+(.+)$/i);
  return match
    ? { quantity: Number.parseInt(match[1], 10), productName: match[2].trim() }
    : null;
};

interface ExpandedLine {
  product: string;
  pack: string;
  quantity: number;
  weightKg: number | null;
}

function expandOrderLines(order: PackingSummaryOrder): ExpandedLine[] {
  if (order.items?.length) {
    return order.items.map((item) => ({
      product: (item.product_name || "").trim() || "Item",
      pack: (item.variant_name || "").trim() || "—",
      quantity: item.quantity || 1,
      weightKg: typeof item.weight_kg === "number" && Number.isFinite(item.weight_kg) ? item.weight_kg : null,
    }));
  }
  const lines = (order.product || "Item").split(",").map((line) => line.trim()).filter(Boolean);
  return (lines.length ? lines : ["Item"]).map((line) => {
    const parsed = parseInlineQuantity(line);
    return {
      product: parsed?.productName || line,
      pack: "—",
      quantity: parsed?.quantity || (lines.length === 1 ? order.quantity || 1 : 1),
      weightKg: null,
    };
  });
}

export function buildPackingSummary(orders: PackingSummaryOrder[]): PackingSummary {
  const rowMap = new Map<string, { product: string; pack: string; orderIds: Set<string>; totalKg: number; hasUnknownWeight: boolean }>();
  const exceptions: PackingExceptionOrder[] = [];
  let hasUnknownWeight = false;

  for (const order of orders) {
    const lines = expandOrderLines(order);
    const distinctKeys = new Set(lines.map((line) => `${line.product}|||${line.pack}`));
    if (distinctKeys.size > 1) {
      exceptions.push({
        orderNumber: order.order_number,
        lines: [...distinctKeys].map((key) => {
          const [product, pack] = key.split("|||");
          return pack === "—" ? product : `${product} — ${pack}`;
        }),
      });
    }
    const seenInOrder = new Set<string>();
    for (const line of lines) {
      const key = `${line.product}|||${line.pack}`;
      let row = rowMap.get(key);
      if (!row) {
        row = { product: line.product, pack: line.pack, orderIds: new Set(), totalKg: 0, hasUnknownWeight: false };
        rowMap.set(key, row);
      }
      if (!seenInOrder.has(key)) {
        seenInOrder.add(key);
        row.orderIds.add(order.id);
      }
      if (line.weightKg == null) {
        row.hasUnknownWeight = true;
        hasUnknownWeight = true;
      } else {
        row.totalKg += line.quantity * line.weightKg;
      }
    }
  }

  const rows: PackingSummaryRow[] = [...rowMap.values()].map((row) => ({
    product: row.product,
    pack: row.pack,
    orderCount: row.orderIds.size,
    totalKg: row.hasUnknownWeight && row.totalKg === 0 ? null : row.totalKg,
    hasUnknownWeight: row.hasUnknownWeight,
  }));
  rows.sort((a, b) => a.product.localeCompare(b.product, "en") || a.pack.localeCompare(b.pack, "en"));
  exceptions.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber, "en"));

  return {
    rows,
    exceptions,
    totalOrders: orders.length,
    totalKg: rows.reduce((sum, row) => sum + (row.totalKg || 0), 0),
    hasUnknownWeight,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/packingSummaryPrinter.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/packingSummaryPrinter.ts src/test/packingSummaryPrinter.test.ts
git commit -m "feat: add packing summary grouping builder"
```

---

### Task 2: Print HTML + iframe print wrapper

**Files:**
- Modify: `src/utils/packingSummaryPrinter.ts`
- Test: `src/test/packingSummaryPrinter.test.ts`

**Interfaces:**
- Consumes: `buildPackingSummary` result from Task 1.
- Produces: `buildPackingSummaryHtml(summary, businessName?, printedAt?)` and `printPackingSummary(orders, businessName?)` consumed by Task 4.

**HTML rules (exact):** single-column A4 portrait document (`@page { size: A4 portrait; margin: 0; }`, `.packing-page { width: 210mm; }`), black header block with `PACKING SUMMARY`, business name, date string, and `N orders · M kg to pack`; summary table columns `Product | Pack | Orders | Total kg | Packed` with a CSS tick box (`<span class="tick" aria-hidden="true"></span>`, 5mm bordered square); footer totals row; note `kg already includes multi-item orders below — do not pack twice.` only when exceptions exist; exceptions section titled `Multi-item orders — pick separately` with one line per order (`orderNumber: line1 + line2`) each carrying a tick box; `hasUnknownWeight` adds the note `— = weight not saved in catalog.`; all dynamic text through the same `escapeHtml` as the invoice builder.

- [ ] **Step 1: Write the failing test**

```ts
it("builds a printable packing sheet with tick boxes and exception ticks", () => {
  const summary = buildPackingSummary([
    {
      id: "o1", order_number: "#1041", product: null, quantity: null,
      items: [
        { product_name: "Katimon Mango", variant_name: "6KG", quantity: 1, weight_kg: 6 },
        { product_name: "Himsagar", variant_name: "5KG", quantity: 1, weight_kg: 5 },
      ],
    },
  ]);
  const html = buildPackingSummaryHtml(summary, "Mango Lover BD", "Sep 17, 2026");

  expect(html).toContain("@page { size: A4 portrait; margin: 0; }");
  expect(html).toContain("PACKING SUMMARY");
  expect(html).toContain("1 orders");
  expect(html).toContain("Katimon Mango");
  expect(html).toContain("6KG");
  expect(html).toContain("Multi-item orders");
  expect(html).toContain("#1041");
  expect(html.match(/class="tick"/g)?.length).toBeGreaterThanOrEqual(2);
  expect(html).toContain("do not pack twice");
});
```

Append to the `buildPackingSummary` describe block; import `buildPackingSummaryHtml` at the top.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/packingSummaryPrinter.test.ts`
Expected: FAIL with "buildPackingSummaryHtml is not exported"

- [ ] **Step 3: Write minimal implementation**

Append to `src/utils/packingSummaryPrinter.ts`:

```ts
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatKg = (value: number | null) =>
  value == null ? "—" : `${Number(value.toFixed(2))}kg`;

export function buildPackingSummaryHtml(
  summary: PackingSummary,
  businessName = "Mango Lover BD",
  printedAt = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
): string {
  const rows = summary.rows
    .map(
      (row) => `
        <tr>
          <td class="product">${escapeHtml(row.product)}</td>
          <td class="pack">${escapeHtml(row.pack)}</td>
          <td class="number">${row.orderCount}</td>
          <td class="number">${formatKg(row.totalKg)}</td>
          <td class="tick-cell"><span class="tick" aria-hidden="true"></span></td>
        </tr>`,
    )
    .join("");

  const exceptions = summary.exceptions
    .map(
      (entry) => `
        <li>
          <span><strong>${escapeHtml(entry.orderNumber)}</strong>: ${entry.lines.map(escapeHtml).join(" + ")}</span>
          <span class="tick" aria-hidden="true"></span>
        </li>`,
    )
    .join("");

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Packing Summary</title>
        <style>
          @page { size: A4 portrait; margin: 0; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; color: #000; background: #fff; }
          body { font-family: Arial, "Noto Sans Bengali", sans-serif; }
          .packing-page { width: 210mm; padding: 14mm; }
          .packing-header { margin: -14mm -14mm 0; padding: 10mm 14mm 8mm; background: #000; color: #fff; }
          .packing-title { font-size: 26px; font-weight: 900; letter-spacing: 0.1em; }
          .packing-meta { margin-top: 2mm; font-size: 12px; }
          table { width: 100%; margin-top: 8mm; border-collapse: collapse; font-size: 13px; }
          th, td { border: 1px solid #000; padding: 3.5mm 3mm; vertical-align: middle; overflow-wrap: anywhere; }
          th { background: #000; color: #fff; text-transform: uppercase; font-size: 9px; letter-spacing: 0.12em; }
          td.product { font-weight: 700; font-size: 14px; }
          td.number, th.number { text-align: center; white-space: nowrap; }
          .tick-cell { text-align: center; }
          .tick { display: inline-block; width: 5mm; height: 5mm; border: 1.5px solid #000; }
          li { display: flex; justify-content: space-between; align-items: center; gap: 6mm; padding: 3mm 0; border-bottom: 1px solid #999; font-size: 13px; }
          .packing-note { margin-top: 5mm; font-size: 11px; color: #444; }
          .packing-totals { margin-top: 5mm; font-size: 15px; font-weight: 800; }
          @media print { html, body { width: 210mm; } }
        </style>
      </head>
      <body>
        <div class="packing-page">
          <header class="packing-header">
            <div class="packing-title">PACKING SUMMARY</div>
            <div class="packing-meta">${escapeHtml(businessName)} · ${escapeHtml(printedAt)} · ${summary.totalOrders} orders · ${formatKg(summary.totalKg)} to pack</div>
          </header>
          <table>
            <thead><tr><th>Product</th><th>Pack</th><th class="number">Orders</th><th class="number">Total kg</th><th class="number">Packed</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="packing-totals">Total: ${summary.totalOrders} orders · ${formatKg(summary.totalKg)}</div>
          ${summary.exceptions.length ? `<h2>Multi-item orders — pick separately</h2><ul>${exceptions}</ul><p class="packing-note">kg already includes multi-item orders below — do not pack twice.</p>` : ""}
          ${summary.hasUnknownWeight ? `<p class="packing-note">— = weight not saved in catalog.</p>` : ""}
        </div>
      </body>
    </html>`;
}

export function printPackingSummary(orders: PackingSummaryOrder[], businessName?: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.setAttribute("title", "Packing summary print frame");
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  const iframeWindow = iframe.contentWindow;
  const removeIframe = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  if (!iframeDoc || !iframeWindow || typeof iframeWindow.print !== "function") {
    removeIframe();
    throw new Error("Unable to prepare packing summary for printing");
  }

  try {
    iframeDoc.open();
    iframeDoc.write(buildPackingSummaryHtml(buildPackingSummary(orders), businessName));
    iframeDoc.close();
  } catch {
    removeIframe();
    throw new Error("Unable to prepare packing summary for printing");
  }

  window.setTimeout(() => {
    iframeWindow.focus();
    iframeWindow.print();
    window.setTimeout(removeIframe, 5000);
  }, 150);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/packingSummaryPrinter.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/packingSummaryPrinter.ts src/test/packingSummaryPrinter.test.ts
git commit -m "feat: add packing summary print html and print wrapper"
```

---

### Task 3: Carry server-enriched weights through frontend types

**Files:**
- Modify: `src/pages/Dashboard.tsx:140-163`
- Do NOT modify: `src/components/OrdersTable.tsx` — `src/test/shippingLabelPrinter.test.ts:236` pins `OrderItemSummary` as weight-free; the packing button consumes Dashboard `filteredOrders`, not table rows, so the table type stays untouched.
- Test: type-check via `npm run build` (no new test file; runtime already carries `weight_kg` from `enrichOrderItems`, `server/index.js:6249-6254`)

**Interfaces:**
- Consumes: server `GET /api/orders` items (already include `weight_kg`, `product_slug`, `image_url`).
- Produces: `OrderItemSummary.weight_kg` and Dashboard `Order.items` types consumed by Task 4's button handler.

- [ ] **Step 1: Write the failing check**

Run: `npx tsc --noEmit`
Expected: FAIL — `weight_kg` does not exist on `OrderItemSummary` when `packingSummaryPrinter` input is fed from table orders (add the usage first in Task 4) OR document the current gap: Dashboard `Order` has no `items` field so `filteredOrders` cannot be passed to `printPackingSummary` without a type error. For TDD discipline, write the Task 4 wiring test first and watch it fail on types; this task is the type fix. If running tasks in order, instead assert the gap directly:

Run: `grep -n "weight_kg" src/components/OrdersTable.tsx | head -5`
Expected: only the order-level `weight_kg` (line ~188), no item-level weight — confirming the gap.

- [ ] **Step 2: Make the type edits**

In `src/components/OrdersTable.tsx`, the shared `OrderItemSummary` stays unchanged (pinned weight-free by the shipping-label wiring test):

```ts
interface OrderItemSummary {
  product_name: string | null;
  variant_name: string | null;
  quantity: number;
}
```

In `src/pages/Dashboard.tsx`, extend the local `Order` interface with the items field the server already returns:

```ts
interface Order {
  // ... existing fields ...
  weight_kg?: number | null;
  items?: Array<{
    product_name: string | null;
    variant_name: string | null;
    quantity: number;
    weight_kg?: number | null;
  }>;
}
```

- [ ] **Step 3: Verify types pass**

Run: `npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 4: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: carry item weight through order types"
```

---

### Task 4: Dashboard Print-tab button wiring

**Files:**
- Modify: `src/pages/Dashboard.tsx:1399-1486` (`dashboard-order-actions` toolbar) + imports + handler
- Test: `src/test/packingSummaryPrinter.test.ts` (append wiring describe block)

**Interfaces:**
- Consumes: `filteredOrders` (`src/pages/Dashboard.tsx:987`), `activeOrderStatusFilter`, `useOrgName()` (`src/hooks/useOrgName.ts`), `printPackingSummary` from Task 2.
- Produces: visible `Packing Summary` button (`data-testid="button-packing-summary"`) that prints the full Print queue.

**Wiring spec (exact):**
- Import `useOrgName` in Dashboard and read `const { orgName } = useOrgName();` near the existing `useUserRole` call.
- Handler (place near other toolbar handlers):

```tsx
const handlePackingSummary = async () => {
  if (filteredOrders.length === 0) return;
  try {
    const { printPackingSummary } = await import("@/utils/packingSummaryPrinter");
    printPackingSummary(filteredOrders, orgName);
  } catch (error) {
    console.error("Packing summary printing failed:", error);
    toast.error("Failed to prepare packing summary for printing");
  }
};
```

- Button inside the `dashboard-order-actions` div, rendered only when `activeOrderStatusFilter === "print"` and not in the abandoned queue, disabled when `filteredOrders.length === 0`, using the existing `PopButton` component with Phosphor `Printer` icon (`weight="light"`):

```tsx
{!isAbandonedQueue && activeOrderStatusFilter === "print" && (
  <PopButton
    color="sky"
    size="sm"
    onClick={() => void handlePackingSummary()}
    disabled={filteredOrders.length === 0}
    className="gap-1.5 px-3 text-[11px] font-bold tracking-normal max-md:w-full max-md:justify-center"
    data-testid="button-packing-summary"
  >
    <Printer weight="light" className="h-3.5 w-3.5" />
    Packing Summary
  </PopButton>
)}
```

 Heroicons vs Phosphor: Dashboard already imports Phosphor icons (`CaretDown` from `@phosphor-icons/react` per line 1460 usage `weight="bold"`); add `Printer` to that same import.

- [ ] **Step 1: Write the failing wiring test**

Append to `src/test/packingSummaryPrinter.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("packing summary action wiring", () => {
  it("renders a Print-only packing summary button that prints the full queue", () => {
    const dashboardSource = readFileSync(resolve(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");

    expect(dashboardSource).toContain('data-testid="button-packing-summary"');
    expect(dashboardSource).toContain('activeOrderStatusFilter === "print"');
    expect(dashboardSource).toContain(
      'const { printPackingSummary } = await import("@/utils/packingSummaryPrinter");',
    );
    expect(dashboardSource).toContain("printPackingSummary(filteredOrders, orgName)");
    expect(dashboardSource).toContain("Failed to prepare packing summary for printing");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/packingSummaryPrinter.test.ts`
Expected: FAIL — `button-packing-summary` not found in Dashboard source.

- [ ] **Step 3: Implement the button + handler + types from Task 3 if not yet applied**

Apply the handler, button JSX, `useOrgName` import/call, and `Printer` icon import exactly as specified above.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/test/packingSummaryPrinter.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx src/test/packingSummaryPrinter.test.ts
git commit -m "feat: add packing summary print action to print tab"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites PASS

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 3: Run production build (type-check + bundle)**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 4: Manual QA in the browser**

1. Open Dashboard → Print tab with several orders (including one multi-item order and one legacy-text order).
2. Click `Packing Summary` → print preview shows header totals, one row per product/pack, tick boxes, and the multi-item exception list with ticks.
3. Save as PDF → Bengali product names render correctly.
4. Empty Print tab → button disabled.
5. Non-Print tabs and Abandoned queue → button absent.

- [ ] **Step 5: Commit any fixes separately; do not batch unrelated changes**
