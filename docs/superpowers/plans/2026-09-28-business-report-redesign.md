# Business Report Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/reports/business` into the approved chart layout (mockup: `progress/business-report-redesign/mockup.html`, artifact https://claude.ai/artifact/TYoMtX6VBSir3w58JzwYkv v6), backed by two small additions to the report API.

**Architecture:** The pure report builder (`server/businessReport.js`) gains richer series buckets, an hour-of-day profile, and a previous-period summary; the Express route widens its query window by one period. The page is split into focused components under `src/components/business-report/`. All numbers the UI derives (rates, flags, groupings) live in a pure, unit-tested module; all ECharts option objects are built by pure, unit-tested functions; one thin `EChart` wrapper is the only code that touches ECharts at runtime (and is mocked in page tests).

**Tech Stack:** Express (ESM) + Vitest for the builder; React 18 + TypeScript + Tailwind + Framer Motion + TanStack Query for the page; Apache ECharts 6 (modular import, SVG renderer).

## Global Constraints

- Hard rules in `CLAUDE.md` apply. The route stays admin-only and keeps every `.eq("org_id", orgId)` filter; never accept an org id from the client.
- Frontend calls go through `apiFetch()` only (already the case — do not change the fetch).
- Icons: Phosphor (`@phosphor-icons/react`) with `weight="light"`.
- Background `bg-[#FAFAF8]`; labels `text-[8px] font-medium tracking-[0.3em] text-black uppercase`; values `font-light`; panels `rounded-2xl bg-black/[0.04]`, no shadows.
- Currency always `৳`, formatted with the page's existing `en-BD` grouping helpers (e.g. `৳12,48,300`).
- Chart colour tokens (exact values): ink `#0B0B0A`, greys `#0B0B0A #4A4A47 #8A8A85 #C4C4BE #E0E0DA`, approved `#2F7A55`, pending `#B7862F`, cancelled `#B4473A`, returned `#7A5C86`, track `rgba(11,11,10,0.08)`, rule `rgba(11,11,10,0.09)`.
- Chart font: `"Geist Sans", system-ui, -apple-system, sans-serif` (family declared in `src/index.css:24`).
- ECharts is imported only via `src/lib/echarts.ts` (modular `echarts/core`), never `import * as echarts from "echarts"`, and only from the lazily loaded report page.
- TypeScript strict; no `any`.
- Respect reduced motion (`useReducedMotion()`): charts get `animation: false` when it is set.
- Copy: "RTO" is the term for returned orders in this UI (matches the existing page).

## Rulings

- Ruling: `echarts@^6.1.0` (current stable), not 5.x used by the mockup — every option key used here exists in 6 — cost if wrong: swap the version, no code change.
- Ruling: Peak Week splits bars into Website vs "Social & manual" (= everything else), so the API adds only `website_value` per bucket — cost if wrong: add more per-source fields to buckets later.
- Ruling: the "Intake rhythm" grid always shows the new 24-bucket `hourly_profile` (hour of day across the range); the Best day panel is hidden when `series.granularity === "hour"` (single-day range) because it would duplicate the grid — cost if wrong: re-enable it as "Best hour".
- Ruling: the donut shows the top 4 sources by value and folds the rest into "Other" (the API can return up to 8 sources) — cost if wrong: change `maxSlices`.
- Ruling: the page does not add dark-mode styling (the existing page has none) — cost if wrong: follow-up task.
- Ruling: previous-period deltas only appear for bounded ranges; "All time" shows no deltas (`previous: null`).

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `server/businessReport.js` | Modify | Richer series buckets, `hourly_profile`, `resolvePreviousBusinessReportRequest`, `previous` summary |
| `server/index.js` (route at ~4702) | Modify | Resolve previous period, widen query window, pass `previousRequest` |
| `src/test/businessReport.test.ts` | Modify | Builder tests |
| `src/test/businessReportRouteWiring.test.ts` | Modify | Route wiring expectations |
| `package.json` | Modify | Add `echarts` |
| `src/lib/echarts.ts` | Create | Registers the ECharts modules used |
| `src/components/business-report/types.ts` | Create | Response types (moved out of the page) |
| `src/components/business-report/chartTheme.ts` | Create | Colour/font tokens |
| `src/lib/businessReportMetrics.ts` | Create | Pure derivations: rates, flags, sorting, groupings, deltas |
| `src/test/businessReportMetrics.test.ts` | Create | Tests for the above |
| `src/lib/businessReportCharts.ts` | Create | Pure ECharts option builders |
| `src/test/businessReportCharts.test.ts` | Create | Tests for the above |
| `src/components/business-report/EChart.tsx` | Create | Thin runtime wrapper around ECharts |
| `src/components/business-report/SummaryTiles.tsx` | Create | 5 summary tiles with sparkline + delta |
| `src/components/business-report/ReportCharts.tsx` | Create | Intake rhythm, sankey, donut, gauge, best day, product weight panels |
| `src/components/business-report/SourcePerformanceTable.tsx` | Create | Sortable source table, expandable rows, products-by-outcome table |
| `src/pages/BusinessReport.tsx` | Modify | Compose the new components; keep header, date picker, loading/error/empty states, delivery economics, missing-weight banner |
| `src/test/businessReportPage.test.tsx` | Modify | Page behaviour tests (EChart mocked) |

---

### Task 1: Richer series buckets and hour-of-day profile (backend)

**Files:**
- Modify: `server/businessReport.js:263-321` (`createSeriesBucket`, `addToSeriesBucket`, `buildSeries`), `:404-469` (`buildBusinessReport`)
- Test: `src/test/businessReport.test.ts`

**Interfaces:**
- Produces: every bucket in `series.buckets` and `hourly_profile` has shape
  `{ key: string, label: string, intake_count: number, order_value: number, website_value: number, order_kg: number, approved_count: number, cancelled_count: number }`.
  `hourly_profile` is always 24 buckets, keys `hour-0`…`hour-23`, labels from `hourLabel` (`12a`, `1a`, … `11p`).

- [ ] **Step 1: Write the failing tests** — append inside the existing `describe` that holds the series tests (after the test "fills every bounded Dhaka day in a multi-day intake series"):

```ts
  it("adds website value, weight and outcome counts to each series bucket", () => {
    const request = resolveBusinessReportRequest({ from: "2026-09-18", to: "2026-09-19" });
    const report = buildBusinessReport([
      order({ id: "web-approved", created_at: "2026-09-18T03:00:00.000Z", source: "website", status: "confirmed", price: 1000, weight_kg: 5 }),
      order({ id: "fb-cancelled", created_at: "2026-09-18T04:00:00.000Z", source: "facebook", status: "cancelled", price: 600, weight_kg: 2.5 }),
      order({ id: "fb-pending", created_at: "2026-09-19T05:00:00.000Z", source: "facebook", price: 400 }),
    ], request);

    expect(report.series.buckets).toEqual([
      { key: "2026-09-18", label: expect.any(String), intake_count: 2, order_value: 1600, website_value: 1000, order_kg: 7.5, approved_count: 1, cancelled_count: 1 },
      { key: "2026-09-19", label: expect.any(String), intake_count: 1, order_value: 400, website_value: 0, order_kg: 0, approved_count: 0, cancelled_count: 0 },
    ]);
  });

  it("returns a 24-hour intake profile summed across every day in the range", () => {
    const request = resolveBusinessReportRequest({ from: "2026-09-18", to: "2026-09-20" });
    const report = buildBusinessReport([
      order({ id: "d1-9am", created_at: "2026-09-18T03:00:00.000Z", price: 100 }), // 09:00 Dhaka
      order({ id: "d3-9am", created_at: "2026-09-20T03:30:00.000Z", price: 200 }), // 09:30 Dhaka
      order({ id: "d2-9pm", created_at: "2026-09-19T15:00:00.000Z", price: 300 }), // 21:00 Dhaka
    ], request);

    expect(report.hourly_profile).toHaveLength(24);
    expect(report.hourly_profile[9]).toMatchObject({ key: "hour-9", label: "9a", intake_count: 2, order_value: 300 });
    expect(report.hourly_profile[21]).toMatchObject({ key: "hour-21", label: "9p", intake_count: 1, order_value: 300 });
    expect(report.hourly_profile[0]).toMatchObject({ key: "hour-0", label: "12a", intake_count: 0 });
  });
```

Check the `APPROVED_STATES` set at `server/businessReport.js:25` and use one of its members if `"confirmed"` is not in it.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/test/businessReport.test.ts`
Expected: the two new tests FAIL (`website_value` missing; `hourly_profile` undefined).

- [ ] **Step 3: Implement**

Replace `createSeriesBucket` and `addToSeriesBucket`:

```js
function createSeriesBucket(key, label) {
  return {
    key,
    label,
    intake_count: 0,
    order_value: 0,
    website_value: 0,
    order_kg: 0,
    approved_count: 0,
    cancelled_count: 0,
  };
}

function addToSeriesBucket(bucket, row) {
  bucket.intake_count += 1;
  bucket.order_value += row.value;
  bucket.order_kg += row.kg;
  if (row.source === "website") bucket.website_value += row.value;
  if (row.outcome === "approved") bucket.approved_count += 1;
  else if (row.outcome === "cancelled") bucket.cancelled_count += 1;
}
```

In `buildSeries`, change both calls `addToSeriesBucket(dayBucket, row.value)` and `addToSeriesBucket(hourBucket, row.value)` to pass `row`.

Add below `buildSeries`:

```js
function buildHourlyProfile(seriesRows) {
  const buckets = Array.from({ length: 24 }, (_, hour) => createSeriesBucket(`hour-${hour}`, hourLabel(hour)));
  for (const row of seriesRows) addToSeriesBucket(buckets[row.hour], row);
  return buckets;
}
```

In `buildBusinessReport`, change the `seriesRows.push(...)` line to:

```js
    seriesRows.push({
      day: dhakaParts.day,
      hour: dhakaParts.hour,
      value,
      kg: toNumber(order.weight_kg),
      source,
      outcome,
    });
```

and add to the returned object, directly after `series`:

```js
    hourly_profile: buildHourlyProfile(seriesRows),
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/test/businessReport.test.ts`
Expected: all tests PASS. If an existing test compares whole bucket objects with `toEqual`, extend its expected objects with the four new fields (values from that test's fixture) rather than loosening the assertion.

- [ ] **Step 5: Commit**

```bash
git add server/businessReport.js src/test/businessReport.test.ts
git commit -m "feat: add website value, weight, outcomes and hourly profile to business report series"
```

---

### Task 2: Previous-period summary (backend + route)

**Files:**
- Modify: `server/businessReport.js` (new export + `buildBusinessReport` options/loop/return)
- Modify: `server/index.js` route `app.get("/api/reports/business", …)` (~line 4702) and the import at line 115
- Test: `src/test/businessReport.test.ts`, `src/test/businessReportRouteWiring.test.ts`

**Interfaces:**
- Produces: `export function resolvePreviousBusinessReportRequest(request)` → `null` for unbounded requests, else `{ range: { from, to }, since, until }` covering the same number of days immediately before `request.range.from`.
- Produces: `buildBusinessReport(orders, request, { products, variants, previousRequest })` returns an extra key `previous: { range: { from, to }, summary: Metrics } | null`.

- [ ] **Step 1: Write the failing tests** — in `src/test/businessReport.test.ts`, add `resolvePreviousBusinessReportRequest` to the import list, then add:

```ts
describe("business report previous period", () => {
  it("resolves the same-length window immediately before a bounded range", () => {
    const request = resolveBusinessReportRequest({ from: "2026-09-18", to: "2026-09-20" });
    expect(resolvePreviousBusinessReportRequest(request)).toEqual({
      range: { from: "2026-09-15", to: "2026-09-17" },
      since: "2026-09-14T18:00:00.000Z",
      until: "2026-09-17T18:00:00.000Z",
    });
  });

  it("has no previous period for All Time", () => {
    expect(resolvePreviousBusinessReportRequest(resolveBusinessReportRequest({}))).toBeNull();
  });

  it("summarises previous-period orders separately and keeps them out of current totals", () => {
    const request = resolveBusinessReportRequest({ from: "2026-09-18", to: "2026-09-18" });
    const previousRequest = resolvePreviousBusinessReportRequest(request);
    const report = buildBusinessReport([
      order({ id: "current", created_at: "2026-09-18T03:00:00.000Z", price: 1000 }),
      order({ id: "previous", created_at: "2026-09-17T03:00:00.000Z", status: "cancelled", price: 700 }),
      order({ id: "too-old", created_at: "2026-09-16T03:00:00.000Z", price: 900 }),
    ], request, { previousRequest });

    expect(report.summary).toMatchObject({ intake_count: 1, order_value: 1000 });
    expect(report.previous).toMatchObject({
      range: { from: "2026-09-17", to: "2026-09-17" },
      summary: { intake_count: 1, order_value: 700, cancelled_count: 1 },
    });
  });

  it("returns previous: null when no previous request is given", () => {
    const report = buildBusinessReport([order({ price: 100 })], dayRequest());
    expect(report.previous).toBeNull();
  });
});
```

In `src/test/businessReportRouteWiring.test.ts`, in the test "delegates input validation and output aggregation to the pure module", replace the last expectation with:

```ts
    expect(section).toContain("resolvePreviousBusinessReportRequest(request)");
    expect(section).toContain("buildBusinessReport(orders, request, { products, variants, previousRequest })");
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/test/businessReport.test.ts src/test/businessReportRouteWiring.test.ts`
Expected: FAIL (`resolvePreviousBusinessReportRequest` is not exported; route strings missing).

- [ ] **Step 3: Implement the builder**

Add after `resolveBusinessReportRequest` in `server/businessReport.js`:

```js
export function resolvePreviousBusinessReportRequest(request) {
  if (!request?.range?.from || !request?.range?.to) return null;
  const days = inclusiveDayCount(request.range.from, request.range.to);
  const interval = toDhakaInterval(
    dayAtOffset(request.range.from, -days),
    dayAtOffset(request.range.from, -1),
  );
  return {
    range: { from: interval.from, to: interval.to },
    since: interval.since,
    until: interval.until,
  };
}
```

Change the `buildBusinessReport` signature and loop head:

```js
export function buildBusinessReport(orders, request, { products = [], variants = [], previousRequest = null } = {}) {
  const summary = createMetrics();
  const previousSummary = createMetrics();
  // …existing declarations unchanged…

  for (const order of orders || []) {
    const dhakaParts = toDhakaParts(order?.created_at);
    if (!dhakaParts) continue;
    if (previousRequest && isWithinRequest(dhakaParts.timestamp, previousRequest)) {
      addOrderMetrics(previousSummary, order, classifyBusinessReportOutcome(order), toNumber(order.price));
      continue;
    }
    if (!isWithinRequest(dhakaParts.timestamp, request)) continue;
    // …rest of the loop body unchanged…
```

Add to the returned object, after `summary`:

```js
    previous: previousRequest
      ? { range: previousRequest.range, summary: finalizeMetrics(previousSummary) }
      : null,
```

- [ ] **Step 4: Implement the route**

In `server/index.js` line 115, import the new function:

```js
import { buildBusinessReport, resolveBusinessReportRequest, resolvePreviousBusinessReportRequest } from "./businessReport.js";
```

In the route, after `const request = resolveBusinessReportRequest({...});` add:

```js
    const previousRequest = resolvePreviousBusinessReportRequest(request);
    const windowStart = previousRequest?.since ?? request.since;
```

Change the orders query's lower bound from `if (request.since) query = query.gte("created_at", request.since);` to:

```js
        if (windowStart) query = query.gte("created_at", windowStart);
```

(leave `.eq("org_id", orgId)` and the `request.until` upper bound unchanged), and change the response line to:

```js
    return res.json(buildBusinessReport(orders, request, { products, variants, previousRequest }));
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/test/businessReport.test.ts src/test/businessReportRouteWiring.test.ts`
Expected: PASS. (The wiring test's `toContain("request.since")` still passes via `previousRequest?.since ?? request.since`.)

- [ ] **Step 6: Commit**

```bash
git add server/businessReport.js server/index.js src/test/businessReport.test.ts src/test/businessReportRouteWiring.test.ts
git commit -m "feat: return previous-period summary from the business report API"
```

---

### Task 3: Shared types and pure derivations (frontend)

**Files:**
- Create: `src/components/business-report/types.ts`
- Create: `src/lib/businessReportMetrics.ts`
- Test: `src/test/businessReportMetrics.test.ts`
- Modify: `src/pages/BusinessReport.tsx:14-90` (delete the local types; import from `types.ts`)

**Interfaces:**
- Produces (`types.ts`): `Metrics`, `SeriesBucket`, `LandingPage`, `ProductWeight`, `BusinessReportSource`, `BusinessReportResponse` (below).
- Produces (`businessReportMetrics.ts`): `rate`, `percentChange`, `pointChange`, `buildSourceRows`, `sortSourceRows`, `groupSourceMix`, `buildProductOutcomeRows`, `maxIndex`, and types `SourceRow`, `SourceSortKey`, `SortDir`, `MixSlice`, `ProductOutcomeRow`, `ProductOutcomeTable` — exact signatures below.

- [ ] **Step 1: Create `types.ts`**

```ts
export type Metrics = {
  intake_count: number;
  order_value: number;
  approved_count: number;
  approved_value: number;
  cancelled_count: number;
  cancelled_value: number;
  returned_count: number;
  returned_value: number;
  pending_count: number;
  pending_value: number;
  delivery_charged: number;
  courier_fees_recorded: number;
  net_delivery_position: number;
  courier_fee_order_count: number;
  order_kg: number;
  approved_kg: number;
  cancelled_kg: number;
  returned_kg: number;
  pending_kg: number;
  weight_order_count: number;
};

export type SeriesBucket = {
  key: string;
  label: string;
  intake_count: number;
  order_value: number;
  website_value: number;
  order_kg: number;
  approved_count: number;
  cancelled_count: number;
};

export type LandingPage = {
  path: string | null;
  label: string;
  intake_count: number;
  order_value: number;
  approved_count: number;
  cancelled_count: number;
  returned_count: number;
  pending_count: number;
  order_kg: number;
};

export type ProductWeight = {
  product_id: string | null;
  product_name: string;
  packs: number;
  kg: number;
  approved_packs: number;
  approved_kg: number;
  cancelled_packs: number;
  cancelled_kg: number;
  returned_packs: number;
  returned_kg: number;
  pending_packs: number;
  pending_kg: number;
  order_count: number;
};

export type BusinessReportSource = Metrics & {
  source: string;
  label: string;
  products: ProductWeight[];
  landing_pages: LandingPage[];
};

export type BusinessReportResponse = {
  range: { from: string | null; to: string | null };
  summary: Metrics;
  previous: { range: { from: string; to: string }; summary: Metrics } | null;
  series: { granularity: "hour" | "day"; label: string; buckets: SeriesBucket[] };
  hourly_profile: SeriesBucket[];
  sources: BusinessReportSource[];
  products: ProductWeight[];
  missing_weight_products: Array<{ id: string; name: string }>;
};
```

In `src/pages/BusinessReport.tsx`, delete the local type declarations (lines ~14-90) and add
`import type { BusinessReportResponse, BusinessReportSource, LandingPage, ProductWeight } from "@/components/business-report/types";`
(keep only the names the page still uses after Task 7; unused imports fail lint).

- [ ] **Step 2: Write the failing tests** — `src/test/businessReportMetrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { BusinessReportSource, Metrics, ProductWeight } from "@/components/business-report/types";
import {
  buildProductOutcomeRows,
  buildSourceRows,
  groupSourceMix,
  maxIndex,
  percentChange,
  pointChange,
  rate,
  sortSourceRows,
} from "@/lib/businessReportMetrics";

function metrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    intake_count: 0, order_value: 0, approved_count: 0, approved_value: 0, cancelled_count: 0, cancelled_value: 0,
    returned_count: 0, returned_value: 0, pending_count: 0, pending_value: 0, delivery_charged: 0,
    courier_fees_recorded: 0, net_delivery_position: 0, courier_fee_order_count: 0, order_kg: 0, approved_kg: 0,
    cancelled_kg: 0, returned_kg: 0, pending_kg: 0, weight_order_count: 0, ...overrides,
  };
}

function source(key: string, label: string, overrides: Partial<Metrics>): BusinessReportSource {
  return { source: key, label, products: [], landing_pages: [], ...metrics(overrides) };
}

function product(name: string, overrides: Partial<ProductWeight>): ProductWeight {
  return {
    product_id: name, product_name: name, packs: 0, kg: 0, approved_packs: 0, approved_kg: 0, cancelled_packs: 0,
    cancelled_kg: 0, returned_packs: 0, returned_kg: 0, pending_packs: 0, pending_kg: 0, order_count: 0, ...overrides,
  };
}

const website = source("website", "Website", {
  intake_count: 100, order_value: 100000, approved_count: 85, cancelled_value: 5000, returned_value: 3000,
  approved_value: 88000, pending_value: 4000, order_kg: 250, net_delivery_position: 1500,
});
const facebook = source("facebook", "Facebook", {
  intake_count: 100, order_value: 80000, approved_count: 65, cancelled_value: 12000, returned_value: 6000,
  approved_value: 58000, pending_value: 4000, order_kg: 200, net_delivery_position: -500,
});
const summary = metrics({
  intake_count: 200, order_value: 180000, approved_count: 150, cancelled_value: 17000, returned_value: 9000,
});

describe("rate helpers", () => {
  it("returns 0 for a zero denominator", () => {
    expect(rate(5, 0)).toBe(0);
    expect(rate(1, 4)).toBe(25);
  });

  it("returns null percent change without a positive baseline", () => {
    expect(percentChange(110, 100)).toBeCloseTo(10);
    expect(percentChange(5, 0)).toBeNull();
  });

  it("returns the difference in percentage points", () => {
    expect(pointChange(80, 75)).toBe(5);
  });
});

describe("buildSourceRows", () => {
  it("derives rates and flags sources more than 3 points worse than the average", () => {
    const [web, fb] = buildSourceRows([website, facebook], summary);

    expect(web).toMatchObject({ key: "website", label: "Website", orders: 100, value: 100000, approvalRate: 85, lossRate: 8, aov: 1000, kg: 250, netPerOrder: 15 });
    expect(web.share).toBeCloseTo(55.56, 1);
    expect(web.flags).toEqual({ approval: false, loss: false });
    expect(fb).toMatchObject({ approvalRate: 65, lossRate: 22.5, netPerOrder: -5 });
    expect(fb.flags).toEqual({ approval: true, loss: true });
    expect(fb.mix).toEqual({ approved: 58000, pending: 4000, cancelled: 12000, returned: 6000 });
  });
});

describe("sortSourceRows", () => {
  it("sorts by a numeric key in either direction and by label alphabetically", () => {
    const rows = buildSourceRows([website, facebook], summary);
    expect(sortSourceRows(rows, "lossRate", -1).map((row) => row.key)).toEqual(["facebook", "website"]);
    expect(sortSourceRows(rows, "lossRate", 1).map((row) => row.key)).toEqual(["website", "facebook"]);
    expect(sortSourceRows(rows, "label", 1).map((row) => row.key)).toEqual(["facebook", "website"]);
  });
});

describe("groupSourceMix", () => {
  it("keeps the top slices by value and folds the rest into Other", () => {
    const sources = [
      source("a", "A", { order_value: 50 }), source("b", "B", { order_value: 40 }), source("c", "C", { order_value: 30 }),
      source("d", "D", { order_value: 20 }), source("e", "E", { order_value: 7 }), source("f", "F", { order_value: 3 }),
    ];
    expect(groupSourceMix(sources, 4)).toEqual([
      { label: "A", value: 50 }, { label: "B", value: 40 }, { label: "C", value: 30 }, { label: "D", value: 20 }, { label: "Other", value: 10 },
    ]);
    expect(groupSourceMix(sources.slice(0, 2), 4)).toHaveLength(2);
  });
});

describe("buildProductOutcomeRows", () => {
  it("builds per-product outcome kg with loss rate, a total row and loss flags", () => {
    const table = buildProductOutcomeRows([
      product("Himsagar", { kg: 100, packs: 20, approved_kg: 90, pending_kg: 4, cancelled_kg: 4, returned_kg: 2 }),
      product("Fazli", { kg: 50, packs: 10, approved_kg: 35, pending_kg: 3, cancelled_kg: 8, returned_kg: 4 }),
    ]);

    expect(table.rows.map((row) => [row.name, row.lossRate, row.flagged])).toEqual([
      ["Himsagar", 6, false],
      ["Fazli", 24, true],
    ]);
    expect(table.total).toMatchObject({ name: "All products", kg: 150, packs: 30, approvedKg: 125, cancelledKg: 12, returnedKg: 6, lossRate: 12, flagged: false });
  });

  it("does not flag products with no recorded weight", () => {
    const table = buildProductOutcomeRows([product("Langra", { packs: 3, approved_packs: 3 })]);
    expect(table.rows[0]).toMatchObject({ kg: 0, lossRate: 0, flagged: false, packs: 3 });
  });
});

describe("maxIndex", () => {
  it("returns the index of the largest value, or -1 when all are zero", () => {
    expect(maxIndex([3, 9, 2])).toBe(1);
    expect(maxIndex([0, 0])).toBe(-1);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/test/businessReportMetrics.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/lib/businessReportMetrics.ts`**

```ts
import type { BusinessReportSource, Metrics, ProductWeight } from "@/components/business-report/types";

export const SOURCE_FLAG_POINTS = 3;
export const PRODUCT_FLAG_POINTS = 5;

export function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

export function percentChange(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

export function pointChange(currentRate: number, previousRate: number): number {
  return currentRate - previousRate;
}

export type SourceRow = {
  key: string;
  label: string;
  orders: number;
  value: number;
  share: number;
  mix: { approved: number; pending: number; cancelled: number; returned: number };
  approvalRate: number;
  lossRate: number;
  aov: number;
  kg: number;
  netPerOrder: number;
  flags: { approval: boolean; loss: boolean };
  source: BusinessReportSource;
};

export type SourceSortKey = "label" | "orders" | "value" | "approvalRate" | "lossRate" | "aov" | "kg" | "netPerOrder";
export type SortDir = 1 | -1;

export function buildSourceRows(sources: BusinessReportSource[], summary: Metrics): SourceRow[] {
  const averageApproval = rate(summary.approved_count, summary.intake_count);
  const averageLoss = rate(summary.cancelled_value + summary.returned_value, summary.order_value);
  return sources.map((source) => {
    const approvalRate = rate(source.approved_count, source.intake_count);
    const lossRate = rate(source.cancelled_value + source.returned_value, source.order_value);
    return {
      key: source.source,
      label: source.label,
      orders: source.intake_count,
      value: source.order_value,
      share: rate(source.order_value, summary.order_value),
      mix: {
        approved: source.approved_value,
        pending: source.pending_value,
        cancelled: source.cancelled_value,
        returned: source.returned_value,
      },
      approvalRate,
      lossRate,
      aov: source.intake_count > 0 ? source.order_value / source.intake_count : 0,
      kg: source.order_kg,
      netPerOrder: source.intake_count > 0 ? source.net_delivery_position / source.intake_count : 0,
      flags: {
        approval: approvalRate < averageApproval - SOURCE_FLAG_POINTS,
        loss: lossRate > averageLoss + SOURCE_FLAG_POINTS,
      },
      source,
    };
  });
}

export function sortSourceRows(rows: SourceRow[], key: SourceSortKey, dir: SortDir): SourceRow[] {
  return [...rows].sort((a, b) => {
    const order = key === "label" ? a.label.localeCompare(b.label) : a[key] - b[key];
    return order * dir;
  });
}

export type MixSlice = { label: string; value: number };

export function groupSourceMix(sources: BusinessReportSource[], maxSlices = 4): MixSlice[] {
  const sorted = [...sources]
    .filter((source) => source.order_value > 0)
    .sort((a, b) => b.order_value - a.order_value);
  const top = sorted.slice(0, maxSlices).map((source) => ({ label: source.label, value: source.order_value }));
  const rest = sorted.slice(maxSlices).reduce((sum, source) => sum + source.order_value, 0);
  return rest > 0 ? [...top, { label: "Other", value: rest }] : top;
}

export type ProductOutcomeRow = {
  name: string;
  kg: number;
  packs: number;
  approvedKg: number;
  pendingKg: number;
  cancelledKg: number;
  returnedKg: number;
  lossRate: number;
  flagged: boolean;
};

export type ProductOutcomeTable = { rows: ProductOutcomeRow[]; total: ProductOutcomeRow };

function toOutcomeRow(name: string, product: Pick<ProductWeight, "kg" | "packs" | "approved_kg" | "pending_kg" | "cancelled_kg" | "returned_kg">): ProductOutcomeRow {
  return {
    name,
    kg: product.kg,
    packs: product.packs,
    approvedKg: product.approved_kg,
    pendingKg: product.pending_kg,
    cancelledKg: product.cancelled_kg,
    returnedKg: product.returned_kg,
    lossRate: rate(product.cancelled_kg + product.returned_kg, product.kg),
    flagged: false,
  };
}

export function buildProductOutcomeRows(products: ProductWeight[]): ProductOutcomeTable {
  const totals = products.reduce(
    (sum, product) => ({
      kg: sum.kg + product.kg,
      packs: sum.packs + product.packs,
      approved_kg: sum.approved_kg + product.approved_kg,
      pending_kg: sum.pending_kg + product.pending_kg,
      cancelled_kg: sum.cancelled_kg + product.cancelled_kg,
      returned_kg: sum.returned_kg + product.returned_kg,
    }),
    { kg: 0, packs: 0, approved_kg: 0, pending_kg: 0, cancelled_kg: 0, returned_kg: 0 },
  );
  const total = toOutcomeRow("All products", totals);
  const rows = products.map((product) => {
    const row = toOutcomeRow(product.product_name, product);
    return { ...row, flagged: row.kg > 0 && row.lossRate > total.lossRate + PRODUCT_FLAG_POINTS };
  });
  return { rows, total };
}

export function maxIndex(values: number[]): number {
  let best = -1;
  let bestValue = 0;
  values.forEach((value, index) => {
    if (value > bestValue) {
      best = index;
      bestValue = value;
    }
  });
  return best;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/test/businessReportMetrics.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/business-report/types.ts src/lib/businessReportMetrics.ts src/test/businessReportMetrics.test.ts src/pages/BusinessReport.tsx
git commit -m "feat: add business report types and pure derived metrics"
```

---

### Task 4: ECharts setup, theme, option builders and wrapper

**Files:**
- Modify: `package.json` / `package-lock.json` (via npm)
- Create: `src/lib/echarts.ts`, `src/components/business-report/chartTheme.ts`, `src/lib/businessReportCharts.ts`, `src/components/business-report/EChart.tsx`
- Test: `src/test/businessReportCharts.test.ts`

**Interfaces:**
- Consumes: `SeriesBucket`, `ProductWeight`, `BusinessReportSource` (Task 3); `MixSlice` (Task 3).
- Produces (`businessReportCharts.ts`), each returning `EChartsCoreOption`:
  - `sparklineOption(values: number[]): EChartsCoreOption`
  - `intakeGridOption(profile: SeriesBucket[]): { option: EChartsCoreOption; ordersPerCell: number; peakIndex: number }`
  - `outcomeSankeyOption(sources: BusinessReportSource[]): EChartsCoreOption`
  - `sourceMixOption(slices: MixSlice[]): EChartsCoreOption`
  - `approvalGaugeOption(approvalRate: number): EChartsCoreOption`
  - `bestDayOption(buckets: SeriesBucket[], bestIndex: number): EChartsCoreOption`
  - `productRingsOption(products: ProductWeight[]): EChartsCoreOption`
  - `approvalBand(approvalRate: number): { label: string; color: string }`
  - `GRID_ROWS = 14`
- Produces (`EChart.tsx`): `EChart({ option, ariaLabel, className, animate }: { option: EChartsCoreOption; ariaLabel: string; className?: string; animate?: boolean })` — renders `<div role="img" aria-label={ariaLabel}>`.
- Produces (`chartTheme.ts`): `CHART` token object, `OUTCOME_COLORS`, `OUTCOME_LABELS`, `OUTCOME_KEYS`.

- [ ] **Step 1: Install**

Run: `npm install echarts@^6.1.0`
Expected: `echarts` appears under `dependencies` in `package.json`.

- [ ] **Step 2: Create `src/lib/echarts.ts`**

```ts
import * as echarts from "echarts/core";
import { BarChart, GaugeChart, LineChart, PictorialBarChart, PieChart, SankeyChart } from "echarts/charts";
import { GraphicComponent, GridComponent, MarkPointComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  GaugeChart,
  LineChart,
  PictorialBarChart,
  PieChart,
  SankeyChart,
  GraphicComponent,
  GridComponent,
  MarkPointComponent,
  TooltipComponent,
  SVGRenderer,
]);

export { echarts };
export type { EChartsCoreOption } from "echarts/core";
```

- [ ] **Step 3: Create `src/components/business-report/chartTheme.ts`**

```ts
export const CHART = {
  ink: "#0B0B0A",
  ink2: "rgba(11,11,10,0.62)",
  ink3: "rgba(11,11,10,0.42)",
  track: "rgba(11,11,10,0.08)",
  rule: "rgba(11,11,10,0.09)",
  bg: "#FAFAF8",
  greys: ["#0B0B0A", "#4A4A47", "#8A8A85", "#C4C4BE", "#E0E0DA"],
  font: '"Geist Sans", system-ui, -apple-system, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

export const OUTCOME_KEYS = ["approved", "pending", "cancelled", "returned"] as const;
export type OutcomeKey = (typeof OUTCOME_KEYS)[number];

export const OUTCOME_COLORS: Record<OutcomeKey, string> = {
  approved: "#2F7A55",
  pending: "#B7862F",
  cancelled: "#B4473A",
  returned: "#7A5C86",
};

export const OUTCOME_LABELS: Record<OutcomeKey, string> = {
  approved: "Approved",
  pending: "Pending",
  cancelled: "Cancelled",
  returned: "RTO",
};
```

- [ ] **Step 4: Write the failing tests** — `src/test/businessReportCharts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { BusinessReportSource, Metrics, SeriesBucket } from "@/components/business-report/types";
import {
  GRID_ROWS,
  approvalBand,
  bestDayOption,
  intakeGridOption,
  outcomeSankeyOption,
  sourceMixOption,
} from "@/lib/businessReportCharts";

type SeriesLike = { type: string; data: unknown[]; links?: Array<{ source: string; target: string; value: number }> };
const seriesOf = (option: unknown) => (option as { series: SeriesLike[] }).series;

function bucket(index: number, intake: number, value = intake * 100, website = 0): SeriesBucket {
  return { key: `k${index}`, label: `L${index}`, intake_count: intake, order_value: value, website_value: website, order_kg: 0, approved_count: 0, cancelled_count: 0 };
}

function source(key: string, label: string, overrides: Partial<Metrics>): BusinessReportSource {
  const zero: Metrics = {
    intake_count: 0, order_value: 0, approved_count: 0, approved_value: 0, cancelled_count: 0, cancelled_value: 0,
    returned_count: 0, returned_value: 0, pending_count: 0, pending_value: 0, delivery_charged: 0,
    courier_fees_recorded: 0, net_delivery_position: 0, courier_fee_order_count: 0, order_kg: 0, approved_kg: 0,
    cancelled_kg: 0, returned_kg: 0, pending_kg: 0, weight_order_count: 0,
  };
  return { source: key, label, products: [], landing_pages: [], ...zero, ...overrides };
}

describe("intakeGridOption", () => {
  it("scales cells so the peak hour fits the grid and reports the peak", () => {
    const profile = Array.from({ length: 24 }, (_, hour) => bucket(hour, hour === 21 ? 130 : 10));
    const { ordersPerCell, peakIndex, option } = intakeGridOption(profile);

    expect(peakIndex).toBe(21);
    expect(ordersPerCell).toBe(10); // ceil(130 / 14)
    expect(ordersPerCell * GRID_ROWS).toBeGreaterThanOrEqual(130);
    expect(seriesOf(option)).toHaveLength(2);
  });

  it("uses one order per cell when there is no intake", () => {
    const { ordersPerCell, peakIndex } = intakeGridOption(Array.from({ length: 24 }, (_, hour) => bucket(hour, 0)));
    expect(ordersPerCell).toBe(1);
    expect(peakIndex).toBe(-1);
  });
});

describe("outcomeSankeyOption", () => {
  it("links each source to each non-zero outcome by value and omits zero links", () => {
    const option = outcomeSankeyOption([
      source("website", "Website", { order_value: 1000, approved_value: 800, cancelled_value: 200 }),
      source("facebook", "Facebook", { order_value: 500, approved_value: 300, pending_value: 100, returned_value: 100 }),
    ]);
    const [sankey] = seriesOf(option);
    const links = sankey.links ?? [];

    expect(links).toContainEqual(expect.objectContaining({ source: "Website", target: "Approved", value: 800 }));
    expect(links).toContainEqual(expect.objectContaining({ source: "Facebook", target: "RTO", value: 100 }));
    expect(links.some((link) => link.value === 0)).toBe(false);
    expect(links.reduce((sum, link) => sum + link.value, 0)).toBe(1500);
  });
});

describe("sourceMixOption", () => {
  it("renders one slice per mix entry", () => {
    const [pie] = seriesOf(sourceMixOption([{ label: "A", value: 60 }, { label: "Other", value: 40 }]));
    expect(pie.data).toHaveLength(2);
  });
});

describe("bestDayOption", () => {
  it("stacks website under social & manual and highlights only the best bucket", () => {
    const buckets = [bucket(0, 5, 1000, 400), bucket(1, 9, 3000, 1000), bucket(2, 4, 800, 800)];
    const series = seriesOf(bestDayOption(buckets, 1));
    const website = series.find((entry) => (entry as { name?: string }).name === "Website")!;
    const other = series.find((entry) => (entry as { name?: string }).name === "Social & manual")!;
    const values = (data: unknown[]) => data.map((item) => (item as { value: number }).value);

    expect(values(website.data)).toEqual([400, 1000, 800]);
    expect(values(other.data)).toEqual([600, 2000, 0]);
    const colors = (other.data as Array<{ itemStyle: { color: string } }>).map((item) => item.itemStyle.color);
    expect(new Set([colors[0], colors[2]]).size).toBe(1);
    expect(colors[1]).not.toBe(colors[0]);
  });
});

describe("approvalBand", () => {
  it("maps approval rate to a named band", () => {
    expect(approvalBand(55).label).toBe("Needs attention");
    expect(approvalBand(70).label).toBe("Watch");
    expect(approvalBand(79.5).label).toBe("Healthy");
    expect(approvalBand(93).label).toBe("Excellent");
  });
});
```

- [ ] **Step 5: Run to verify failure**

Run: `npx vitest run src/test/businessReportCharts.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 6: Implement `src/lib/businessReportCharts.ts`**

```ts
import type { EChartsCoreOption } from "@/lib/echarts";
import { CHART, OUTCOME_COLORS, OUTCOME_KEYS, OUTCOME_LABELS } from "@/components/business-report/chartTheme";
import type { BusinessReportSource, ProductWeight, SeriesBucket } from "@/components/business-report/types";
import type { MixSlice } from "@/lib/businessReportMetrics";
import { maxIndex } from "@/lib/businessReportMetrics";

export const GRID_ROWS = 14;

const taka = (value: number) => `৳${Math.round(value).toLocaleString("en-BD")}`;

function tooltip(extra: Record<string, unknown> = {}) {
  return {
    backgroundColor: CHART.bg,
    borderColor: CHART.rule,
    borderWidth: 1,
    padding: [6, 10],
    textStyle: { color: CHART.ink, fontFamily: CHART.font, fontSize: 12 },
    extraCssText: "box-shadow:none;border-radius:8px;",
    ...extra,
  };
}

export function sparklineOption(values: number[]): EChartsCoreOption {
  const last = values.length - 1;
  return {
    grid: { left: 0, right: 4, top: 4, bottom: 2 },
    xAxis: { type: "category", show: false, boundaryGap: false, data: values.map((_, index) => index) },
    yAxis: { type: "value", show: false, min: "dataMin" },
    series: [{
      type: "line",
      data: values,
      smooth: 0.35,
      symbol: "none",
      lineStyle: { width: 1.4, color: CHART.ink },
      areaStyle: { color: CHART.track },
      markPoint: {
        symbol: "circle",
        symbolSize: 5,
        itemStyle: { color: CHART.ink },
        label: { show: false },
        data: last >= 0 ? [{ coord: [last, values[last]] }] : [],
      },
    }],
  };
}

export function intakeGridOption(profile: SeriesBucket[]): { option: EChartsCoreOption; ordersPerCell: number; peakIndex: number } {
  const counts = profile.map((bucket) => bucket.intake_count);
  const peakIndex = maxIndex(counts);
  const peak = peakIndex >= 0 ? counts[peakIndex] : 0;
  const ordersPerCell = Math.max(1, Math.ceil(peak / GRID_ROWS));
  const bound = ordersPerCell * GRID_ROWS;
  const cell = { symbol: "rect", symbolSize: ["62%", 11], symbolMargin: 3, symbolBoundingData: bound };
  return {
    ordersPerCell,
    peakIndex,
    option: {
      grid: { left: 14, right: 6, top: 4, bottom: 22 },
      tooltip: tooltip({
        trigger: "axis",
        axisPointer: { type: "none" },
        formatter: (params: Array<{ dataIndex: number; name: string }>) => `${params[0].name}<br><b>${counts[params[0].dataIndex]}</b> orders`,
      }),
      xAxis: {
        type: "category",
        data: profile.map((bucket) => bucket.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: CHART.ink3, fontFamily: CHART.mono, fontSize: 9, interval: 3 },
      },
      yAxis: { type: "value", max: bound, show: false },
      series: [
        { type: "pictorialBar", ...cell, symbolRepeat: "fixed", z: 1, silent: true, itemStyle: { color: CHART.track }, data: counts.map(() => bound) },
        {
          type: "pictorialBar",
          ...cell,
          symbolRepeat: true,
          symbolClip: true,
          z: 2,
          data: counts.map((value, index) => ({ value, itemStyle: { color: index === peakIndex ? CHART.ink : CHART.greys[2] } })),
        },
      ],
    },
  };
}

const SANKEY_VALUE_FIELDS = {
  approved: "approved_value",
  pending: "pending_value",
  cancelled: "cancelled_value",
  returned: "returned_value",
} as const;

export function outcomeSankeyOption(sources: BusinessReportSource[]): EChartsCoreOption {
  const active = sources.filter((source) => source.order_value > 0);
  const total = active.reduce((sum, source) => sum + source.order_value, 0);
  const outcomes = OUTCOME_KEYS.filter((key) => active.some((source) => source[SANKEY_VALUE_FIELDS[key]] > 0));
  const nodes = [
    ...active.map((source, index) => ({ name: source.label, depth: 0, itemStyle: { color: CHART.greys[Math.min(index, CHART.greys.length - 1)] } })),
    ...outcomes.map((key) => ({ name: OUTCOME_LABELS[key], depth: 1, itemStyle: { color: OUTCOME_COLORS[key] } })),
  ];
  const links = active.flatMap((source) => outcomes
    .map((key) => ({ source: source.label, target: OUTCOME_LABELS[key], value: source[SANKEY_VALUE_FIELDS[key]] }))
    .filter((link) => link.value > 0));
  return {
    tooltip: tooltip({
      formatter: (params: { dataType: string; name: string; value: number; data: { source?: string; target?: string } }) => (
        params.dataType === "edge"
          ? `${params.data.source} → ${params.data.target}<br><b>${taka(params.value)}</b>`
          : `${params.name}<br><b>${taka(params.value)}</b> · ${total ? ((params.value / total) * 100).toFixed(1) : "0"}%`
      ),
    }),
    series: [{
      type: "sankey",
      left: 96,
      right: 104,
      top: 8,
      bottom: 8,
      nodeWidth: 7,
      nodeGap: 14,
      layoutIterations: 0,
      draggable: false,
      emphasis: { focus: "adjacency" },
      data: nodes,
      links,
      lineStyle: { color: "gradient", opacity: 0.22, curveness: 0.5 },
      itemStyle: { borderWidth: 0, borderRadius: 3 },
      label: {
        fontSize: 11,
        fontFamily: CHART.font,
        formatter: (params: { name: string; value: number }) => `{n|${params.name}}\n{v|${taka(params.value)}}`,
        rich: {
          n: { color: CHART.ink, fontSize: 11, lineHeight: 15 },
          v: { color: CHART.ink3, fontSize: 10, fontFamily: CHART.mono },
        },
      },
      levels: [
        { depth: 0, label: { position: "left", align: "right" } },
        { depth: 1, label: { position: "right", align: "left" } },
      ],
    }],
  };
}

export function sourceMixOption(slices: MixSlice[]): EChartsCoreOption {
  return {
    tooltip: tooltip({ formatter: (params: { name: string; value: number; percent: number }) => `${params.name}<br><b>${taka(params.value)}</b> · ${params.percent}%` }),
    series: [{
      type: "pie",
      radius: ["54%", "92%"],
      padAngle: 1.5,
      itemStyle: { borderColor: CHART.bg, borderWidth: 2 },
      label: { show: true, position: "inside", fontSize: 10, fontWeight: 500, formatter: (params: { percent: number }) => `${Math.round(params.percent)}%` },
      labelLine: { show: false },
      data: slices.map((slice, index) => ({
        name: slice.label,
        value: slice.value,
        itemStyle: { color: CHART.greys[Math.min(index, CHART.greys.length - 1)] },
        label: { color: index < 2 ? CHART.bg : CHART.ink },
      })),
    }],
  };
}

export function approvalBand(approvalRate: number): { label: string; color: string } {
  if (approvalRate < 60) return { label: "Needs attention", color: OUTCOME_COLORS.cancelled };
  if (approvalRate < 75) return { label: "Watch", color: OUTCOME_COLORS.pending };
  if (approvalRate < 90) return { label: "Healthy", color: OUTCOME_COLORS.approved };
  return { label: "Excellent", color: OUTCOME_COLORS.approved };
}

export function approvalGaugeOption(approvalRate: number): EChartsCoreOption {
  return {
    series: [{
      type: "gauge",
      startAngle: 205,
      endAngle: -25,
      min: 0,
      max: 100,
      radius: "96%",
      center: ["50%", "62%"],
      splitNumber: 20,
      axisLine: {
        lineStyle: {
          width: 10,
          color: [[0.6, OUTCOME_COLORS.cancelled], [0.75, OUTCOME_COLORS.pending], [1, OUTCOME_COLORS.approved]],
        },
      },
      progress: { show: false },
      pointer: {
        show: true,
        icon: "circle",
        length: "10%",
        width: 12,
        offsetCenter: [0, "-88%"],
        itemStyle: { color: CHART.bg, borderColor: CHART.ink, borderWidth: 2.5 },
      },
      anchor: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, length: 10, distance: -10, lineStyle: { color: CHART.bg, width: 3 } },
      axisLabel: { show: false },
      title: { show: false },
      detail: {
        offsetCenter: [0, "0%"],
        formatter: (value: number) => `${value.toFixed(1)}%`,
        color: CHART.ink,
        fontSize: 30,
        fontWeight: 300,
        fontFamily: CHART.font,
      },
      data: [{ value: Number(approvalRate.toFixed(1)) }],
    }],
  };
}

export function bestDayOption(buckets: SeriesBucket[], bestIndex: number): EChartsCoreOption {
  const spacer = Math.max(0, ...buckets.map((bucket) => bucket.order_value)) * 0.018;
  const style = (index: number, highlight: string) => ({
    color: index === bestIndex ? highlight : CHART.track,
    borderRadius: 5,
    ...(index === bestIndex ? { shadowBlur: 14, shadowColor: CHART.ink3 } : {}),
  });
  return {
    grid: { left: 4, right: 4, top: 12, bottom: 24 },
    tooltip: tooltip({
      trigger: "axis",
      axisPointer: { type: "none" },
      formatter: (params: Array<{ dataIndex: number; name: string }>) => {
        const bucket = buckets[params[0].dataIndex];
        return `${bucket.label} · <b>${taka(bucket.order_value)}</b><br>Social &amp; manual ${taka(bucket.order_value - bucket.website_value)}<br>Website ${taka(bucket.website_value)}`;
      },
    }),
    xAxis: {
      type: "category",
      data: buckets.map((bucket) => bucket.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: CHART.ink3, fontSize: 10, interval: (index: number) => index % 7 === 0 || index === bestIndex },
    },
    yAxis: { type: "value", show: false },
    series: [
      {
        name: "Website",
        type: "bar",
        stack: "day",
        barWidth: "62%",
        data: buckets.map((bucket, index) => ({ value: bucket.website_value, itemStyle: style(index, CHART.greys[2]) })),
      },
      {
        name: "gap",
        type: "bar",
        stack: "day",
        silent: true,
        tooltip: { show: false },
        itemStyle: { color: "rgba(0,0,0,0)" },
        data: buckets.map(() => ({ value: spacer, itemStyle: { color: "rgba(0,0,0,0)" } })),
      },
      {
        name: "Social & manual",
        type: "bar",
        stack: "day",
        data: buckets.map((bucket, index) => ({ value: bucket.order_value - bucket.website_value, itemStyle: style(index, CHART.ink) })),
      },
    ],
  };
}

export function productRingsOption(products: ProductWeight[]): EChartsCoreOption {
  const top = products.filter((product) => product.kg > 0).slice(0, 5);
  const total = products.reduce((sum, product) => sum + product.kg, 0);
  const width = 100 / Math.max(top.length, 1);
  return {
    tooltip: tooltip({
      formatter: (params: { name: string; value: number }) => (params.name === "rest" ? "" : `${params.name}<br><b>${params.value.toLocaleString("en-BD")} kg</b>`),
    }),
    series: top.map((product, index) => ({
      type: "pie",
      radius: ["26%", "32%"],
      center: [`${(index + 0.5) * width}%`, "40%"],
      startAngle: 90,
      label: { show: false },
      emphasis: { scale: false },
      data: [
        { name: product.product_name, value: product.kg, itemStyle: { color: CHART.greys[Math.min(index, 3)] } },
        { name: "rest", value: Math.max(total - product.kg, 0), itemStyle: { color: CHART.track }, tooltip: { show: false } },
      ],
    })),
    graphic: top.map((product, index) => ({
      type: "text",
      left: `${(index + 0.5) * width}%`,
      top: "82%",
      style: { text: product.product_name, fill: CHART.ink2, font: `400 11px ${CHART.font}`, textAlign: "center" },
    })),
  };
}
```

Note: `products` from the API are already sorted by kg (`sortProducts` in `server/businessReport.js`), so `productRingsOption` takes the first 5.

- [ ] **Step 7: Implement `src/components/business-report/EChart.tsx`**

```tsx
import { useEffect, useRef } from "react";
import { echarts, type EChartsCoreOption } from "@/lib/echarts";

type EChartProps = {
  option: EChartsCoreOption;
  ariaLabel: string;
  className?: string;
  animate?: boolean;
};

export function EChart({ option, ariaLabel, className, animate = true }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = echarts.init(container, null, { renderer: "svg" });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption({ animation: animate, textStyle: { fontFamily: '"Geist Sans", system-ui, sans-serif' }, ...option }, true);
  }, [option, animate]);

  return <div ref={containerRef} role="img" aria-label={ariaLabel} className={className} />;
}
```

- [ ] **Step 8: Run to verify pass**

Run: `npx vitest run src/test/businessReportCharts.test.ts && npx tsc --noEmit -p tsconfig.app.json`
Expected: tests PASS; no type errors. (If the project's tsconfig name differs, use the one `npm run build` uses; check `package.json`.)

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/lib/echarts.ts src/components/business-report/chartTheme.ts src/lib/businessReportCharts.ts src/components/business-report/EChart.tsx src/test/businessReportCharts.test.ts
git commit -m "feat: add ECharts setup and business report chart builders"
```

---

### Task 5: Summary tiles with sparklines and previous-period deltas

**Files:**
- Create: `src/components/business-report/SummaryTiles.tsx`
- Modify: `src/pages/BusinessReport.tsx` (replace the 5 `SnapshotCard` usages and delete `SnapshotCard`)
- Test: `src/test/businessReportPage.test.tsx`

**Interfaces:**
- Consumes: `BusinessReportResponse`, `SeriesBucket` (Task 3); `rate`, `percentChange`, `pointChange` (Task 3); `sparklineOption` (Task 4); `EChart` (Task 4).
- Produces: `SummaryTiles({ report, reduceMotion }: { report: BusinessReportResponse; reduceMotion: boolean | null })`. Keeps test ids `business-report-summary-intake`, `-order-value`, `-weight`, `-approved`, `-cancelled`.

- [ ] **Step 1: Update the page test fixture and write failing tests**

At the top of `src/test/businessReportPage.test.tsx`, add a mock so ECharts never runs in jsdom:

```tsx
vi.mock("@/components/business-report/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}));
```

Replace the local `Metrics`, `ProductWeight` and `BusinessReportResponse` types with
`import type { BusinessReportResponse, Metrics, ProductWeight, SeriesBucket } from "@/components/business-report/types";`.

Update `hourlyBuckets()` and `dailyBuckets()` to return full `SeriesBucket` objects (add `website_value: 0, order_kg: 0, approved_count: 0, cancelled_count: 0`), and in `reportResponse()` add `previous: null` and `hourly_profile: hourlyBuckets().map((bucket, hour) => ({ ...bucket, key: `hour-${hour}` }))`.

Add tests:

```tsx
  it("shows previous-period changes on the summary tiles for a bounded range", async () => {
    apiFetch.mockResolvedValue(jsonResponse(reportResponse({
      previous: {
        range: { from: "2026-09-19", to: "2026-09-19" },
        summary: metrics({ intake_count: 2, order_value: 2000, approved_count: 1, cancelled_count: 0 }),
      },
    })));

    renderPage();

    expect(await screen.findByTestId("business-report-summary-intake")).toHaveTextContent("+100% vs previous period");
    expect(screen.getByTestId("business-report-summary-order-value")).toHaveTextContent("+20% vs previous period");
    // approved 1 of 4 = 25% now vs 1 of 2 = 50% before
    expect(screen.getByTestId("business-report-summary-approved")).toHaveTextContent("−25 pts");
    // cancelled 1 of 4 = 25% now vs 0% before
    expect(screen.getByTestId("business-report-summary-cancelled")).toHaveTextContent("+25 pts");
  });

  it("omits previous-period changes when there is no previous period", async () => {
    apiFetch.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    expect(await screen.findByTestId("business-report-summary-intake")).not.toHaveTextContent("vs previous period");
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/test/businessReportPage.test.tsx`
Expected: the two new tests FAIL (no delta text).

- [ ] **Step 3: Implement `SummaryTiles.tsx`**

```tsx
import { useMemo } from "react";
import { motion } from "framer-motion";
import { EChart } from "@/components/business-report/EChart";
import type { BusinessReportResponse, SeriesBucket } from "@/components/business-report/types";
import { sparklineOption } from "@/lib/businessReportCharts";
import { percentChange, pointChange, rate } from "@/lib/businessReportMetrics";

const formatNumber = (value: number) => Number(value || 0).toLocaleString("en-BD");
const formatTaka = (value: number) => `৳${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
const formatKg = (value: number) => `${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })} kg`;
const formatPct = (value: number) => `${value.toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`;

type Delta = { text: string; tone: "good" | "bad" | "neutral" };

function percentDelta(current: number, previous: number | undefined): Delta | null {
  if (previous === undefined) return null;
  const change = percentChange(current, previous);
  if (change === null) return null;
  const rounded = Math.round(change * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return { text: `${sign}${Math.abs(rounded).toLocaleString("en-BD")}% vs previous period`, tone: rounded > 0 ? "good" : rounded < 0 ? "bad" : "neutral" };
}

function pointsDelta(current: number, previous: number | undefined, higherIsBetter: boolean): Delta | null {
  if (previous === undefined) return null;
  const rounded = Math.round(pointChange(current, previous) * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  const better = higherIsBetter ? rounded > 0 : rounded < 0;
  return { text: `${sign}${Math.abs(rounded).toLocaleString("en-BD")} pts`, tone: rounded === 0 ? "neutral" : better ? "good" : "bad" };
}

const TONE_CLASS: Record<Delta["tone"], string> = {
  good: "text-[#2F7A55]",
  bad: "text-[#B4473A]",
  neutral: "text-black/55",
};

function Tile({
  label, value, description, delta, spark, testId, delay, reduceMotion,
}: {
  label: string;
  value: string;
  description: string;
  delta: Delta | null;
  spark: number[];
  testId: string;
  delay: number;
  reduceMotion: boolean | null;
}) {
  const option = useMemo(() => sparklineOption(spark), [spark]);
  return (
    <motion.div
      data-testid={testId}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : delay, duration: 0.35 }}
      className="flex min-h-[112px] flex-col rounded-2xl bg-black/[0.04] px-5 pb-2 pt-3"
    >
      <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">{label}</p>
      <p className="mt-1 text-2xl font-light tabular-nums tracking-[-0.04em] text-black">{value}</p>
      <p className="mt-0.5 text-[11px] text-black/60">
        {description}
        {delta && <span className={`ml-1.5 font-medium tabular-nums ${TONE_CLASS[delta.tone]}`}>{delta.text}</span>}
      </p>
      {spark.length > 1 && (
        <EChart option={option} ariaLabel={`${label} trend`} className="mt-auto h-[30px] w-full" animate={!reduceMotion} />
      )}
    </motion.div>
  );
}

function pick(buckets: SeriesBucket[], field: keyof Pick<SeriesBucket, "intake_count" | "order_value" | "order_kg" | "approved_count" | "cancelled_count">) {
  return buckets.map((bucket) => bucket[field]);
}

export function SummaryTiles({ report, reduceMotion }: { report: BusinessReportResponse; reduceMotion: boolean | null }) {
  const { summary, previous, series } = report;
  const prev = previous?.summary;
  const approvedRate = rate(summary.approved_count, summary.intake_count);
  const cancelledRate = rate(summary.cancelled_count, summary.intake_count);
  const buckets = series.buckets;
  const tiles = [
    {
      label: "Intake", value: formatNumber(summary.intake_count), description: "Regular orders created",
      delta: percentDelta(summary.intake_count, prev?.intake_count), spark: pick(buckets, "intake_count"), testId: "business-report-summary-intake",
    },
    {
      label: "Order value", value: formatTaka(summary.order_value), description: "Before delivery",
      delta: percentDelta(summary.order_value, prev?.order_value), spark: pick(buckets, "order_value"), testId: "business-report-summary-order-value",
    },
    {
      label: "Weight", value: formatKg(summary.order_kg), description: `Recorded on ${formatNumber(summary.weight_order_count)} of ${formatNumber(summary.intake_count)} orders`,
      delta: percentDelta(summary.order_kg, prev?.order_kg), spark: pick(buckets, "order_kg"), testId: "business-report-summary-weight",
    },
    {
      label: "Approved / progressing", value: formatNumber(summary.approved_count),
      description: `${formatPct(approvedRate)} of intake${summary.approved_kg > 0 ? ` · ${formatKg(summary.approved_kg)}` : ""}`,
      delta: pointsDelta(approvedRate, prev ? rate(prev.approved_count, prev.intake_count) : undefined, true),
      spark: pick(buckets, "approved_count"), testId: "business-report-summary-approved",
    },
    {
      label: "Cancelled", value: formatNumber(summary.cancelled_count),
      description: `${formatPct(cancelledRate)} of intake${summary.cancelled_kg > 0 ? ` · ${formatKg(summary.cancelled_kg)}` : ""}`,
      delta: pointsDelta(cancelledRate, prev ? rate(prev.cancelled_count, prev.intake_count) : undefined, false),
      spark: pick(buckets, "cancelled_count"), testId: "business-report-summary-cancelled",
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {tiles.map((tile, index) => (
        <Tile key={tile.testId} {...tile} delay={0.02 + index * 0.04} reduceMotion={reduceMotion} />
      ))}
    </div>
  );
}
```

Note: `pick(...)` returns a new array each render; wrap the `tiles` array in `useMemo(() => …, [report])` so sparkline options are not rebuilt every render.

In `src/pages/BusinessReport.tsx`, replace the `<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">…</div>` block of five `SnapshotCard`s with `<SummaryTiles report={data} reduceMotion={reduceMotion} />`, import it, and delete the `SnapshotCard` function.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/test/businessReportPage.test.tsx`
Expected: the two new tests PASS; existing summary assertions (`"4"`, `"৳2,400"`, `"12.5 kg"`, `"Recorded on 3 of 4 orders"`, `"5 kg"`) still PASS. Tests that reference the old intake strip or source cards may fail — they are rewritten in Tasks 6 and 7; do not delete them yet.

- [ ] **Step 5: Commit**

```bash
git add src/components/business-report/SummaryTiles.tsx src/pages/BusinessReport.tsx src/test/businessReportPage.test.tsx
git commit -m "feat: add sparklines and previous-period changes to business report summary"
```

---

### Task 6: Chart panels (intake rhythm, outcomes sankey, source mix, approval gauge, best day, product weight)

**Files:**
- Create: `src/components/business-report/ReportCharts.tsx`
- Modify: `src/pages/BusinessReport.tsx` (remove `IntakeSeries`, `ProductWeightRow`, `ProductWeightList`; compose panels)
- Test: `src/test/businessReportPage.test.tsx`

**Interfaces:**
- Consumes: Task 3 types + `groupSourceMix`, `maxIndex`, `rate`; Task 4 builders + `EChart`, `approvalBand`.
- Produces (all `({ report, reduceMotion }: { report: BusinessReportResponse; reduceMotion: boolean | null })`):
  `IntakeRhythmPanel`, `OutcomeSankeyPanel`, `SourceMixPanel`, `ApprovalGaugePanel`, `BestDayPanel`, `ProductWeightPanel`.
  Each renders a `<section aria-labelledby=…>` with a visible heading; region names used by tests:
  "When orders arrive", "Where each channel's orders end up", "Order value by channel", "Approval rate", "Best day", "Product weight".

- [ ] **Step 1: Write failing tests** — in `src/test/businessReportPage.test.tsx`, replace the tests "loads today by default and renders operational totals with an accessible intake chart" (keep its summary/delivery assertions, drop the `within(chart).getByLabelText("9a: 2 orders")` part), "stretches day-granularity bars full width with single-line labels", and the overall-product part of "shows product packs and kg overall and inside each source" with:

```tsx
  it("renders the intake rhythm with its peak hour and the outcome panels", async () => {
    apiFetch.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    const rhythm = await screen.findByRole("region", { name: "When orders arrive" });
    expect(within(rhythm).getByText("9a")).toBeInTheDocument(); // peak label
    expect(within(rhythm).getByRole("img", { name: /Orders by hour of day, peak 9a with 2 orders/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Where each channel's orders end up" })).toBeInTheDocument();
    const mix = screen.getByRole("region", { name: "Order value by channel" });
    expect(within(mix).getByText("Website")).toBeInTheDocument();
    expect(within(mix).getByText("৳1,400")).toBeInTheDocument();
    const gauge = screen.getByRole("region", { name: "Approval rate" });
    expect(within(gauge).getByText("25%")).toBeInTheDocument();
    expect(within(gauge).getByText("Needs attention")).toBeInTheDocument();
  });

  it("hides Best day for a single-day range and shows it with the best day for a multi-day range", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(reportResponse()));
    const first = renderPage();
    await screen.findByRole("region", { name: "When orders arrive" });
    expect(screen.queryByRole("region", { name: "Best day" })).not.toBeInTheDocument();
    first.unmount();

    const days = dailyBuckets().map((bucket, index) => ({ ...bucket, website_value: index === 6 ? 5000 : 0 }));
    apiFetch.mockResolvedValueOnce(jsonResponse(reportResponse({
      range: { from: "2026-09-14", to: "2026-09-20" },
      series: { granularity: "day", label: "Intake by day", buckets: days },
    })));
    renderPage();

    const best = await screen.findByRole("region", { name: "Best day" });
    expect(within(best).getByText("৳11,000")).toBeInTheDocument(); // Sep 20: (80 + 6*5) * 100
    expect(within(best).getByText(/Sep 20/)).toBeInTheDocument();
    expect(within(best).getByText(/45% website/)).toBeInTheDocument();
  });

  it("lists overall product weight with approved kg and packs", async () => {
    const outcomeDefaults = { cancelled_packs: 0, cancelled_kg: 0, returned_packs: 0, returned_kg: 0, pending_packs: 0, pending_kg: 0 };
    const himsagar = { ...outcomeDefaults, product_id: "p-1", product_name: "Himsagar", packs: 4, kg: 25, approved_packs: 3, approved_kg: 20, cancelled_packs: 1, cancelled_kg: 5, order_count: 2 };
    apiFetch.mockResolvedValue(jsonResponse(reportResponse({ products: [himsagar], missing_weight_products: [{ id: "p-2", name: "Langra" }] })));

    renderPage();

    const overall = await screen.findByRole("region", { name: "Product weight" });
    expect(within(overall).getByText("Himsagar")).toBeInTheDocument();
    expect(within(overall).getByText("25 kg")).toBeInTheDocument();
    expect(within(overall).getByText("20 kg approved · 4 packs")).toBeInTheDocument();
    expect(screen.getByText(/1 product is missing a catalog weight: Langra/)).toBeInTheDocument();
  });
```

(`dailyBuckets()` labels are `Sep 14`…`Sep 20`; the best bucket is index 6 at ৳11,000, website 5,000 → 45%.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/test/businessReportPage.test.tsx`
Expected: the three new tests FAIL (regions not found).

- [ ] **Step 3: Implement `ReportCharts.tsx`**

```tsx
import { useId, useMemo, type ReactNode } from "react";
import { EChart } from "@/components/business-report/EChart";
import { CHART } from "@/components/business-report/chartTheme";
import type { BusinessReportResponse } from "@/components/business-report/types";
import {
  approvalBand,
  approvalGaugeOption,
  bestDayOption,
  intakeGridOption,
  outcomeSankeyOption,
  productRingsOption,
  sourceMixOption,
} from "@/lib/businessReportCharts";
import { groupSourceMix, maxIndex, rate } from "@/lib/businessReportMetrics";

type PanelProps = { report: BusinessReportResponse; reduceMotion: boolean | null };

const formatNumber = (value: number) => Number(value || 0).toLocaleString("en-BD");
const formatTaka = (value: number) => `৳${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
const formatKg = (value: number) => `${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })} kg`;

function Panel({ eyebrow, title, aside, children, className = "" }: { eyebrow: string; title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={`flex min-w-0 flex-col gap-3 rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">{eyebrow}</p>
          <h2 id={headingId} className="mt-1 font-sf-display text-[15px] font-semibold text-black">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function IntakeRhythmPanel({ report, reduceMotion }: PanelProps) {
  const { option, ordersPerCell, peakIndex } = useMemo(() => intakeGridOption(report.hourly_profile), [report.hourly_profile]);
  const peak = peakIndex >= 0 ? report.hourly_profile[peakIndex] : null;
  const label = peak
    ? `Orders by hour of day, peak ${peak.label} with ${formatNumber(peak.intake_count)} orders`
    : "Orders by hour of day, no orders";
  return (
    <Panel
      eyebrow="Intake rhythm"
      title="When orders arrive"
      aside={<p className="text-right font-mono text-[10px] leading-relaxed text-black/45">// CELL: <b className="font-medium text-black">{ordersPerCell} {ordersPerCell === 1 ? "ORDER" : "ORDERS"}</b><br />// HOUR OF DAY</p>}
    >
      <div className="flex gap-7 font-mono">
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">[Σ] Total</p>
          <p className="mt-1 text-[26px] font-light tabular-nums tracking-[-0.03em] text-black">{formatNumber(report.summary.intake_count)}</p>
        </div>
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">[⬆] Peak</p>
          <p className="mt-1 text-[26px] font-light tabular-nums tracking-[-0.03em] text-black">{peak ? peak.label : "—"}</p>
        </div>
      </div>
      <EChart option={option} ariaLabel={label} className="h-[250px] w-full" animate={!reduceMotion} />
    </Panel>
  );
}

export function OutcomeSankeyPanel({ report, reduceMotion }: PanelProps) {
  const option = useMemo(() => outcomeSankeyOption(report.sources), [report.sources]);
  const { summary } = report;
  const moving = rate(summary.approved_value, summary.order_value);
  return (
    <Panel
      eyebrow="Order outcomes"
      title="Where each channel's orders end up"
      aside={<span className="rounded-full bg-black/[0.05] px-3 py-1 text-[11px] tabular-nums text-black/70">{report.sources.length} sources · 4 outcomes</span>}
    >
      <div className="flex gap-7">
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Total booked</p>
          <p className="mt-1 text-[26px] font-light tabular-nums tracking-[-0.03em] text-black">{formatTaka(summary.order_value)}</p>
        </div>
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Delivered or moving</p>
          <p className="mt-1 text-[26px] font-light tabular-nums tracking-[-0.03em] text-black">{moving.toLocaleString("en-BD", { maximumFractionDigits: 1 })}%</p>
        </div>
      </div>
      <EChart option={option} ariaLabel="Order value flowing from each source to approved, pending, cancelled and RTO" className="h-[250px] w-full" animate={!reduceMotion} />
    </Panel>
  );
}

export function SourceMixPanel({ report, reduceMotion }: PanelProps) {
  const slices = useMemo(() => groupSourceMix(report.sources, 4), [report.sources]);
  const option = useMemo(() => sourceMixOption(slices), [slices]);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return (
    <Panel eyebrow="Source mix" title="Order value by channel">
      <EChart option={option} ariaLabel="Share of order value by source" className="h-[200px] w-full" animate={!reduceMotion} />
      <ul className="grid gap-1.5">
        {slices.map((slice, index) => (
          <li key={slice.label} className="grid grid-cols-[10px_1fr_auto_auto] items-center gap-2 text-[12px]">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: CHART.greys[Math.min(index, CHART.greys.length - 1)] }} />
            <span>{slice.label}</span>
            <span className="tabular-nums">{formatTaka(slice.value)}</span>
            <span className="min-w-[36px] text-right tabular-nums text-black/45">{Math.round(rate(slice.value, total))}%</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function ApprovalGaugePanel({ report, reduceMotion }: PanelProps) {
  const approvalRate = rate(report.summary.approved_count, report.summary.intake_count);
  const option = useMemo(() => approvalGaugeOption(approvalRate), [approvalRate]);
  const band = approvalBand(approvalRate);
  return (
    <Panel eyebrow="Approval health" title="Approval rate">
      <EChart option={option} ariaLabel={`Approval rate ${approvalRate.toFixed(1)} percent, ${band.label}`} className="h-[190px] w-full" animate={!reduceMotion} />
      <div className="-mt-2 text-center">
        <p className="text-[22px] font-light tabular-nums text-black">{`${approvalRate.toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`}</p>
        <p className="text-[11px] text-black/60">
          <span className="font-medium" style={{ color: band.color }}>{band.label}</span> · {formatNumber(report.summary.approved_count)} of {formatNumber(report.summary.intake_count)}
        </p>
      </div>
    </Panel>
  );
}

export function BestDayPanel({ report, reduceMotion }: PanelProps) {
  const buckets = report.series.buckets;
  const bestIndex = useMemo(() => maxIndex(buckets.map((bucket) => bucket.order_value)), [buckets]);
  const option = useMemo(() => bestDayOption(buckets, bestIndex), [buckets, bestIndex]);
  if (report.series.granularity === "hour" || bestIndex < 0) return null;
  const best = buckets[bestIndex];
  return (
    <Panel
      eyebrow="Best day"
      title="Best day"
      aside={(
        <div className="flex flex-col gap-1.5 text-[11px] text-black/60">
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-[2px]" style={{ background: CHART.ink }} />Social &amp; manual</span>
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-[2px]" style={{ background: CHART.greys[2] }} />Website</span>
        </div>
      )}
    >
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="text-[28px] font-light tabular-nums tracking-[-0.03em] text-black">{formatTaka(best.order_value)}</span>
        <span className="text-[13px] text-black/60">on {best.label} · {Math.round(rate(best.website_value, best.order_value))}% website</span>
      </p>
      <EChart option={option} ariaLabel={`Daily order value, best day ${best.label}`} className="h-[220px] w-full" animate={!reduceMotion} />
    </Panel>
  );
}

export function ProductWeightPanel({ report, reduceMotion }: PanelProps) {
  const option = useMemo(() => productRingsOption(report.products), [report.products]);
  const total = report.products.reduce((sum, product) => sum + product.kg, 0);
  if (report.products.length === 0) return null;
  return (
    <Panel
      eyebrow="Product weight"
      title="Product weight"
      aside={<span className="text-[13px] tabular-nums text-black/60">{formatKg(total)} · {formatNumber(report.products.length)} products</span>}
    >
      {total > 0 && <EChart option={option} ariaLabel="Share of weight by product" className="h-[110px] w-full" animate={!reduceMotion} />}
      <ul className="grid gap-0.5">
        {report.products.map((product, index) => (
          <li key={product.product_id || product.product_name} className="grid grid-cols-[10px_44px_minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] odd:bg-black/[0.04]">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: CHART.greys[Math.min(index, 3)] }} />
            <span className="font-semibold tabular-nums">{Math.round(rate(product.kg, total))}%</span>
            <span className="truncate">{product.product_name}</span>
            <span className="text-[11px] tabular-nums text-black/45">{`${formatKg(product.approved_kg)} approved · ${formatNumber(product.packs)} packs`}</span>
            <span className="tabular-nums">{formatKg(product.kg)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
```

Hook-order note: `BestDayPanel` and `ProductWeightPanel` call all hooks before any early `return null` — keep it that way.

- [ ] **Step 4: Compose the page** — in `src/pages/BusinessReport.tsx`, inside the non-empty branch, after `<SummaryTiles … />`:

```tsx
            <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
              <IntakeRhythmPanel report={data} reduceMotion={reduceMotion} />
              <OutcomeSankeyPanel report={data} reduceMotion={reduceMotion} />
            </section>
            <section className="grid gap-3 lg:grid-cols-3">
              <SourceMixPanel report={data} reduceMotion={reduceMotion} />
              <ApprovalGaugePanel report={data} reduceMotion={reduceMotion} />
              {/* existing Delivery economics block, moved here unchanged */}
            </section>
            <BestDayPanel report={data} reduceMotion={reduceMotion} />
            <ProductWeightPanel report={data} reduceMotion={reduceMotion} />
```

Move the existing "Delivery economics" `<div className="rounded-2xl bg-black/[0.04] …">…</div>` into the third column verbatim (its test assertions — "Delivery charged", "Courier fees recorded", "Net delivery position", "Courier fee coverage: 3 of 4 orders" — must keep passing). Delete `IntakeSeries`, `ProductWeightRow`, `ProductWeightList` and the old product-weight `motion.section`. Leave the Source performance section in place for Task 7.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/test/businessReportPage.test.tsx src/test/businessReportCharts.test.ts src/test/businessReportMetrics.test.ts`
Expected: the new panel tests and Task 5 tests PASS. Remaining failures, if any, are only the source-card tests rewritten in Task 7.

- [ ] **Step 6: Commit**

```bash
git add src/components/business-report/ReportCharts.tsx src/pages/BusinessReport.tsx src/test/businessReportPage.test.tsx
git commit -m "feat: add intake rhythm, outcomes, mix, approval, best day and product weight charts"
```

---

### Task 7: Source performance table with per-source products by outcome

**Files:**
- Create: `src/components/business-report/SourcePerformanceTable.tsx`
- Modify: `src/pages/BusinessReport.tsx` (replace `SourceCard`, `DetailGroup`, `LandingPageList` and the Source performance section; remove now-unused imports such as `Chip`, `CaretDown`, `CaretRight`, `AnimatePresence`)
- Test: `src/test/businessReportPage.test.tsx`

**Interfaces:**
- Consumes: `buildSourceRows`, `sortSourceRows`, `buildProductOutcomeRows`, `rate`, types `SourceRow`, `SourceSortKey`, `SortDir` (Task 3); `OUTCOME_COLORS`, `OUTCOME_KEYS`, `OUTCOME_LABELS` (Task 4).
- Produces: `SourcePerformanceTable({ report }: { report: BusinessReportResponse })`. Each source row `<tr data-testid="business-report-source-{source}">`; the toggle is a `<button aria-expanded aria-controls>` named `Show products for {label}` / `Hide products for {label}`; header sort buttons are named by column label; an "Expand all"/"Collapse all" button.

- [ ] **Step 1: Write failing tests** — replace the tests "keeps source outcomes and fee coverage visible, then expands Website landing pages", "shows kg totals in the summary, source breakdown, and landing pages" (keep its summary-tile assertions), and the per-source part of "shows product packs and kg overall and inside each source" with:

```tsx
  it("compares sources in a table with rates and flags the weaker source", async () => {
    apiFetch.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    const table = await screen.findByRole("table", { name: "Source performance" });
    const website = within(table).getByTestId("business-report-source-website");
    const manual = within(table).getByTestId("business-report-source-manual_other");
    expect(within(website).getByText("50%")).toBeInTheDocument(); // approval 1 of 2
    expect(within(website).getByText("28.6%")).toBeInTheDocument(); // loss 400 of 1,400
    expect(within(manual).getByText("0%")).toBeInTheDocument(); // approval 0 of 2 → flagged
    expect(within(manual).getByText("0%")).toHaveAttribute("data-flag", "worse");
    expect(within(manual).getByText("−৳25")).toBeInTheDocument(); // net −50 over 2 orders
    expect(screen.getByText("Courier fees recorded on 3 of 4 orders · weight on 0 of 4")).toBeInTheDocument();
  });

  it("sorts sources when a column header is clicked", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    const table = await screen.findByRole("table", { name: "Source performance" });
    const firstSource = () => within(table).getAllByTestId(/^business-report-source-/)[0];
    expect(firstSource()).toHaveAttribute("data-testid", "business-report-source-website"); // default: order value desc

    await user.click(within(table).getByRole("button", { name: /^Loss/ }));
    expect(firstSource()).toHaveAttribute("data-testid", "business-report-source-manual_other"); // 70% loss first
  });

  it("expands a source to show landing pages and products by outcome with kg", async () => {
    const user = userEvent.setup();
    const outcomeDefaults = { pending_packs: 0, pending_kg: 0 };
    const himsagar = { ...outcomeDefaults, product_id: "p-1", product_name: "Himsagar", packs: 4, kg: 20, approved_packs: 3, approved_kg: 18, cancelled_packs: 1, cancelled_kg: 2, returned_packs: 0, returned_kg: 0, order_count: 2 };
    const fazli = { ...outcomeDefaults, product_id: "p-2", product_name: "Fazli", packs: 2, kg: 10, approved_packs: 1, approved_kg: 6, cancelled_packs: 0, cancelled_kg: 1, returned_packs: 1, returned_kg: 3, order_count: 2 };
    const base = reportResponse();
    apiFetch.mockResolvedValue(jsonResponse({ ...base, sources: [{ ...base.sources[0], products: [himsagar, fazli] }, base.sources[1]] }));

    renderPage();

    const table = await screen.findByRole("table", { name: "Source performance" });
    expect(within(table).queryByRole("table", { name: "Website products by outcome" })).not.toBeInTheDocument();

    await user.click(within(table).getByRole("button", { name: "Show products for Website" }));

    expect(within(table).getByRole("button", { name: "Hide products for Website" })).toHaveAttribute("aria-expanded", "true");
    expect(within(table).getByText("/step/katimon-mango")).toBeInTheDocument();
    const products = within(table).getByRole("table", { name: "Website products by outcome" });
    const fazliRow = within(products).getByRole("row", { name: /Fazli/ });
    expect(within(fazliRow).getByText("10 kg")).toBeInTheDocument();
    expect(within(fazliRow).getByText("6")).toBeInTheDocument(); // approved kg
    expect(within(fazliRow).getByText("3")).toBeInTheDocument(); // RTO kg
    expect(within(fazliRow).getByText("40%")).toHaveAttribute("data-flag", "worse"); // loss 4/10 = 40% vs all products 6/30 = 20%
    const himsagarRow = within(products).getByRole("row", { name: /Himsagar/ });
    expect(himsagarRow.querySelector("[data-flag]")).toBeNull(); // loss 2/20 = 10%, not flagged
    expect(within(products).getByRole("row", { name: /All products/ })).toHaveTextContent("30 kg");
  });

  it("expands and collapses every source at once", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    const table = await screen.findByRole("table", { name: "Source performance" });
    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(within(table).getByRole("button", { name: "Hide products for Website" })).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "Hide products for Manual / Other" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(within(table).getByRole("button", { name: "Show products for Website" })).toBeInTheDocument();
  });
```

Fixture arithmetic (from `reportResponse()`): summary approval 1/4 = 25%, loss (400+700)/2,400 = 45.8%. Website approval 50%, loss 400/1,400 = 28.6%. Manual approval 0% (< 25 − 3 → flagged), loss 700/1,000 = 70% (> 45.8 + 3 → flagged), net −50/2 = −25.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/test/businessReportPage.test.tsx`
Expected: the four new tests FAIL (no table).

- [ ] **Step 3: Implement `SourcePerformanceTable.tsx`**

```tsx
import { Fragment, useMemo, useState } from "react";
import { CaretRight } from "@phosphor-icons/react";
import { OUTCOME_COLORS, OUTCOME_KEYS, OUTCOME_LABELS, type OutcomeKey } from "@/components/business-report/chartTheme";
import type { BusinessReportResponse, BusinessReportSource } from "@/components/business-report/types";
import {
  buildProductOutcomeRows,
  buildSourceRows,
  rate,
  sortSourceRows,
  type ProductOutcomeRow,
  type SortDir,
  type SourceRow,
  type SourceSortKey,
} from "@/lib/businessReportMetrics";

const formatNumber = (value: number) => Number(value || 0).toLocaleString("en-BD");
const formatTaka = (value: number) => `৳${Math.round(value || 0).toLocaleString("en-BD")}`;
const formatKg = (value: number) => `${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })} kg`;
const formatPct = (value: number) => `${value.toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`;
const signedTaka = (value: number) => `${value < 0 ? "−" : "+"}৳${Math.abs(Math.round(value)).toLocaleString("en-BD")}`;

const COLUMNS: Array<{ key: SourceSortKey | null; label: string; align?: "right" }> = [
  { key: "label", label: "Source" },
  { key: "orders", label: "Orders", align: "right" },
  { key: "value", label: "Order value", align: "right" },
  { key: null, label: "Share" },
  { key: null, label: "Outcome mix" },
  { key: "approvalRate", label: "Approval", align: "right" },
  { key: "lossRate", label: "Loss", align: "right" },
  { key: "aov", label: "AOV", align: "right" },
  { key: "kg", label: "Weight", align: "right" },
  { key: "netPerOrder", label: "Net delivery / order", align: "right" },
];

function OutcomeBar({ values, width = "w-[170px]" }: { values: Record<OutcomeKey, number>; width?: string }) {
  const total = OUTCOME_KEYS.reduce((sum, key) => sum + values[key], 0);
  return (
    <div className={`flex h-2 gap-[2px] overflow-hidden rounded ${width}`} role="img" aria-label={OUTCOME_KEYS.map((key) => `${OUTCOME_LABELS[key]} ${Math.round(rate(values[key], total))}%`).join(", ")}>
      {OUTCOME_KEYS.map((key) => values[key] > 0 && (
        <i key={key} className="block h-full" style={{ width: `${rate(values[key], total)}%`, background: OUTCOME_COLORS[key] }} />
      ))}
    </div>
  );
}

function Flagged({ value, flagged }: { value: string; flagged: boolean }) {
  return flagged
    ? <span data-flag="worse" className="font-medium text-[#B4473A]">{value}</span>
    : <span>{value}</span>;
}

function ProductOutcomeTable({ label, source }: { label: string; source: BusinessReportSource }) {
  const table = useMemo(() => buildProductOutcomeRows(source.products), [source.products]);
  if (source.products.length === 0) {
    return <p className="px-1 text-[11px] text-black/55">No products recorded for this source.</p>;
  }
  const cell = (kg: number, total: number) => (
    <>
      <span>{kg ? formatNumber(kg) : "—"}</span>
      {kg > 0 && <span className="ml-1.5 inline-block min-w-[26px] text-right text-[10px] text-black/40">{Math.round(rate(kg, total))}%</span>}
    </>
  );
  const row = (item: ProductOutcomeRow, isTotal: boolean) => (
    <tr key={item.name} className={isTotal ? "bg-black/[0.03] font-semibold" : "border-b border-black/[0.06]"}>
      <th scope="row" className="px-3 py-2 text-left font-[inherit]">{item.name}</th>
      <td className="px-3 py-2 text-right">{item.kg > 0 ? formatKg(item.kg) : `${formatNumber(item.packs)} packs`}</td>
      <td className="px-3 py-2">
        {item.kg > 0 && <OutcomeBar width="w-full" values={{ approved: item.approvedKg, pending: item.pendingKg, cancelled: item.cancelledKg, returned: item.returnedKg }} />}
      </td>
      <td className="px-3 py-2 text-right">{cell(item.approvedKg, item.kg)}</td>
      <td className="px-3 py-2 text-right">{cell(item.pendingKg, item.kg)}</td>
      <td className="px-3 py-2 text-right">{cell(item.cancelledKg, item.kg)}</td>
      <td className="px-3 py-2 text-right">{cell(item.returnedKg, item.kg)}</td>
      <td className="px-3 py-2 text-right"><Flagged value={formatPct(item.lossRate)} flagged={item.flagged} /></td>
    </tr>
  );
  return (
    <div className="overflow-x-auto">
      <table aria-label={`${label} products by outcome`} className="w-full min-w-[720px] border-collapse rounded-xl bg-white text-[12px] tabular-nums">
        <thead>
          <tr className="border-b border-black/[0.08] text-[8px] uppercase tracking-[0.22em] text-black/55">
            <th scope="col" className="px-3 pb-2 pt-2.5 text-left font-medium">Product</th>
            <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">Ordered</th>
            <th scope="col" className="w-[26%] px-3 pb-2 pt-2.5 text-left font-medium">Outcome split</th>
            <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">Approved</th>
            <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">Pending</th>
            <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">Cancelled</th>
            <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">RTO</th>
            <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">Loss</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((item) => row(item, false))}
          {row(table.total, true)}
        </tbody>
      </table>
    </div>
  );
}

function SourceDetail({ row }: { row: SourceRow }) {
  const { source } = row;
  return (
    <div className="flex flex-col gap-3 px-3.5 pb-4 pt-3.5">
      <div className="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-2 rounded-xl bg-white px-3.5 py-3 text-[12px] tabular-nums">
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/60">Delivery economics</p>
          <p className="flex justify-between"><span className="text-black/60">Delivery charged</span><span>{formatTaka(source.delivery_charged)}</span></p>
          <p className="flex justify-between"><span className="text-black/60">Courier fees</span><span>{formatTaka(source.courier_fees_recorded)}</span></p>
          <p className="flex justify-between border-t border-black/[0.08] pt-2 font-medium">
            <span>Net</span>
            <span className={source.net_delivery_position < 0 ? "text-[#B4473A]" : ""}>{signedTaka(source.net_delivery_position)}</span>
          </p>
        </div>
        {source.landing_pages.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-xl bg-white px-3.5 py-3 text-[12px] tabular-nums">
            <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/60">Landing pages</p>
            {source.landing_pages.map((page) => (
              <p key={page.path || "other"} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5">
                <span className="truncate font-mono text-[11px]">{page.label}</span>
                <span>{formatNumber(page.intake_count)} orders · {formatTaka(page.order_value)}</span>
                <span className="text-black/45">{formatPct(rate(page.approved_count, page.intake_count))} approved</span>
              </p>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl bg-white px-3.5 py-3 text-[12px] tabular-nums">
            <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/60">Order outcomes</p>
            <p className="flex justify-between"><span className="text-black/60">Approved</span><span>{formatNumber(source.approved_count)}</span></p>
            <p className="flex justify-between"><span className="text-black/60">Pending</span><span>{formatNumber(source.pending_count)}</span></p>
            <p className="flex justify-between"><span className="text-black/60">Cancelled</span><span>{formatNumber(source.cancelled_count)}</span></p>
            <p className="flex justify-between"><span className="text-black/60">RTO</span><span>{formatNumber(source.returned_count)}</span></p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Products by outcome · {row.label}</p>
        <p className="text-[10px] text-black/45">kg · Loss = cancelled + RTO kg ÷ ordered kg · red = 5+ pts above this source</p>
      </div>
      <ProductOutcomeTable label={row.label} source={source} />
    </div>
  );
}

export function SourcePerformanceTable({ report }: { report: BusinessReportResponse }) {
  const rows = useMemo(() => buildSourceRows(report.sources, report.summary), [report.sources, report.summary]);
  const [sort, setSort] = useState<{ key: SourceSortKey; dir: SortDir }>({ key: "value", dir: -1 });
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const sorted = useMemo(() => sortSourceRows(rows, sort.key, sort.dir), [rows, sort]);
  const allOpen = rows.length > 0 && rows.every((row) => open.has(row.key));
  const { summary } = report;

  const toggle = (key: string) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const onSort = (key: SourceSortKey) => setSort((current) => (
    current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: key === "label" ? 1 : -1 }
  ));

  return (
    <section aria-labelledby="source-performance-heading" className="flex flex-col gap-3 rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 id="source-performance-heading" className="font-sf-display text-[15px] font-semibold text-black">Source performance</h2>
        <div className="h-3.5 w-px bg-black/10" />
        <span className="text-[13px] tabular-nums text-black/60">{formatNumber(rows.length)} sources</span>
        <span className="ml-auto hidden text-[11px] text-black/45 sm:inline">Click a column to sort · open a row for its product breakdown</span>
        <button
          type="button"
          onClick={() => setOpen(allOpen ? new Set() : new Set(rows.map((row) => row.key)))}
          className="h-8 rounded-full bg-black/[0.05] px-3 text-[12px] text-black transition-colors hover:bg-black/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <div className="-mx-1 overflow-x-auto px-1">
        <table aria-labelledby="source-performance-heading" className="w-full min-w-[900px] border-collapse text-[12px] tabular-nums">
          <thead>
            <tr className="border-b border-black/[0.09]">
              {COLUMNS.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  aria-sort={column.key && sort.key === column.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                  className={`whitespace-nowrap px-2.5 pb-2.5 text-[8px] font-medium uppercase tracking-[0.22em] text-black/60 ${column.align === "right" ? "text-right" : "text-left"}`}
                >
                  {column.key ? (
                    <button type="button" onClick={() => onSort(column.key as SourceSortKey)} className={`uppercase tracking-[0.22em] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 ${sort.key === column.key ? "text-black" : ""}`}>
                      {column.label}{sort.key === column.key ? (sort.dir === 1 ? " ▴" : " ▾") : ""}
                    </button>
                  ) : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isOpen = open.has(row.key);
              const detailId = `business-report-source-detail-${row.key}`;
              return (
                <Fragment key={row.key}>
                  <tr data-testid={`business-report-source-${row.key}`} className="border-b border-black/[0.09] transition-colors hover:bg-black/[0.03]">
                    <td className="px-2.5 py-3">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={detailId}
                        aria-label={`${isOpen ? "Hide" : "Show"} products for ${row.label}`}
                        onClick={() => toggle(row.key)}
                        className="flex items-center gap-2 text-[13px] font-semibold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
                      >
                        <CaretRight weight="light" size={14} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        {row.label}
                      </button>
                    </td>
                    <td className="px-2.5 py-3 text-right">{formatNumber(row.orders)}</td>
                    <td className="px-2.5 py-3 text-right">{formatTaka(row.value)}</td>
                    <td className="px-2.5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-[70px] overflow-hidden rounded-full bg-black/[0.08]"><div className="h-full rounded-full bg-black" style={{ width: `${row.share}%` }} /></div>
                        <span className="w-7 text-black/60">{Math.round(row.share)}%</span>
                      </div>
                    </td>
                    <td className="px-2.5 py-3"><OutcomeBar values={row.mix} /></td>
                    <td className="px-2.5 py-3 text-right"><Flagged value={formatPct(row.approvalRate)} flagged={row.flags.approval} /></td>
                    <td className="px-2.5 py-3 text-right"><Flagged value={formatPct(row.lossRate)} flagged={row.flags.loss} /></td>
                    <td className="px-2.5 py-3 text-right">{formatTaka(row.aov)}</td>
                    <td className="px-2.5 py-3 text-right">{formatKg(row.kg)}</td>
                    <td className={`px-2.5 py-3 text-right ${row.netPerOrder < 0 ? "text-[#B4473A]" : ""}`}>{signedTaka(row.netPerOrder)}</td>
                  </tr>
                  {isOpen && (
                    <tr id={detailId} className="bg-black/[0.03]">
                      <td colSpan={COLUMNS.length} className="p-0"><SourceDetail row={row} /></td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-black/60">
        {OUTCOME_KEYS.map((key) => (
          <span key={key} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ background: OUTCOME_COLORS[key] }} />{OUTCOME_LABELS[key]}</span>
        ))}
        <span><span className="font-medium text-[#B4473A]">Red</span> = more than 3 pts worse than the all-source average</span>
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-[10px] text-black/45">
        <span>Loss = cancelled + RTO, by value · AOV = order value ÷ orders</span>
        <span>
          Courier fees recorded on {formatNumber(summary.courier_fee_order_count)} of {formatNumber(summary.intake_count)} orders · weight on {formatNumber(summary.weight_order_count)} of {formatNumber(summary.intake_count)}
        </span>
      </div>
    </section>
  );
}
```

Check: in the sort test, the "Loss" header button's accessible name is "Loss" (or "Loss ▾" once sorted), which matches `/^Loss/`. The sources `Share`/`Outcome mix` columns are intentionally not sortable.

In `src/pages/BusinessReport.tsx`, replace the whole Source performance `motion.section` with `<SourcePerformanceTable report={data} />`, then delete `SourceCard`, `DetailGroup`, `LandingPageList`, `withKg`, `formatPercent` and any imports that become unused (`Chip`, `CaretDown`, `CaretRight`, `AnimatePresence`, `useState` if unused).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/test/businessReportPage.test.tsx`
Expected: all tests PASS (Tasks 5–7 tests plus the retained loading, all-time, empty-range and retry tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/business-report/SourcePerformanceTable.tsx src/pages/BusinessReport.tsx src/test/businessReportPage.test.tsx
git commit -m "feat: replace source cards with a sortable source table and per-source product outcomes"
```

---

### Task 8: Full verification and browser QA

**Files:** none new (fix-ups only, if checks fail)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all test files PASS, 0 failures.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors in any file touched by this plan.

- [ ] **Step 3: Production build and bundle placement**

Run: `npm run build`
Expected: build succeeds. Then run `ls -la dist/assets | grep -i -E "BusinessReport|echarts"` and confirm the ECharts code sits in the lazily loaded BusinessReport chunk (or its own async chunk), not the main entry chunk. Record the chunk size in the commit message.

- [ ] **Step 4: Browser QA** (invoke the `qa` skill, or `browse`)

With `npm run dev`, sign in as the admin and open `/reports/business`, then check:
1. Today (default, single day): summary tiles render, no "vs previous period" text if yesterday had no orders, Intake rhythm shows 24 columns, Best day panel is absent.
2. Choose a 28-day range: Best day appears with one highlighted bar; deltas appear on tiles.
3. Sankey labels do not overlap at 1280px width; donut shows at most 5 slices.
4. Source table: sort by Loss, expand Website (landing pages + product table), Expand all/Collapse all.
5. At 390px width: the page does not scroll sideways; the source table and product tables scroll inside their containers.
6. "All time": no deltas, charts still render.
Take one screenshot per state and compare against `progress/business-report-redesign/mockup.html`.

- [ ] **Step 5: Commit any QA fixes**

```bash
git add -A src server
git commit -m "fix: business report QA adjustments"
```

(Skip if nothing changed.)

---

## Self-review notes

- Spec coverage: summary sparklines + deltas (Tasks 1, 2, 5); grid bar (1, 4, 6); sankey (4, 6); donut (3, 4, 6); gauge (4, 6); delivery economics kept (6); Peak Week (1, 4, 6); product weight rings (4, 6); source table with rates, flags, sort, expand, landing pages, products by outcome in kg with loss flags, Expand all, merged coverage footer, duplicate weight card removed (3, 7).
- Types used across tasks: `SeriesBucket`, `BusinessReportResponse` (Task 3) → Tasks 4–7; `MixSlice`, `SourceRow`, `SourceSortKey`, `SortDir`, `ProductOutcomeRow` (Task 3) → Tasks 4, 7; `OUTCOME_*` (Task 4) → Task 7; `EChart` props (Task 4) → Tasks 5, 6.
