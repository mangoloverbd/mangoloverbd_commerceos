# Business Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Mango Lover BD admins an accurate, card-led Business Report for regular-order intake, source performance, landing pages, and delivery economics over Dhaka-local date ranges.

**Architecture:** A new pure `server/businessReport.js` module owns date-request validation, source and outcome normalization, aggregation, landing-page grouping, fee coverage, and chart series construction. A thin, admin-only Express route reads paginated workspace-scoped `orders` rows and returns that aggregation. A protected React page uses TanStack Query and the Staff Performance visual language to render metric trays, a finance band, a compact series, and expandable source cards.

**Tech Stack:** Node 20 ESM, Express 5, Supabase service-role reads, React 18, React Router v6, TanStack Query v5, Tailwind CSS, Framer Motion, Phosphor Icons, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-19-business-report-design.md`

## Global Constraints

- Do not create or apply a migration. The live `orders` table already has `org_id`, `created_at`, `source`, `landing_page_path`, `status`, `price`, `delivery_rate`, `courier_fee`, `courier_status`, and `return_status`; its `(org_id, created_at desc)` index supports the report filter.
- Report only regular `orders`. Never read, aggregate, query, or render `social_inbox_orders` in this feature.
- Every report query resolves the fixed Mango Lover BD workspace through `getUserOrg(supabase, user.id)` and includes `.eq("org_id", orgId)`. The client never supplies an organisation identifier.
- The API route must start with `getToken(req)` → `getUser(token)` → a 401 guard, then reject every non-admin with 403. `AdminRoute` is a UI convenience; the server guard is authoritative.
- Date bounds are an all-or-nothing inclusive calendar pair in `Asia/Dhaka`: `created_at >=` the local start midnight and `<` the next local midnight after the end date. No `23:59:59` sentinel.
- The selected period is an intake cohort by `orders.created_at`; approved, cancelled, returned/RTO, and pending reflect each selected order’s current state.
- Classify outcomes exclusively, in this precedence: cancelled/rejected, returned/RTO, approved/progressing, then pending. A courier cancellation/rejection is cancelled; a terminal return is returned/RTO; pending return requests are not RTO.
- Delivery charged sums `delivery_rate` only for approved/progressing orders. Courier fees sum every selected order with a recorded `courier_fee`, including returned orders. Label the difference **Net delivery position**, never collected cash, revenue, or profit.
- Show `courier_fee_order_count` out of selected intake everywhere courier fees or net delivery position appear. A fee of numeric zero counts as recorded; null, undefined, blank, and non-numeric values do not.
- Normalize regular order sources into Website, Facebook, Instagram, WhatsApp, Phone, Telesales, or Manual / Other. Website includes legacy `custom_store`, `custom_website`, `custom_website_tracker`, `storefront`, `storefront_review`, `webhook`, and `website` values.
- Group only valid `/step/...` paths under Website; blank, malformed, or non-Website landing paths must be **Other website** rather than a separate source.
- Use `apiFetch()` for the page request. Use React Router v6, Phosphor icons with `weight="light"`, `৳` for money, BoardUI `Chip`s, Framer Motion, and `useReducedMotion()`.
- Preserve the Staff Performance warm surface, controls, loading/retry/empty states, compact cards, inline disclosure semantics, keyboard focus styling, and mobile stacking. Do not add dependencies.
- Implement test-first. Do not use `any`; test source and UI contracts by their exact route, labels, ARIA names, and response fields.

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `server/businessReport.js` | Create | Pure report request validation, source/outcome/landing-page normalization, metrics aggregation, fee coverage, sorting, and Dhaka series creation. |
| `server/index.js` | Modify | Import the pure module, generalize the existing report keyset-paging helper, and expose the admin-only `/api/reports/business` route. |
| `src/pages/BusinessReport.tsx` | Create | Typed report query, Today default, finance band, accessible intake chart, animated summary trays, expandable source cards, and page states. |
| `src/App.tsx` | Modify | Lazy-load and admin-protect `/reports/business`. |
| `src/components/AppSidebar.tsx` | Modify | Add an admin-only Business Report item in Reports. |
| `src/components/DashboardLayout.tsx` | Modify | Add the Business Report breadcrumb label. |
| `src/test/businessReport.test.ts` | Create | Pure request, status/source/path, metric, sorting, fee, and series coverage. |
| `src/test/businessReportRouteWiring.test.ts` | Create | Endpoint auth, role, workspace, field-selection, pagination, and regular-order-only wiring coverage. |
| `src/test/businessReportPage.test.tsx` | Create | Today/default request, all-time request, finance labels, fee coverage, chart, source disclosure, loading, empty, error, and retry coverage. |
| `src/test/businessReportRouting.test.ts` | Create | Admin route and Reports navigation wiring coverage. |
| `src/test/staffReportRouteWiring.test.ts` | Modify | Keep the existing Staff Report paging test accurate after renaming the shared helper. |
| `src/test/dashboardLayoutBreadcrumb.test.ts` | Modify | Treat `/reports/business` as an authenticated route with a breadcrumb mapping. |

## Response Contract

The pure module and the React page share this JSON contract. Keep field names in snake case to match existing report responses.

```ts
type OutcomeCounts = {
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
};

type BusinessReportResponse = {
  range: { from: string | null; to: string | null };
  summary: OutcomeCounts;
  series: {
    granularity: "hour" | "day";
    label: "Intake by hour" | "Intake by day" | "Recent intake activity";
    buckets: Array<{
      key: string;
      label: string;
      intake_count: number;
      order_value: number;
    }>;
  };
  sources: Array<OutcomeCounts & {
    source: "website" | "facebook" | "instagram" | "whatsapp" | "phone" | "telesales" | "manual_other";
    label: string;
    landing_pages: Array<{
      path: string | null;
      label: string;
      intake_count: number;
      order_value: number;
      approved_count: number;
      cancelled_count: number;
      returned_count: number;
      pending_count: number;
    }>;
  }>;
};
```

### Task 1: Add the deterministic Business Report data module test-first

**Files:**
- Create: `server/businessReport.js`
- Create: `src/test/businessReport.test.ts`

**Interfaces:**
- Consumes `toDhakaInterval(from, to)` from `server/reports.js`; do not duplicate the date parser or its +06:00 boundary calculation.
- Produces `resolveBusinessReportRequest({ from, to })` with `{ range, since, until }`.
- Produces `normalizeBusinessReportSource(value)`, `normalizeBusinessReportLandingPage(value)`, and `classifyBusinessReportOutcome(order)` for focused tests.
- Produces `buildBusinessReport(orders, request)` with the response contract above.
- Receives only the selected `orders` fields: `id`, `created_at`, `source`, `landing_page_path`, `status`, `price`, `delivery_rate`, `courier_fee`, `courier_status`, and `return_status`.

- [ ] **Step 1: Write the failing pure-module tests**

Create `src/test/businessReport.test.ts`. Use a fixed Dhaka day and a compact row factory so all calculations are explicit:

```ts
import { describe, expect, it } from "vitest";
import {
  buildBusinessReport,
  classifyBusinessReportOutcome,
  normalizeBusinessReportLandingPage,
  normalizeBusinessReportSource,
  resolveBusinessReportRequest,
} from "../../server/businessReport.js";

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-default",
    created_at: "2026-09-18T03:00:00.000Z", // 09:00 Asia/Dhaka
    source: "website",
    landing_page_path: null,
    status: "pending",
    price: 0,
    delivery_rate: 0,
    courier_fee: null,
    courier_status: null,
    return_status: null,
    ...overrides,
  };
}

const dayRequest = () => resolveBusinessReportRequest({
  from: "2026-09-18",
  to: "2026-09-18",
});
```

Add these request tests exactly:

```ts
it("requires both valid ordered date bounds and returns exact Dhaka instants", () => {
  expect(dayRequest()).toEqual({
    range: { from: "2026-09-18", to: "2026-09-18" },
    since: "2026-09-17T18:00:00.000Z",
    until: "2026-09-18T18:00:00.000Z",
  });
  expect(resolveBusinessReportRequest({})).toEqual({
    range: { from: null, to: null }, since: null, until: null,
  });
  expect(() => resolveBusinessReportRequest({ from: "2026-09-18" })).toThrow("Provide both from and to dates");
  expect(() => resolveBusinessReportRequest({ from: "2026-02-30", to: "2026-03-01" })).toThrow("Invalid report date");
  expect(() => resolveBusinessReportRequest({ from: "2026-09-19", to: "2026-09-18" })).toThrow("Report start date must not be after the end date");
});
```

Add a table-driven source, path, and outcome matrix. It must prove source aliases and status separator/case normalization while preserving exclusive outcome precedence:

```ts
it.each([
  ["storefront", "website"], ["CUSTOM_WEBSITE_TRACKER", "website"],
  ["facebook", "facebook"], ["unknown-source", "manual_other"], [null, "manual_other"],
])("normalizes source %o to %s", (source, expected) => {
  expect(normalizeBusinessReportSource(source)).toBe(expected);
});

it("accepts only canonical landing-page paths", () => {
  expect(normalizeBusinessReportLandingPage(" /step/katimon-mango/?utm=meta ")).toBe("/step/katimon-mango");
  expect(normalizeBusinessReportLandingPage("/products/mango")).toBeNull();
  expect(normalizeBusinessReportLandingPage("/step/not valid")).toBeNull();
});

it.each([
  [order({ status: "PRINT" }), "approved"],
  [order({ status: "partial-delivered" }), "approved"],
  [order({ status: "pending", courier_status: "Delivered" }), "pending"],
  [order({ status: "on hold" }), "pending"],
  [order({ status: "processing", return_status: "completed" }), "returned"],
  [order({ status: "approved", courier_status: "Return To Hub" }), "returned"],
  [order({ status: "processing", courier_status: "return_requested" }), "approved"],
  [order({ status: "cancelled", return_status: "completed" }), "cancelled"],
  [order({ status: "processing", courier_status: "rejected" }), "cancelled"],
  [order({ status: "processing", courier_status: "cancelled_approval_pending" }), "approved"],
])("classifies %o as %s", (row, expected) => {
  expect(classifyBusinessReportOutcome(row)).toBe(expected);
});
```

Add a single mixed-cohort fixture and assert its complete summary, order-value sorting, Website landing-page grouping, numeric-zero fee coverage, and hourly output:

```ts
it("aggregates current outcomes, fee coverage, sources, landing pages, and hourly intake", () => {
  const report = buildBusinessReport([
    order({ id: "web-approved", source: "storefront", landing_page_path: "/step/katimon-mango", status: "processing", price: "1000", delivery_rate: "120", courier_fee: "80" }),
    order({ id: "web-cancelled", created_at: "2026-09-18T04:00:00.000Z", source: "website", landing_page_path: "invalid", status: "cancelled", price: 400, delivery_rate: 60 }),
    order({ id: "facebook-rto", created_at: "2026-09-18T05:00:00.000Z", source: "facebook", status: "confirmed", courier_status: "Return To Hub", price: 700, delivery_rate: 60, courier_fee: 50 }),
    order({ id: "other-pending", created_at: "2026-09-18T06:00:00.000Z", source: "mystery", status: "pending", price: 300, delivery_rate: 60, courier_fee: 0 }),
    order({ id: "outside-range", created_at: "2026-09-17T17:59:59.999Z", source: "phone", status: "confirmed", price: 999 }),
  ], dayRequest());

  expect(report.summary).toEqual({
    intake_count: 4, order_value: 2400,
    approved_count: 1, approved_value: 1000,
    cancelled_count: 1, cancelled_value: 400,
    returned_count: 1, returned_value: 700,
    pending_count: 1, pending_value: 300,
    delivery_charged: 120, courier_fees_recorded: 130,
    net_delivery_position: -10, courier_fee_order_count: 3,
  });
  expect(report.sources.map((source) => source.label)).toEqual(["Website", "Facebook", "Manual / Other"]);
  expect(report.sources[0]).toMatchObject({
    source: "website", intake_count: 2, order_value: 1400,
    approved_count: 1, cancelled_count: 1, returned_count: 0, pending_count: 0,
    delivery_charged: 120, courier_fees_recorded: 80,
    net_delivery_position: 40, courier_fee_order_count: 1,
  });
  expect(report.sources[0].landing_pages).toEqual([
    { path: "/step/katimon-mango", label: "/step/katimon-mango", intake_count: 1, order_value: 1000, approved_count: 1, cancelled_count: 0, returned_count: 0, pending_count: 0 },
    { path: null, label: "Other website", intake_count: 1, order_value: 400, approved_count: 0, cancelled_count: 1, returned_count: 0, pending_count: 0 },
  ]);
  expect(report.series).toMatchObject({ granularity: "hour", label: "Intake by hour" });
  expect(report.series.buckets).toHaveLength(24);
  expect(report.series.buckets.filter((bucket) => bucket.intake_count > 0).map((bucket) => [bucket.label, bucket.intake_count]))
    .toEqual([["9a", 1], ["10a", 1], ["11a", 1], ["12p", 1]]);
});
```

Add two final series tests: a bounded 18–20 September range must return three day buckets with a zero-valued middle day, and an All Time report with 31 distinct day keys must omit only the oldest key, return the newest 30 in chronological ascending order, and use `label: "Recent intake activity"`.

- [ ] **Step 2: Run the new test file and verify it is red**

Run:

```bash
npm test -- --run src/test/businessReport.test.ts
```

Expected: Vitest fails module resolution because `server/businessReport.js` does not exist.

- [ ] **Step 3: Implement the pure report contract**

Create `server/businessReport.js`. Import the existing tested interval helper rather than hand-rolling timezone math:

```js
import { toDhakaInterval } from "./reports.js";

const SOURCE_OPTIONS = [
  ["website", "Website"], ["facebook", "Facebook"], ["instagram", "Instagram"],
  ["whatsapp", "WhatsApp"], ["phone", "Phone"], ["telesales", "Telesales"],
  ["manual_other", "Manual / Other"],
];
const SOURCE_LABELS = new Map(SOURCE_OPTIONS);
const WEBSITE_ALIASES = new Set(["custom_store", "custom_website", "custom_website_tracker", "storefront", "storefront_review", "webhook", "website"]);
const CANCELLED_STATES = new Set(["cancelled", "canceled", "rejected"]);
const APPROVED_STATES = new Set(["approved", "confirmed", "print", "processing", "fulfilled", "delivered", "partial_delivered"]);
const LANDING_PAGE_PATH_RE = /^\/step\/[a-z0-9]+(?:-[a-z0-9]+)*$/i;
```

Implement the following exact rules:

1. Create a local `invalidBusinessReportRequest(message)` factory that returns an `Error` with `statusCode = 400`, matching the error contract consumed by `sendError`. `resolveBusinessReportRequest` uses the same all-or-nothing test as `resolveStaffReportRequest`. It returns null range and null instants when both values are omitted; otherwise it delegates valid values to `toDhakaInterval` and rejects `from > to` through that factory with `Report start date must not be after the end date`.
2. `normalizeBusinessReportSource` lowercases and trims its input, maps `WEBSITE_ALIASES` to `website`, accepts only `SOURCE_LABELS` keys, and returns `manual_other` for everything else.
3. `normalizeBusinessReportLandingPage` trims, removes query/hash and trailing slashes, then returns the valid canonical path or `null`. It must never turn an arbitrary path into a named landing page.
4. `classifyBusinessReportOutcome` normalizes `status`, `courier_status`, and `return_status` by lowercasing and replacing non-alphanumerics with underscores. Return `cancelled` when either business or courier state is exactly `cancelled`, `canceled`, or `rejected`; then return `returned` when business state is `returned`, return state is `returned`/`completed`, or courier state contains `return` **and does not** contain `request`, `pending`, `approval`, or `review`; then return `approved` only when the business state is in `APPROVED_STATES`; otherwise return `pending`. This keeps current business state authoritative, handles terminal courier returns, and prevents an in-progress return request from becoming an RTO outcome.
5. Keep `toNumber` defensive: finite numeric values become numbers; malformed data becomes zero. Keep `hasRecordedCourierFee` separate so blank/non-numeric values do not inflate coverage, but numeric zero does.
6. Start every top-level or source metric object with all fourteen `OutcomeCounts` fields set to zero. For every selected order, increment `intake_count` and `order_value`, then exactly one outcome count/value pair. Add `delivery_rate` only for `approved`; add a recorded `courier_fee` and increment coverage for every selected order that has one. Set `net_delivery_position = delivery_charged - courier_fees_recorded` only after each aggregate is complete.
7. Build Website landing-page rows from the same selected Website order. Use a valid normalized path as key/label; otherwise use `path: null` and `label: "Other website"`. Landing-page rows carry intake, value, and the four exclusive outcome counts only.
8. Sort source cards by `order_value` descending, then `intake_count` descending, then `label.localeCompare`. Sort Website landing pages by the same criteria. Return `landing_pages: []` for all non-Website sources.
9. Convert each valid `created_at` to a Dhaka day/hour with `Intl.DateTimeFormat(..., { timeZone: "Asia/Dhaka" }).formatToParts`. For a single selected calendar day, return exactly 24 `hour` buckets from `12a` through `11p`. For a bounded multi-day range, return every calendar date from `from` through `to`, including zero buckets. For All Time, choose the latest 30 distinct data-bearing Dhaka dates, then emit those selected dates chronologically ascending for a left-to-right time series, with label `Recent intake activity`.
10. Filter rows against `since`/`until` inside the pure builder as a defensive boundary check. The route will query the same interval, but the pure module must not aggregate an out-of-range test or future caller row.

- [ ] **Step 4: Run the pure suite until green**

Run:

```bash
npm test -- --run src/test/businessReport.test.ts src/test/staffReport.test.ts
```

Expected: all Business Report calculations pass and the existing Staff Report still validates its shared Dhaka interval helper.

- [ ] **Step 5: Commit the deterministic report unit**

```bash
git add server/businessReport.js src/test/businessReport.test.ts
git commit -m "feat: add business report aggregation"
```

### Task 2: Add the admin-only, paginated report endpoint test-first

**Files:**
- Modify: `server/index.js`
- Modify: `src/test/staffReportRouteWiring.test.ts`
- Create: `src/test/businessReportRouteWiring.test.ts`

**Interfaces:**
- Consumes `buildBusinessReport(orders, request)` and `resolveBusinessReportRequest({ from, to })` from `server/businessReport.js`.
- Consumes the existing `getToken`, `getUser`, `getUserOrg`, `sendError`, `chunkIds`, and Supabase service-role client conventions from `server/index.js`.
- Produces `GET /api/reports/business?from=YYYY-MM-DD&to=YYYY-MM-DD` with the response contract above.
- Produces a generic `fetchReportPages(createQuery, { pageSize?: number })` shared by the Staff and Business routes.

- [ ] **Step 1: Add route-wiring tests that fail against the current server**

Create `src/test/businessReportRouteWiring.test.ts` using the same file-source seam as `staffReportRouteWiring.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
function sectionBetween(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("GET /api/reports/business", () => {
  const route = () => sectionBetween('app.get("/api/reports/business"', "// ─── Analytics");

  it("authenticates, resolves the workspace, and rejects non-admin callers", () => {
    const section = route();
    expect(section).toContain("const token = getToken(req)");
    expect(section).toContain("getUser(token)");
    expect(section).toMatch(/status\(401\)/);
    expect(section).toContain("getUserOrg(supabase, user.id)");
    expect(section).toContain('role !== "admin"');
    expect(section).toMatch(/status\(403\)/);
  });

  it("selects only required workspace-scoped regular-order fields through keyset pages", () => {
    const section = route();
    expect(section).toContain("fetchReportPages");
    expect(section).toMatch(/\.from\("orders"\)[\s\S]*?\.eq\("org_id", orgId\)/);
    expect(section).toContain("landing_page_path");
    expect(section).toContain("delivery_rate");
    expect(section).toContain("courier_fee");
    expect(section).toContain("return_status");
    expect(section).toContain("request.since");
    expect(section).toContain("request.until");
    expect(section).not.toContain('from("social_inbox_orders")');
  });

  it("delegates dates and aggregation to the pure business report module", () => {
    const section = route();
    expect(source).toContain('from "./businessReport.js"');
    expect(section).toContain("resolveBusinessReportRequest");
    expect(section).toContain("from: req.query.from");
    expect(section).toContain("to: req.query.to");
    expect(section).toContain("buildBusinessReport(orders, request)");
  });
});

describe("report pagination helper", () => {
  it("uses stable id keyset pagination rather than an offset range", () => {
    const helper = sectionBetween("async function fetchReportPages", 'app.get("/api/reports/staff"');
    expect(helper).toContain('.order("id", { ascending: true })');
    expect(helper).toContain("let lastId = null");
    expect(helper).toContain('.gt("id", lastId)');
    expect(helper).toContain(".limit(pageSize)");
    expect(helper).not.toContain(".range(");
  });
});
```

Update `src/test/staffReportRouteWiring.test.ts` to use the generic helper name. Keep its Staff route slice ending at `// ─── Business Report` so assertions cannot accidentally pass by inspecting the new route.

- [ ] **Step 2: Run the wiring tests and verify they are red**

Run:

```bash
npm test -- --run src/test/businessReportRouteWiring.test.ts src/test/staffReportRouteWiring.test.ts
```

Expected: Business Report route-marker assertions fail and the Staff wiring test fails until its helper-name expectation is updated alongside the server.

- [ ] **Step 3: Implement shared keyset paging and the route**

At the imports in `server/index.js`, add:

```js
import { buildBusinessReport, resolveBusinessReportRequest } from "./businessReport.js";
```

Rename `fetchStaffReportPages` to `fetchReportPages` and update every existing Staff Report call in the same edit. Preserve its exact keyset implementation:

```js
async function fetchReportPages(createQuery, { pageSize = 500 } = {}) {
  const allRows = [];
  let lastId = null;
  for (;;) {
    let query = createQuery().order("id", { ascending: true }).limit(pageSize);
    if (lastId) query = query.gt("id", lastId);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    allRows.push(...rows);
    if (rows.length < pageSize) break;
    lastId = rows[rows.length - 1]?.id;
    if (!lastId) break;
  }
  return allRows;
}
```

Immediately after the Staff Report route and before `// ─── Analytics`, add the report section and endpoint:

```js
// ─── Business Report ─────────────────────────────────────────────────────────

app.get("/api/reports/business", async (req, res) => {
  try {
    const token = getToken(req);
    const { user } = await getUser(token);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const supabase = getServiceSupabase();
    const { orgId, role } = await getUserOrg(supabase, user.id);
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });

    const request = resolveBusinessReportRequest({
      from: req.query.from,
      to: req.query.to,
    });
    const fields = "id, created_at, source, landing_page_path, status, price, delivery_rate, courier_fee, courier_status, return_status";
    const orders = await fetchReportPages(() => {
      let query = supabase
        .from("orders")
        .select(fields)
        .eq("org_id", orgId);
      if (request.since) query = query.gte("created_at", request.since);
      if (request.until) query = query.lt("created_at", request.until);
      return query;
    });

    return res.json(buildBusinessReport(orders, request));
  } catch (err) {
    return sendError(res, err);
  }
});
```

Do not add a source filter in SQL. The pure source normalizer must retain historical unknowns under Manual / Other. Do not use `select("*")`, customer PII fields, offset pagination, a user-supplied `org_id`, a Social Inbox query, or a database mutation.

- [ ] **Step 4: Run route, pure, and existing Staff Report regression tests**

Run:

```bash
npm test -- --run src/test/businessReport.test.ts src/test/businessReportRouteWiring.test.ts src/test/staffReport.test.ts src/test/staffReportRouteWiring.test.ts
```

Expected: all report modules pass, the new endpoint has auth/admin/org guards, and the existing Staff Report remains wired to the generic keyset helper.

- [ ] **Step 5: Commit the server route**

```bash
git add server/index.js src/test/businessReportRouteWiring.test.ts src/test/staffReportRouteWiring.test.ts
git commit -m "feat: add business report API"
```

### Task 3: Build the balanced-hybrid Business Report page test-first

**Files:**
- Create: `src/pages/BusinessReport.tsx`
- Create: `src/test/businessReportPage.test.tsx`

**Interfaces:**
- Consumes `GET /api/reports/business` through `apiFetch()` only.
- Consumes the response contract in this plan and a `DateRangePicker` value of `DateRange | null`.
- Produces summary test IDs `business-report-summary-intake`, `business-report-summary-order-value`, `business-report-summary-approved`, and `business-report-summary-cancelled`.
- Produces `business-report-source-<source>` cards and native disclosure names `Show details for <label>` / `Hide details for <label>`.

- [ ] **Step 1: Write the page tests before creating the page**

Create `src/test/businessReportPage.test.tsx`. Mock the authenticated fetch and date picker as the Staff Performance suite does:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/components/DateRangePicker", () => ({
  DateRangePicker: ({ onChange }: { onChange: (range: { from: Date; to: Date } | null) => void }) => (
    <button type="button" onClick={() => onChange(null)}>All time</button>
  ),
}));

import { apiFetch } from "@/lib/api";
import BusinessReport from "@/pages/BusinessReport";
```

Use a `reportResponse()` fixture with this non-empty summary and two sources:

```ts
summary: {
  intake_count: 4, order_value: 2400,
  approved_count: 1, approved_value: 1000,
  cancelled_count: 1, cancelled_value: 400,
  returned_count: 1, returned_value: 700,
  pending_count: 1, pending_value: 300,
  delivery_charged: 120, courier_fees_recorded: 130,
  net_delivery_position: -10, courier_fee_order_count: 3,
}
```

Give Website the four outcome counts, `landing_pages` for `/step/katimon-mango` and Other website, and Manual / Other an empty `landing_pages` array. Give the hourly series a visible `9a` bucket with intake 2 and a zero `10a` bucket.

Add these test cases:

1. While `apiFetch` remains pending, render `Loading business report`.
2. Freeze `Date.now()` to a moment on 2026-09-20 in Dhaka, then assert the first request is exactly `/api/reports/business?from=2026-09-20&to=2026-09-20`.
3. On success, assert the heading, all four summary IDs, `৳2,400`, `Delivery charged`, `Courier fees recorded`, `Net delivery position`, and `Courier fee coverage: 3 of 4 orders` are visible. Assert the chart has accessible name `Intake by hour` and its `9a` bucket announces `9a: 2 orders`.
4. Assert Website’s compact card contains `Intake 2`, `Approved 1`, `Cancelled 1`, `RTO 0`, and `Pending 0`, while the delivery coverage note is visible before expansion. Click `Show details for Website`, then assert `Hide details for Website`, `Landing pages`, `/step/katimon-mango`, `Other website`, and `Fee coverage` are visible.
5. Assert outcome chips use BoardUI semantic surfaces: the Website approved chip has `bg-status-lime-background`, cancellation has `bg-status-rose-background`, RTO has `bg-status-yellow-background`, and intake has `bg-status-blue-background`.
6. Click mocked `All time` and assert the next request is exactly `/api/reports/business` with no date parameters.
7. Return `{ summary: { intake_count: 0, ...zeroMetrics }, sources: [] }` and assert the header remains available while `No regular orders were created in this range.` replaces the finance and source card queue.
8. Reject once, resolve once, click `Try again`, and assert the successful heading returns.

Use `vi.spyOn(Date, "now")` in `beforeEach` and restore all mocks in `afterEach`, so the Today test does not depend on the machine clock. Render with a fresh `QueryClient` configured with `queries.retry: false` and `MemoryRouter`.

- [ ] **Step 2: Run the page suite and verify it is red**

Run:

```bash
npm test -- --run src/test/businessReportPage.test.tsx
```

Expected: module resolution fails because `src/pages/BusinessReport.tsx` does not exist.

- [ ] **Step 3: Implement the page and its accessible card components**

Create `src/pages/BusinessReport.tsx` with page-local response types matching the response contract exactly. Use the Staff Performance imports and patterns:

```tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { DateRange } from "react-day-picker";
import { ArrowsClockwise, CaretDown, CaretRight } from "@phosphor-icons/react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Chip } from "@/components/base/badges/chip";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/ios-spinner";
import { apiFetch } from "@/lib/api";
```

Implement these page rules:

1. Copy the small `dhakaToday`, `formatTaka`, and `formatNumber` helpers from Staff Performance. The initial `DateRange` is `{ from: today, to: today }`, not the current month. Only serialize a date pair when both bounds exist; a null range must request the endpoint without a query string.
2. Use `useQuery({ queryKey: ["business-report", from, to], retry: false, queryFn })`. Build the URL with `URLSearchParams`, call `apiFetch`, parse the body once, and throw `body?.error || "Could not load business report"` for non-OK responses. The refresh icon calls `reportQuery.refetch()` and uses `isFetching` to spin/disable exactly as Staff Performance does.
3. Render full-page loading and retryable error states with `bg-[#FAFAF8]`, a Spinner, `Loading business report`, `Could not load business report`, and `Try again`.
4. In the success state, render a `Business Report` header with supporting copy `Regular-order intake and operating totals, using Asia/Dhaka dates.`, then the picker and an `aria-label="Refresh report"` button. Use `motion.div` page and metric entry states, disabling transforms when `useReducedMotion()` is true.
5. Render four `SnapshotCard` instances in `grid gap-3 sm:grid-cols-2 lg:grid-cols-4`: Intake, Order value, Approved / progressing, and Cancelled. Each uses a `min-h-[92px] rounded-2xl bg-black/[0.04]` tray, an uppercase 8px label, a light tabular numeric value, and the required test IDs. Approved and cancelled descriptions are their percentages of intake, calculated from the aggregate totals rather than averaged source rates.
6. When `summary.intake_count === 0`, retain the header/controls and render only a bordered, centered empty message: `No regular orders were created in this range.` Do not render misleading zero economics or source cards.
7. Otherwise render a responsive finance row using `grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]`. The Delivery economics panel contains Delivery charged, Courier fees recorded, Net delivery position, and exactly `Courier fee coverage: <courier_fee_order_count> of <intake_count> orders`. It must not say collected, revenue, margin, or profit.
8. Implement `IntakeSeries` as a page-local CSS bar chart, not a new chart dependency. Wrap it in a semantic `section aria-label={series.label}`. Use a horizontal scroll container and a 24px-or-wider column per bucket. Scale bar height to the max count, preserve a one-pixel neutral baseline for zero, put each bucket in a list item with `aria-label={`${bucket.label}: ${bucket.intake_count} orders`}`, and show the bucket label below it. The panel heading is supplied by `series.label`, so All Time reads `Recent intake activity` without a separate exception.
9. Implement `SourceCard` with a native full-width button, `aria-expanded`, `aria-controls`, and `Show details for <label>` / `Hide details for <label>` names. Its compact state shows Intake, Order value, Net delivery position, a muted `Courier fee coverage: X of Y orders` line, and chips in this exact order: Intake (blue), Approved (lime), Cancelled (rose), RTO (yellow), Pending (soft). Wrap the expanded area with `AnimatePresence`; use opacity-only changes under reduced motion and a 0.22-second short Y transition otherwise.
10. In expanded detail, use small white `DetailGroup` panels. Every source shows Delivery charged, Courier fees recorded, Net delivery position, and Fee coverage. Only Website receives a second Landing pages panel. Each landing-page row shows label on the left and `<intake_count> orders · <formatted order_value>` on the right, plus an outcome subline only when one of its outcome counts is nonzero.
11. Keep source cards in one vertical `grid grid-cols-1 gap-3` queue at every breakpoint. Set `data-testid={`business-report-source-${source.source}`}` on each card. Do not re-sort data in the page; the API sort is the reporting contract.

- [ ] **Step 4: Run the page suite and inspect focused output**

Run:

```bash
npm test -- --run src/test/businessReportPage.test.tsx
```

Expected: all query, formatting, finance-label, chart accessibility, disclosure, empty, and retry tests pass.

- [ ] **Step 5: Commit the report page**

```bash
git add src/pages/BusinessReport.tsx src/test/businessReportPage.test.tsx
git commit -m "feat: add business report page"
```

### Task 4: Expose the report only to admins through route, navigation, and breadcrumb wiring

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/AppSidebar.tsx`
- Modify: `src/components/DashboardLayout.tsx`
- Modify: `src/test/dashboardLayoutBreadcrumb.test.ts`
- Create: `src/test/businessReportRouting.test.ts`

**Interfaces:**
- Consumes the existing `AdminRoute` component in `src/App.tsx` and `isAdmin` in `AppSidebar.tsx`.
- Produces a lazy `/reports/business` route inside the dashboard layout, an admin-only Reports navigation item, and a `Business Report` breadcrumb.

- [ ] **Step 1: Write the failing route/navigation tests**

Create `src/test/businessReportRouting.test.ts` with source-level assertions matching the existing routing test style:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const sidebarSource = readFileSync(resolve(process.cwd(), "src/components/AppSidebar.tsx"), "utf8");

describe("Business Report navigation", () => {
  it("lazy-loads the route behind AdminRoute", () => {
    expect(appSource).toContain('const BusinessReport = lazy(() => import("./pages/BusinessReport"))');
    expect(appSource).toContain('<Route path="/reports/business" element={<AdminRoute><BusinessReport /></AdminRoute>} />');
  });

  it("places an admin-only Business Report item in Reports", () => {
    expect(sidebarSource).toMatch(/const reports: NavSection = \{[\s\S]*?label: "Reports"/);
    expect(sidebarSource).toContain('id: "business-report"');
    expect(sidebarSource).toContain('title: "Business Report"');
    expect(sidebarSource).toContain('link: "/reports/business"');
    expect(sidebarSource).toContain("disabled: !isAdmin");
  });
});
```

In `src/test/dashboardLayoutBreadcrumb.test.ts`, append `/reports/business` to `protectedRoutes` and assert the layout source contains `'"/reports/business": "Business Report"'`.

- [ ] **Step 2: Run the routing tests and verify they are red**

Run:

```bash
npm test -- --run src/test/businessReportRouting.test.ts src/test/dashboardLayoutBreadcrumb.test.ts
```

Expected: the lazy import, protected route, sidebar item, and breadcrumb mapping are absent.

- [ ] **Step 3: Wire the admin-only UI entry points**

Make only these additions:

```tsx
// src/App.tsx, alongside other lazy report pages
const BusinessReport = lazy(() => import("./pages/BusinessReport"));

// inside the existing dashboard-layout route tree, beside Staff Performance
<Route path="/reports/business" element={<AdminRoute><BusinessReport /></AdminRoute>} />
```

In `src/components/AppSidebar.tsx`, append this route after Staff Performance in the existing `reports.routes` array. Reuse the existing Phosphor import and preserve `weight="light"`:

```tsx
{
  id: "business-report",
  title: "Business Report",
  icon: <ChartLineUp size={15} weight="light" className={iconCls} />,
  link: "/reports/business",
  disabled: !isAdmin,
},
```

In `src/components/DashboardLayout.tsx`, add:

```ts
"/reports/business": "Business Report",
```

The sidebar lock is only discoverability. Do not remove the `AdminRoute` wrapper or make the route visible to team members because a direct URL would otherwise expose the page shell.

- [ ] **Step 4: Run the full focused frontend suite**

Run:

```bash
npm test -- --run src/test/businessReportPage.test.tsx src/test/businessReportRouting.test.ts src/test/dashboardLayoutBreadcrumb.test.ts src/test/staffPerformancePage.test.tsx src/test/staffPerformanceRouting.test.ts
```

Expected: Business Report route and navigation are protected while Staff Performance remains available to authenticated team members.

- [ ] **Step 5: Commit navigation exposure**

```bash
git add src/App.tsx src/components/AppSidebar.tsx src/components/DashboardLayout.tsx src/test/businessReportRouting.test.ts src/test/dashboardLayoutBreadcrumb.test.ts
git commit -m "feat: expose business report"
```

### Task 5: Review, verify, and manually exercise the complete report

**Files:**
- Verify only unless review findings require a precise fix.

**Interfaces:**
- Verifies the pure module, server route, protected page, navigation, and no-migration constraint as one feature.

- [ ] **Step 1: Run all focused report and adjacent-regression tests**

Run:

```bash
npm test -- --run src/test/businessReport.test.ts src/test/businessReportRouteWiring.test.ts src/test/businessReportPage.test.tsx src/test/businessReportRouting.test.ts src/test/staffReport.test.ts src/test/staffReportRouteWiring.test.ts src/test/staffPerformancePage.test.tsx src/test/staffPerformanceRouting.test.ts src/test/dashboardLayoutBreadcrumb.test.ts
```

Expected: every focused test passes, including route guards, workspace guards, legacy-source grouping, outcome precedence, fee coverage, disclosure, and Staff Report pagination regression coverage.

- [ ] **Step 2: Invoke `review` before landing the API change**

Ask the review workflow to inspect the branch diff. Resolve every finding involving endpoint auth, admin enforcement, client-provided organisation input, missing `.eq("org_id", orgId)`, Social Inbox leakage, unsafe date inputs, offset pagination, non-exclusive outcomes, or misleading finance copy. Re-run the focused tests after each fix.

- [ ] **Step 3: Run the full automated verification suite**

Run:

```bash
npm test
npm run lint
npm run build
git diff origin/main...HEAD --check
git status --short
```

Expected: all Vitest suites pass, ESLint exits successfully, Vite builds, no whitespace errors appear, and only intentional spec/plan/source/test files are modified. Do not run a migration or linked Supabase command because this feature performs no DDL.

- [ ] **Step 4: Invoke `qa` and exercise the visible admin flow**

Start the local app, sign in as an admin, and verify:

1. Reports shows Business Report and it loads Today with the expected Dhaka-local request.
2. The finance band says Delivery charged, Courier fees recorded, Net delivery position, and fee coverage, never collected cash or profit.
3. The hourly chart, source cards, Website landing-page detail, and all outcome chips render from a non-empty range.
4. A date preset and All Time refetch the report correctly.
5. Loading, empty, and retry states are readable at desktop and mobile widths.
6. A team-member account, if available, receives the UI redirect from `/reports/business` and a 403 from the API even when requesting the URL directly.

Fix only issues introduced by this feature. Re-run focused and full checks after fixes.

- [ ] **Step 5: Invoke `verification-before-completion` and record evidence**

Before claiming completion, run the verification workflow and report the actual focused-test, full-test, lint, build, diff-check, and browser-QA results. Do not push, deploy, apply a migration, or create a pull request unless the user explicitly requests shipping.

## Plan Self-Review

- **Spec coverage:** Task 1 implements the approved data semantics: regular-order-only scope, Dhaka boundaries, current-state outcomes, canonical source mapping, Website landing pages, delivery charged versus courier fees, coverage, and all chart modes. Task 2 supplies the enforced admin/workspace/pagination data path. Task 3 supplies the approved balanced hybrid UI and all page states. Task 4 prevents non-admin route and navigation access. Task 5 provides the required security, regression, build, and browser checks.
- **No schema leakage:** The live schema inspection confirms all selected fields and the existing `(org_id, created_at desc)` index. The plan contains no migration, RLS change, public-table exposure, or Social Inbox query.
- **Placeholder scan:** This plan contains no deferred implementation instructions. Every task names exact files, interfaces, test commands, request URLs, visible labels, and commit boundaries.
- **Type consistency:** `resolveBusinessReportRequest` produces the range and instants consumed by both the route and `buildBusinessReport`; `buildBusinessReport` returns the response contract consumed by `BusinessReport.tsx`; every UI test uses those same snake-case field names and disclosure/test-ID contracts.
