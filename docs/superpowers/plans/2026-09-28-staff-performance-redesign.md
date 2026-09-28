# Staff Performance Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/reports/staff` into the approved chart layout (mockup: https://claude.ai/artifact/Ar2kwZLYdjZpikpoVSYpSD v3, local copy `progress/staff-performance-redesign/mockup.html`) in the same style as the redesigned Business Report.

**Architecture:** The pure staff report builder (`server/reports.js` → `buildStaffReport`) gains two per-person counters (assigned orders that were delivered / returned) and a team `series` of confirmed orders over time. The route already passes `request` (with `range`, `since`, `until`) into the builder, so `server/index.js` does not change. The page is split into focused components under `src/components/staff-performance/`; all derived numbers live in a pure, unit-tested module; all ECharts options come from pure, unit-tested builders; the existing `EChart` wrapper is reused (and mocked in page tests).

**Tech Stack:** Express (ESM) + Vitest; React 18 + TypeScript + Tailwind + Framer Motion + TanStack Query; ECharts 6 via `src/lib/echarts.ts` (already installed).

## Global Constraints

- Hard rules in `CLAUDE.md` apply. `GET /api/reports/staff` keeps its auth, roster scoping, and every `.eq("org_id", orgId)`; never accept an org id from the client.
- Frontend calls go through `apiFetch()` only (already the case).
- Icons: Phosphor (`@phosphor-icons/react`) with `weight="light"`.
- Background `bg-[#FAFAF8]`; labels `text-[8px] font-medium tracking-[0.3em] text-black uppercase`; values `font-light`; panels `rounded-2xl bg-black/[0.04]`, no shadows.
- Currency `৳` with the existing `en-BD` formatting.
- Reuse chart tokens from `src/components/business-report/chartTheme.ts` (`CHART`, `OUTCOME_COLORS`, `OUTCOME_LABELS`) — do not introduce new colour values.
- ECharts only via `src/lib/echarts.ts` and the existing `src/components/business-report/EChart.tsx`; every option object is memoised with `useMemo`; pass `animate={!reduceMotion}`.
- Every string interpolated into an ECharts tooltip formatter is HTML-escaped (staff display names are user-entered).
- TypeScript strict; no `any`. Respect reduced motion.
- Non-admins keep seeing the summary tiles blurred (existing behaviour, existing test ids). All charts and the table stay visible to every team member.
- Copy: "RTO" for returned orders; "Former staff" label for inactive members.

## Rulings

- Ruling: no "vs previous period" deltas on this page — the staff route already runs ~10 paginated queries, and a previous window would double all of them — cost if wrong: add a previous-period pass later.
- Ruling: sparklines only on the Confirmed value and Confirmed orders tiles, from a new team `series` built from data the builder already has; rate tiles and Extra revenue get no sparkline — cost if wrong: add per-bucket assigned counts later.
- Ruling: Order yield uses the **assigned** population for every segment (delivered, in transit, RTO, cancelled, not confirmed), which needs two new counters; mixing assigned and confirmed-by denominators would make segments not add up — cost if wrong: none, counters are additive.
- Ruling: per-product outcome split is out of scope; the detail shows confirmed products (packs, kg, share), which the API returns today.
- Ruling: Social inbox metrics stay hidden, as today.
- Ruling: flags = more than 5 pts worse than the team average (red); "best" (green) only when at least 2 members have assigned orders.
- Ruling: "Extra revenue" = telesales confirmed value + retained upsell value + converted cart value, with a footnote that telesales is also part of confirmed value.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `server/reports.js` | Modify | New counters in `emptyMetrics` + confirmed loop; `series` in `buildStaffReport` result |
| `src/test/staffReport.test.ts` | Modify | Builder tests |
| `src/lib/staffPerformancePresentation.ts` | Modify | Add the two counters to `StaffMetrics`; add `StaffSeriesBucket` type |
| `src/lib/businessReportCharts.ts` | Modify | Export the existing `escapeHtml` |
| `src/lib/staffPerformanceMetrics.ts` | Create | Pure derivations: rows, rates, yield segments, flags, funnel, share, extra revenue, sort |
| `src/test/staffPerformanceMetrics.test.ts` | Create | Tests for the above |
| `src/lib/staffPerformanceCharts.ts` | Create | ECharts builders: leaderboard, yield, extra revenue |
| `src/test/staffPerformanceCharts.test.ts` | Create | Tests for the above |
| `src/components/staff-performance/StaffCharts.tsx` | Create | Leaderboard, Order yield, Team funnel, Team contribution, Extra revenue panels |
| `src/components/staff-performance/StaffTable.tsx` | Create | Sortable team table with animated expandable rows |
| `src/pages/StaffPerformance.tsx` | Modify | Compose; tiles get sparklines + Extra revenue tile; replace staff cards |
| `src/test/staffPerformancePage.test.tsx` | Modify | Page behaviour tests (EChart mocked) |

---

### Task 1: Assigned-outcome counters and team series (backend)

**Files:**
- Modify: `server/reports.js` (`emptyMetrics` ~96, regular confirmed loop ~495-540, `buildStaffReport` options + return ~416-614)
- Test: `src/test/staffReport.test.ts`

**Interfaces:**
- Produces on every `row.orders` and `row.social_inbox_orders`: `confirmed_assigned_delivered_count: number`, `confirmed_assigned_returned_count: number` (regular orders fill them; social inbox stays 0).
- Produces on the result: `series: { granularity: "hour" | "day", buckets: Array<{ key: string, label: string, confirmed_count: number, confirmed_value: number }> }` — regular orders confirmed by the selected staff, bucketed by the confirmation time in Asia/Dhaka. Single-day range → 24 hourly buckets (labels `12a`…`11p`); bounded multi-day → one bucket per day (label `Sep 18`); All time → the 30 most recent days that had confirmations.
- `buildStaffReport` reads `range` from its options object (the route already spreads `request`, which contains `range`); default `{ from: null, to: null }`.

- [ ] **Step 1: Write the failing tests** — append to `src/test/staffReport.test.ts`:

```ts
describe("buildStaffReport assigned outcomes and series", () => {
  const staff = [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }];

  it("counts delivered and returned outcomes among the member's own assigned confirmations", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [
        { id: "a1", assigned_to: TEAM_MEMBER_ID, created_at: "2026-09-18T01:00:00.000Z", confirmed_by: TEAM_MEMBER_ID, confirmed_at: "2026-09-18T02:00:00.000Z", price: 1000, courier_status: "delivered" },
        { id: "a2", assigned_to: TEAM_MEMBER_ID, created_at: "2026-09-18T01:00:00.000Z", confirmed_by: TEAM_MEMBER_ID, confirmed_at: "2026-09-18T03:00:00.000Z", price: 500, courier_status: "returned" },
        { id: "a3", assigned_to: TEAM_MEMBER_ID, created_at: "2026-09-18T01:00:00.000Z", confirmed_by: TEAM_MEMBER_ID, confirmed_at: "2026-09-18T04:00:00.000Z", price: 700, courier_status: "in_review" },
        { id: "other", assigned_to: ADMIN_ID, created_at: "2026-09-18T01:00:00.000Z", confirmed_by: TEAM_MEMBER_ID, confirmed_at: "2026-09-18T05:00:00.000Z", price: 900, courier_status: "delivered" },
      ],
      [], [], [], staff, interval,
    );

    expect(report.rows[0].orders).toMatchObject({
      assigned_count: 3,
      confirmed_count: 4,
      confirmed_assigned_count: 3,
      delivered_count: 2,
      confirmed_assigned_delivered_count: 1,
      confirmed_assigned_returned_count: 1,
    });
  });

  it("buckets team confirmations by Dhaka hour for a single-day range", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [
        { id: "c1", confirmed_by: TEAM_MEMBER_ID, confirmed_at: "2026-09-18T03:10:00.000Z", price: 1000 }, // 09:10 Dhaka
        { id: "c2", confirmed_by: TEAM_MEMBER_ID, confirmed_at: "2026-09-18T03:50:00.000Z", price: 500 },  // 09:50 Dhaka
        { id: "c3", confirmed_by: TEAM_MEMBER_ID, confirmed_at: "2026-09-18T15:00:00.000Z", price: 700 },  // 21:00 Dhaka
      ],
      [], [], [], staff, interval,
    );

    expect(report.series.granularity).toBe("hour");
    expect(report.series.buckets).toHaveLength(24);
    expect(report.series.buckets[9]).toEqual({ key: "2026-09-18-9", label: "9a", confirmed_count: 2, confirmed_value: 1500 });
    expect(report.series.buckets[21]).toMatchObject({ label: "9p", confirmed_count: 1, confirmed_value: 700 });
    expect(report.series.buckets[0]).toMatchObject({ label: "12a", confirmed_count: 0 });
  });

  it("fills every day of a bounded multi-day range", () => {
    const interval = toDhakaInterval("2026-09-17", "2026-09-19");
    const report = buildStaffReport(
      [{ id: "c1", confirmed_by: TEAM_MEMBER_ID, confirmed_at: "2026-09-19T03:00:00.000Z", price: 800 }],
      [], [], [], staff, interval,
    );

    expect(report.series.granularity).toBe("day");
    expect(report.series.buckets.map((bucket) => [bucket.key, bucket.confirmed_count, bucket.confirmed_value])).toEqual([
      ["2026-09-17", 0, 0],
      ["2026-09-18", 0, 0],
      ["2026-09-19", 1, 800],
    ]);
    expect(report.series.buckets[0].label).toBe("Sep 17");
  });

  it("keeps the 30 most recent active days for All time", () => {
    const orders = Array.from({ length: 32 }, (_, index) => ({
      id: `c${index}`,
      confirmed_by: TEAM_MEMBER_ID,
      confirmed_at: new Date(Date.UTC(2026, 7, 1 + index, 3)).toISOString(),
      price: 100,
    }));
    const report = buildStaffReport(orders, [], [], [], staff, { since: null, until: null, range: { from: null, to: null } });

    expect(report.series.granularity).toBe("day");
    expect(report.series.buckets).toHaveLength(30);
    expect(report.series.buckets[0].key).toBe("2026-08-03");
    expect(report.series.buckets[29].key).toBe("2026-09-01");
  });
});
```

Before writing these, read how the existing tests in this file build orders that count as "confirmed" (the builder uses `selectActivities(regularActivities, orders, "confirmed")`; with no activities passed it falls back to `confirmed_by`/`confirmed_at` on the order — confirm this with an existing test such as the one at the `interval` on line ~317, and adapt the fixtures if the fallback needs other fields). Also confirm `classifyCourierOutcome` treats `"delivered"` as delivered and `"returned"` as returned; if not, use the statuses it does recognise.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/test/staffReport.test.ts`
Expected: the four new tests FAIL (`confirmed_assigned_delivered_count` / `series` missing).

- [ ] **Step 3: Implement**

In `emptyMetrics()` add after `confirmed_assigned_count: 0,`:

```js
    confirmed_assigned_delivered_count: 0,
    confirmed_assigned_returned_count: 0,
```

In the regular-orders confirmed loop, compute the outcome once before the assigned-key branch and count it inside that branch. Replace the block from `const orderId = activityOrderId(activity, order);` through the end of the delivered/returned `if`s with:

```js
    const orderId = activityOrderId(activity, order);
    const assignedKey = `${actorId}:${orderId || "unknown"}`;
    const outcome = classifyCourierOutcome(order);
    if (
      order.assigned_to === actorId &&
      isInInterval(order.created_at, since, until) &&
      !confirmedAssignedOrderKeys.has(assignedKey)
    ) {
      confirmedAssignedOrderKeys.add(assignedKey);
      metrics.confirmed_assigned_count += 1;
      if (outcome === "delivered") metrics.confirmed_assigned_delivered_count += 1;
      if (outcome === "returned") metrics.confirmed_assigned_returned_count += 1;
    }
    if (outcome === "delivered") {
      metrics.delivered_count += 1;
      metrics.delivered_value += value;
    }
    if (outcome === "returned") {
      metrics.returned_count += 1;
      metrics.returned_value += value;
    }
```

(Keep the telesales block and `addProductDetails` call after it unchanged.)

Add these helpers above `buildStaffReport`:

```js
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const dayLabelFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function dhakaDayHour(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const shifted = new Date(timestamp + DHAKA_OFFSET_MS);
  return { day: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
}

function hourLabel(hour) {
  return `${hour % 12 || 12}${hour < 12 ? "a" : "p"}`;
}

function dayLabel(day) {
  return dayLabelFormatter.format(new Date(`${day}T00:00:00Z`));
}

function createSeriesBucket(key, label) {
  return { key, label, confirmed_count: 0, confirmed_value: 0 };
}

function buildConfirmationSeries(points, range) {
  const byDay = new Map();
  const byDayHour = new Map();
  for (const point of points) {
    const day = byDay.get(point.day) || createSeriesBucket(point.day, dayLabel(point.day));
    day.confirmed_count += 1;
    day.confirmed_value += point.value;
    byDay.set(point.day, day);
    const key = `${point.day}-${point.hour}`;
    const hour = byDayHour.get(key) || createSeriesBucket(key, hourLabel(point.hour));
    hour.confirmed_count += 1;
    hour.confirmed_value += point.value;
    byDayHour.set(key, hour);
  }
  if (range?.from && range?.to && range.from === range.to) {
    return {
      granularity: "hour",
      buckets: Array.from({ length: 24 }, (_, hour) => byDayHour.get(`${range.from}-${hour}`) || createSeriesBucket(`${range.from}-${hour}`, hourLabel(hour))),
    };
  }
  if (range?.from && range?.to) {
    const start = new Date(`${range.from}T00:00:00Z`).getTime();
    const end = new Date(`${range.to}T00:00:00Z`).getTime();
    const buckets = [];
    for (let time = start; time <= end; time += MS_PER_DAY) {
      const day = new Date(time).toISOString().slice(0, 10);
      buckets.push(byDay.get(day) || createSeriesBucket(day, dayLabel(day)));
    }
    return { granularity: "day", buckets };
  }
  return {
    granularity: "day",
    buckets: [...byDay.keys()].sort().slice(-30).map((day) => byDay.get(day)),
  };
}
```

In `buildStaffReport`, add `range = null` to the destructured options (`{ since = null, until = null, range = null, regularActivities, … }`), declare `const seriesPoints = [];` next to the other accumulators, and inside the regular confirmed loop, right after `metrics.confirmed_kg += weightKg;`, add:

```js
    const confirmedParts = dhakaDayHour(occurredAt);
    if (confirmedParts) seriesPoints.push({ ...confirmedParts, value });
```

Add `series: buildConfirmationSeries(seriesPoints, range),` to the returned object (before `missing_weight_products`). The early-return path in the route (`selectedUserIds.length === 0`) also calls `buildStaffReport` with `request`, so it gets an empty series automatically.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/test/staffReport.test.ts src/test/staffReportRouteWiring.test.ts`
Expected: all PASS. Existing `toMatchObject` assertions are unaffected by the extra fields; if any existing assertion uses `toEqual` on a metrics object, add the two new zero fields to it.

- [ ] **Step 5: Commit**

```bash
git add server/reports.js src/test/staffReport.test.ts
git commit -m "feat: add assigned delivery outcomes and a confirmation series to the staff report"
```

---

### Task 2: Types, shared escape helper, and pure staff metrics

**Files:**
- Modify: `src/lib/staffPerformancePresentation.ts` (add fields/types)
- Modify: `src/lib/businessReportCharts.ts` (export `escapeHtml`)
- Create: `src/lib/staffPerformanceMetrics.ts`
- Test: `src/test/staffPerformanceMetrics.test.ts`

**Interfaces:**
- Consumes: `StaffRow`, `StaffMetrics` from `@/lib/staffPerformancePresentation`.
- Produces (`staffPerformancePresentation.ts`): `StaffMetrics` gains `confirmed_assigned_delivered_count: number; confirmed_assigned_returned_count: number;`; new `export type StaffSeriesBucket = { key: string; label: string; confirmed_count: number; confirmed_value: number };` and `export type StaffSeries = { granularity: "hour" | "day"; buckets: StaffSeriesBucket[] };`.
- Produces (`businessReportCharts.ts`): `export const escapeHtml` (same implementation, now exported).
- Produces (`staffPerformanceMetrics.ts`): `STAFF_FLAG_POINTS = 5`, types `YieldKey`, `StaffYield`, `StaffTableRow`, `StaffSortKey`, `SortDir`, `TeamFunnel`, `ShareSlice`, and functions `buildStaffTableRows(rows)`, `sortStaffTableRows(rows, key, dir)`, `buildTeamFunnel(rows)`, `groupStaffShare(rows, maxSlices)`, `extraRevenue(row)` — exact code below.

- [ ] **Step 1: Types and export**

In `src/lib/staffPerformancePresentation.ts`, add to `StaffMetrics` after `confirmed_assigned_count: number;`:

```ts
  confirmed_assigned_delivered_count: number;
  confirmed_assigned_returned_count: number;
```

and append:

```ts
export type StaffSeriesBucket = {
  key: string;
  label: string;
  confirmed_count: number;
  confirmed_value: number;
};

export type StaffSeries = {
  granularity: "hour" | "day";
  buckets: StaffSeriesBucket[];
};
```

In `src/lib/businessReportCharts.ts` change `const escapeHtml = …` to `export const escapeHtml = …` (no other change).

Update the `metrics()` fixture in `src/test/staffPerformancePage.test.tsx` and any other TypeScript fixture of `StaffMetrics` (search `src/test` for `confirmed_assigned_count:`) to include `confirmed_assigned_delivered_count: 0, confirmed_assigned_returned_count: 0,` so type-checking stays clean.

- [ ] **Step 2: Write the failing tests** — `src/test/staffPerformanceMetrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AbandonedCartMetrics, StaffMetrics, StaffRow } from "@/lib/staffPerformancePresentation";
import {
  buildStaffTableRows,
  buildTeamFunnel,
  extraRevenue,
  groupStaffShare,
  sortStaffTableRows,
} from "@/lib/staffPerformanceMetrics";

function metrics(overrides: Partial<StaffMetrics> = {}): StaffMetrics {
  return {
    assigned_count: 0, confirmed_count: 0, confirmed_assigned_count: 0, confirmed_assigned_delivered_count: 0,
    confirmed_assigned_returned_count: 0, confirmed_value: 0, confirmed_kg: 0, confirmation_rate: null,
    average_order_value: null, cancelled_count: 0, cancelled_assigned_count: 0, cancelled_value: 0,
    cancellation_rate: null, delivered_count: 0, delivered_value: 0, delivered_rate: null, returned_count: 0,
    returned_value: 0, telesales_confirmed_count: 0, telesales_confirmed_value: 0, telesales_confirmed_kg: 0,
    retained_upsell_count: 0, retained_upsell_value: 0, products: [], ...overrides,
  };
}
const carts = (overrides: Partial<AbandonedCartMetrics> = {}): AbandonedCartMetrics => ({
  contacted_count: 0, dismissed_count: 0, reopened_count: 0, converted_count: 0, converted_value: 0, ...overrides,
});
function row(id: string, name: string, orders: Partial<StaffMetrics>, extra: Partial<StaffRow> = {}): StaffRow {
  return { user_id: id, display_name: name, is_active: true, orders: metrics(orders), social_inbox_orders: metrics(), abandoned_checkouts: carts(), ...extra };
}

const sadia = row("s", "Sadia", {
  assigned_count: 100, confirmed_count: 88, confirmed_assigned_count: 85, confirmed_assigned_delivered_count: 78,
  confirmed_assigned_returned_count: 2, cancelled_assigned_count: 8, cancelled_count: 8, confirmed_value: 88000,
  delivered_count: 80, confirmed_kg: 220, telesales_confirmed_value: 5000, retained_upsell_value: 2000,
}, { abandoned_checkouts: carts({ converted_value: 1000 }) });
const rahim = row("r", "Rahim", {
  assigned_count: 100, confirmed_count: 70, confirmed_assigned_count: 65, confirmed_assigned_delivered_count: 50,
  confirmed_assigned_returned_count: 8, cancelled_assigned_count: 20, cancelled_count: 20, confirmed_value: 70000,
  delivered_count: 52, confirmed_kg: 170,
});
const idle = row("i", "Idle", {}, { is_active: false });

describe("buildStaffTableRows", () => {
  it("derives rates, yield segments over assigned orders, and flags versus the team average", () => {
    const [s, r, i] = buildStaffTableRows([sadia, rahim, idle]);

    expect(s).toMatchObject({ key: "s", name: "Sadia", assigned: 100, confirmed: 88, value: 88000, confRate: 85, cancelRate: 8, kg: 220, aov: 1000, extra: 8000, isActive: true });
    expect(s.delRate).toBeCloseTo(90.91, 1); // 80 / 88
    expect(s.yield).toEqual({ delivered: 78, inTransit: 5, returned: 2, cancelled: 8, notConfirmed: 7 });
    expect(s.deliveredShare).toBe(78);
    // team: conf 150/200 = 75, cancel 28/200 = 14, delivered 132/158 = 83.5
    expect(s.flags).toEqual({ confRate: "best", cancelRate: "best", delRate: "best" });
    expect(r.flags).toEqual({ confRate: "worse", cancelRate: "worse", delRate: null });
    expect(i).toMatchObject({ assigned: 0, confRate: null, cancelRate: null, delRate: null, deliveredShare: null, isActive: false });
    expect(i.flags).toEqual({ confRate: null, cancelRate: null, delRate: null });
  });

  it("never marks anyone best when fewer than two members have assigned orders", () => {
    const [s] = buildStaffTableRows([sadia, idle]);
    expect(s.flags).toEqual({ confRate: null, cancelRate: null, delRate: null });
  });
});

describe("sortStaffTableRows", () => {
  it("sorts numeric keys with nulls last and names alphabetically", () => {
    const rows = buildStaffTableRows([rahim, idle, sadia]);
    expect(sortStaffTableRows(rows, "value", -1).map((item) => item.key)).toEqual(["s", "r", "i"]);
    expect(sortStaffTableRows(rows, "confRate", 1).map((item) => item.key)).toEqual(["r", "s", "i"]);
    expect(sortStaffTableRows(rows, "name", 1).map((item) => item.key)).toEqual(["i", "r", "s"]);
  });
});

describe("buildTeamFunnel", () => {
  it("sums the assigned population and its outcomes", () => {
    expect(buildTeamFunnel([sadia, rahim, idle])).toEqual({
      assigned: 200, confirmed: 150, delivered: 128, returned: 10, inTransit: 12, cancelled: 28, notConfirmed: 22,
    });
  });
});

describe("groupStaffShare", () => {
  it("keeps the top members by confirmed value and folds the rest into Other", () => {
    const many = ["A", "B", "C", "D", "E", "F"].map((name, index) => row(name, name, { confirmed_value: 600 - index * 100 }));
    expect(groupStaffShare(many, 4)).toEqual([
      { label: "A", value: 600 }, { label: "B", value: 500 }, { label: "C", value: 400 }, { label: "D", value: 300 }, { label: "Other", value: 300 },
    ]);
    expect(groupStaffShare([idle], 4)).toEqual([]);
  });
});

describe("extraRevenue", () => {
  it("adds telesales, retained upsell and converted cart value", () => {
    expect(extraRevenue(sadia)).toEqual({ telesales: 5000, upsell: 2000, carts: 1000, total: 8000 });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/test/staffPerformanceMetrics.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/lib/staffPerformanceMetrics.ts`**

```ts
import type { StaffRow } from "@/lib/staffPerformancePresentation";

export const STAFF_FLAG_POINTS = 5;

export type YieldKey = "delivered" | "inTransit" | "returned" | "cancelled" | "notConfirmed";
export type StaffYield = Record<YieldKey, number>;
export type RateFlag = "best" | "worse" | null;

export type StaffTableRow = {
  key: string;
  name: string;
  isActive: boolean;
  assigned: number;
  confirmed: number;
  value: number;
  kg: number;
  aov: number | null;
  confRate: number | null;
  cancelRate: number | null;
  delRate: number | null;
  yield: StaffYield;
  deliveredShare: number | null;
  extra: number;
  flags: { confRate: RateFlag; cancelRate: RateFlag; delRate: RateFlag };
  row: StaffRow;
};

export type StaffSortKey = "name" | "assigned" | "confirmed" | "value" | "confRate" | "cancelRate" | "delRate" | "aov" | "kg" | "extra";
export type SortDir = 1 | -1;

const pct = (numerator: number, denominator: number): number | null => (denominator > 0 ? (numerator / denominator) * 100 : null);

export function extraRevenue(row: StaffRow) {
  const telesales = row.orders.telesales_confirmed_value || 0;
  const upsell = row.orders.retained_upsell_value || 0;
  const carts = row.abandoned_checkouts.converted_value || 0;
  return { telesales, upsell, carts, total: telesales + upsell + carts };
}

function staffYield(row: StaffRow): StaffYield {
  const m = row.orders;
  const delivered = m.confirmed_assigned_delivered_count || 0;
  const returned = m.confirmed_assigned_returned_count || 0;
  return {
    delivered,
    inTransit: Math.max(0, m.confirmed_assigned_count - delivered - returned),
    returned,
    cancelled: m.cancelled_assigned_count,
    notConfirmed: Math.max(0, m.assigned_count - m.confirmed_assigned_count - m.cancelled_assigned_count),
  };
}

function flagFor(value: number | null, average: number | null, best: number | null, higherIsBetter: boolean, allowBest: boolean): RateFlag {
  if (value === null || average === null) return null;
  if (allowBest && best !== null && value === best) return "best";
  const worse = higherIsBetter ? value < average - STAFF_FLAG_POINTS : value > average + STAFF_FLAG_POINTS;
  return worse ? "worse" : null;
}

export function buildStaffTableRows(rows: StaffRow[]): StaffTableRow[] {
  const totals = rows.reduce((sum, row) => ({
    assigned: sum.assigned + row.orders.assigned_count,
    confirmedAssigned: sum.confirmedAssigned + row.orders.confirmed_assigned_count,
    cancelledAssigned: sum.cancelledAssigned + row.orders.cancelled_assigned_count,
    confirmed: sum.confirmed + row.orders.confirmed_count,
    delivered: sum.delivered + row.orders.delivered_count,
  }), { assigned: 0, confirmedAssigned: 0, cancelledAssigned: 0, confirmed: 0, delivered: 0 });
  const averages = {
    confRate: pct(totals.confirmedAssigned, totals.assigned),
    cancelRate: pct(totals.cancelledAssigned, totals.assigned),
    delRate: pct(totals.delivered, totals.confirmed),
  };
  const base = rows.map((row) => {
    const m = row.orders;
    const segments = staffYield(row);
    return {
      key: row.user_id,
      name: row.display_name,
      isActive: row.is_active,
      assigned: m.assigned_count,
      confirmed: m.confirmed_count,
      value: m.confirmed_value,
      kg: m.confirmed_kg,
      aov: m.confirmed_count > 0 ? m.confirmed_value / m.confirmed_count : null,
      confRate: pct(m.confirmed_assigned_count, m.assigned_count),
      cancelRate: pct(m.cancelled_assigned_count, m.assigned_count),
      delRate: pct(m.delivered_count, m.confirmed_count),
      yield: segments,
      deliveredShare: pct(segments.delivered, m.assigned_count),
      extra: extraRevenue(row).total,
      row,
    };
  });
  const withAssigned = base.filter((item) => item.assigned > 0);
  const allowBest = withAssigned.length >= 2;
  const bestOf = (values: Array<number | null>, pick: (a: number, b: number) => number) => {
    const present = values.filter((value): value is number => value !== null);
    return present.length ? present.reduce(pick) : null;
  };
  const best = {
    confRate: bestOf(withAssigned.map((item) => item.confRate), Math.max),
    cancelRate: bestOf(withAssigned.map((item) => item.cancelRate), Math.min),
    delRate: bestOf(base.map((item) => item.delRate), Math.max),
  };
  return base.map((item) => ({
    ...item,
    flags: {
      confRate: flagFor(item.confRate, averages.confRate, best.confRate, true, allowBest),
      cancelRate: flagFor(item.cancelRate, averages.cancelRate, best.cancelRate, false, allowBest),
      delRate: flagFor(item.delRate, averages.delRate, best.delRate, true, allowBest),
    },
  }));
}

export function sortStaffTableRows(rows: StaffTableRow[], key: StaffSortKey, dir: SortDir): StaffTableRow[] {
  return [...rows].sort((a, b) => {
    if (key === "name") return a.name.localeCompare(b.name) * dir;
    const left = a[key];
    const right = b[key];
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return (left - right) * dir;
  });
}

export type TeamFunnel = { assigned: number; confirmed: number; delivered: number; returned: number; inTransit: number; cancelled: number; notConfirmed: number };

export function buildTeamFunnel(rows: StaffRow[]): TeamFunnel {
  return rows.reduce<TeamFunnel>((sum, row) => {
    const segments = staffYield(row);
    return {
      assigned: sum.assigned + row.orders.assigned_count,
      confirmed: sum.confirmed + row.orders.confirmed_assigned_count,
      delivered: sum.delivered + segments.delivered,
      returned: sum.returned + segments.returned,
      inTransit: sum.inTransit + segments.inTransit,
      cancelled: sum.cancelled + segments.cancelled,
      notConfirmed: sum.notConfirmed + segments.notConfirmed,
    };
  }, { assigned: 0, confirmed: 0, delivered: 0, returned: 0, inTransit: 0, cancelled: 0, notConfirmed: 0 });
}

export type ShareSlice = { label: string; value: number };

export function groupStaffShare(rows: StaffRow[], maxSlices = 4): ShareSlice[] {
  const sorted = rows
    .filter((row) => row.orders.confirmed_value > 0)
    .sort((a, b) => b.orders.confirmed_value - a.orders.confirmed_value);
  const top = sorted.slice(0, maxSlices).map((row) => ({ label: row.display_name, value: row.orders.confirmed_value }));
  const rest = sorted.slice(maxSlices).reduce((sum, row) => sum + row.orders.confirmed_value, 0);
  return rest > 0 ? [...top, { label: "Other", value: rest }] : top;
}
```

Fixture arithmetic check for the first test: Sadia yield = delivered 78, returned 2, inTransit 85-78-2 = 5, cancelled 8, notConfirmed 100-85-8 = 7. Team conf = (85+65)/200 = 75, cancel = 28/200 = 14, delivered = (80+52)/(88+70) = 83.5. Rahim conf 65 < 70 → worse; cancel 20 > 19 → worse; delRate 74.3 is not < 78.5 → null. Team funnel delivered = 78+50 = 128, inTransit = 5+7 = 12.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/test/staffPerformanceMetrics.test.ts && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: tests PASS; tsc count ≤ the baseline recorded before the task (65 on main at plan time) and none in touched files.

- [ ] **Step 6: Commit**

```bash
git add src/lib/staffPerformancePresentation.ts src/lib/businessReportCharts.ts src/lib/staffPerformanceMetrics.ts src/test/staffPerformanceMetrics.test.ts src/test/staffPerformancePage.test.tsx
git commit -m "feat: add staff performance metrics for rates, yield, funnel and share"
```

---

### Task 3: Staff chart builders

**Files:**
- Create: `src/lib/staffPerformanceCharts.ts`
- Test: `src/test/staffPerformanceCharts.test.ts`

**Interfaces:**
- Consumes: `StaffTableRow`, `YieldKey` (Task 2); `escapeHtml` (Task 2); `CHART`, `OUTCOME_COLORS` from `@/components/business-report/chartTheme`; `EChartsCoreOption` from `@/lib/echarts`.
- Produces: `YIELD_KEYS`, `YIELD_LABELS`, `YIELD_COLORS`, `LEADERBOARD_LIMIT = 8`, `leaderboardOption(rows)`, `yieldOption(rows, teamDeliveredShare)`, `extraRevenueOption(rows)`.

- [ ] **Step 1: Write the failing tests** — `src/test/staffPerformanceCharts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { StaffTableRow } from "@/lib/staffPerformanceMetrics";
import { LEADERBOARD_LIMIT, extraRevenueOption, leaderboardOption, yieldOption } from "@/lib/staffPerformanceCharts";

type Series = { name?: string; type: string; data: Array<{ value: number; itemStyle?: { color?: string } } | number>; markLine?: { data: Array<{ xAxis: number }> } };
const seriesOf = (option: unknown) => (option as { series: Series[] }).series;
const axisData = (option: unknown, axis: "xAxis" | "yAxis") => ((option as Record<string, { data: string[] }>)[axis]).data;
type TooltipFormatter = (params: Array<{ dataIndex: number }>) => string;
const tooltipOf = (option: unknown) => (option as { tooltip: { formatter: TooltipFormatter } }).tooltip.formatter;

function row(name: string, value: number, deliveredShare: number | null, extra = 0): StaffTableRow {
  return {
    key: name, name, isActive: true, assigned: 100, confirmed: 10, value, kg: 0, aov: value / 10,
    confRate: 80, cancelRate: 10, delRate: 90, deliveredShare, extra,
    yield: { delivered: deliveredShare ?? 0, inTransit: 5, returned: 5, cancelled: 10, notConfirmed: 100 - (deliveredShare ?? 0) - 20 },
    flags: { confRate: null, cancelRate: null, delRate: null },
    row: { user_id: name, display_name: name, is_active: true, orders: {} as never, social_inbox_orders: {} as never, abandoned_checkouts: { contacted_count: 0, dismissed_count: 0, reopened_count: 0, converted_count: 0, converted_value: 0 } },
  };
}

describe("leaderboardOption", () => {
  it("ranks by confirmed value, highlights only #1, and caps the number of columns", () => {
    const rows = Array.from({ length: 10 }, (_, index) => row(`S${index}`, 1000 + index * 100, 50));
    const option = leaderboardOption(rows);
    const [bars] = seriesOf(option);
    const colors = (bars.data as Array<{ itemStyle: { color: string } }>).map((item) => item.itemStyle.color);

    expect(bars.data).toHaveLength(LEADERBOARD_LIMIT);
    expect(axisData(option, "xAxis")[0]).toContain("S9");
    expect(colors[0]).not.toBe(colors[1]);
    expect(new Set(colors.slice(1)).size).toBe(1);
  });

  it("escapes staff names in the tooltip", () => {
    const option = leaderboardOption([row("<img src=x onerror=alert(1)>", 1000, 50)]);
    const html = tooltipOf(option)([{ dataIndex: 0 }]);
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });
});

describe("yieldOption", () => {
  it("stacks five outcome segments as percentages of assigned, sorted so the best share is on top", () => {
    const option = yieldOption([row("Low", 1, 40), row("High", 1, 80), row("None", 1, null)], 60);
    const series = seriesOf(option);

    expect(series).toHaveLength(5);
    expect(axisData(option, "yAxis")).toEqual(["Low", "High"]); // category axis draws bottom-up
    expect(series[0].data).toEqual([40, 80]);
    expect(series[0].markLine?.data).toEqual([{ xAxis: 60 }]);
  });
});

describe("extraRevenueOption", () => {
  it("draws one stacked bar per member with extra revenue, largest at the top", () => {
    const rows = [row("A", 1, 50, 3000), row("B", 1, 50, 0), row("C", 1, 50, 9000)];
    const option = extraRevenueOption(rows);
    expect(axisData(option, "yAxis")).toEqual(["A", "C"]);
    expect(seriesOf(option)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/test/staffPerformanceCharts.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/staffPerformanceCharts.ts`**

```ts
import type { EChartsCoreOption } from "@/lib/echarts";
import { CHART, OUTCOME_COLORS } from "@/components/business-report/chartTheme";
import { escapeHtml } from "@/lib/businessReportCharts";
import { extraRevenue, type StaffTableRow, type YieldKey } from "@/lib/staffPerformanceMetrics";

export const LEADERBOARD_LIMIT = 8;
export const YIELD_KEYS: YieldKey[] = ["delivered", "inTransit", "returned", "cancelled", "notConfirmed"];
export const YIELD_LABELS: Record<YieldKey, string> = {
  delivered: "Delivered",
  inTransit: "In transit",
  returned: "RTO",
  cancelled: "Cancelled",
  notConfirmed: "Not confirmed",
};
export const YIELD_COLORS: Record<YieldKey, string> = {
  delivered: OUTCOME_COLORS.approved,
  inTransit: CHART.greys[3],
  returned: OUTCOME_COLORS.returned,
  cancelled: OUTCOME_COLORS.cancelled,
  notConfirmed: CHART.greys[4],
};

const taka = (value: number) => `৳${Math.round(value).toLocaleString("en-BD")}`;
const count = (value: number) => value.toLocaleString("en-BD");

function tooltip(extra: Record<string, unknown>) {
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

export function leaderboardOption(rows: StaffTableRow[]): EChartsCoreOption {
  const ranked = [...rows].filter((item) => item.value > 0).sort((a, b) => b.value - a.value).slice(0, LEADERBOARD_LIMIT);
  return {
    grid: { left: 8, right: 8, top: 44, bottom: 46 },
    tooltip: tooltip({
      trigger: "axis",
      axisPointer: { type: "none" },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const item = ranked[params[0].dataIndex];
        return `<b>#${params[0].dataIndex + 1} ${escapeHtml(item.name)}</b><br>${taka(item.value)} confirmed<br>${count(item.confirmed)} orders${item.aov === null ? "" : ` · AOV ${taka(item.aov)}`}`;
      },
    }),
    xAxis: {
      type: "category",
      data: ranked.map((item, index) => `#${index + 1}\n${item.name}`),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: CHART.ink, fontSize: 12, fontWeight: 500, margin: 12, lineHeight: 16, interval: 0, overflow: "truncate", width: 90 },
    },
    yAxis: { type: "value", show: false },
    series: [{
      type: "bar",
      barWidth: "46%",
      data: ranked.map((item, index) => ({
        value: item.value,
        itemStyle: {
          color: index === 0 ? CHART.ink : CHART.greys[3],
          borderRadius: [10, 10, 10, 10],
          ...(index === 0 ? { shadowBlur: 16, shadowColor: CHART.ink3 } : {}),
        },
      })),
      label: {
        show: true,
        position: "top",
        distance: 8,
        formatter: (params: { dataIndex: number }) => {
          const item = ranked[params.dataIndex];
          return `{v|${taka(item.value)}}\n{m|${count(item.confirmed)} orders${item.aov === null ? "" : ` · ${taka(item.aov)}`}}`;
        },
        rich: {
          v: { color: CHART.ink, fontSize: 13, fontWeight: 500, lineHeight: 18 },
          m: { color: CHART.ink3, fontSize: 10, lineHeight: 14 },
        },
      },
    }],
  };
}

export function yieldOption(rows: StaffTableRow[], teamDeliveredShare: number | null): EChartsCoreOption {
  const ordered = rows
    .filter((item): item is StaffTableRow & { deliveredShare: number } => item.deliveredShare !== null)
    .sort((a, b) => a.deliveredShare - b.deliveredShare);
  const share = (item: StaffTableRow, key: YieldKey) => (item.assigned > 0 ? (item.yield[key] / item.assigned) * 100 : 0);
  return {
    grid: { left: 72, right: 58, top: 6, bottom: 22 },
    tooltip: tooltip({
      trigger: "axis",
      axisPointer: { type: "none" },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const item = ordered[params[0].dataIndex];
        return `<b>${escapeHtml(item.name)}</b> · ${count(item.assigned)} assigned<br>`
          + YIELD_KEYS.map((key) => `${YIELD_LABELS[key]} ${count(item.yield[key])} (${share(item, key).toFixed(1)}%)`).join("<br>");
      },
    }),
    xAxis: {
      type: "value",
      max: 100,
      axisLabel: { color: CHART.ink3, fontSize: 10, formatter: "{value}%" },
      splitLine: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: "category",
      data: ordered.map((item) => item.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: CHART.ink, fontSize: 12, fontWeight: 500, overflow: "truncate", width: 64 },
    },
    series: YIELD_KEYS.map((key, index) => ({
      name: YIELD_LABELS[key],
      type: "bar",
      stack: "yield",
      barWidth: 18,
      data: ordered.map((item) => (key === "delivered" ? item.deliveredShare : share(item, key))),
      itemStyle: {
        color: YIELD_COLORS[key],
        borderColor: CHART.bg,
        borderWidth: 1,
        borderRadius: index === 0 ? [4, 0, 0, 4] : index === YIELD_KEYS.length - 1 ? [0, 4, 4, 0] : 0,
      },
      ...(index === 0 && teamDeliveredShare !== null ? {
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: CHART.ink, type: "dashed", width: 1 },
          label: { show: false },
          data: [{ xAxis: teamDeliveredShare }],
        },
      } : {}),
      ...(index === YIELD_KEYS.length - 1 ? {
        label: {
          show: true,
          position: "right",
          color: CHART.ink,
          fontSize: 11,
          fontWeight: 500,
          formatter: (params: { dataIndex: number }) => `${ordered[params.dataIndex].deliveredShare.toFixed(1)}%`,
        },
      } : {}),
    })),
  };
}

export function extraRevenueOption(rows: StaffTableRow[]): EChartsCoreOption {
  const ordered = rows.filter((item) => item.extra > 0).sort((a, b) => a.extra - b.extra);
  const parts = ordered.map((item) => extraRevenue(item.row));
  const stack = [
    { name: "Telesales", color: CHART.greys[0], pick: (index: number) => parts[index].telesales },
    { name: "Upsell kept", color: CHART.greys[2], pick: (index: number) => parts[index].upsell },
    { name: "Carts converted", color: CHART.greys[3], pick: (index: number) => parts[index].carts },
  ];
  return {
    grid: { left: 64, right: 64, top: 4, bottom: 4 },
    tooltip: tooltip({
      trigger: "axis",
      axisPointer: { type: "none" },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const index = params[0].dataIndex;
        const item = ordered[index];
        return `<b>${escapeHtml(item.name)}</b> · ${taka(item.extra)}<br>`
          + stack.map((entry) => `${entry.name} ${taka(entry.pick(index))}`).join("<br>");
      },
    }),
    xAxis: { type: "value", show: false },
    yAxis: {
      type: "category",
      data: ordered.map((item) => item.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: CHART.ink, fontSize: 12, overflow: "truncate", width: 58 },
    },
    series: stack.map((entry, index) => ({
      name: entry.name,
      type: "bar",
      stack: "extra",
      barWidth: 14,
      data: ordered.map((_, rowIndex) => entry.pick(rowIndex)),
      itemStyle: { color: entry.color, borderRadius: index === 0 ? [3, 0, 0, 3] : index === 2 ? [0, 3, 3, 0] : 0 },
      ...(index === 2 ? {
        label: { show: true, position: "right", color: CHART.ink2, fontSize: 11, formatter: (params: { dataIndex: number }) => taka(ordered[params.dataIndex].extra) },
      } : {}),
    })),
  };
}
```

Note on the first leaderboard test: rows are `S0…S9` with values rising, so the top is `S9`; the axis label is `"#1\nS9"`, which `toContain("S9")` matches.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/test/staffPerformanceCharts.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/staffPerformanceCharts.ts src/test/staffPerformanceCharts.test.ts
git commit -m "feat: add staff performance chart builders"
```

---

### Task 4: Summary tiles and chart panels on the page

**Files:**
- Create: `src/components/staff-performance/StaffCharts.tsx`
- Modify: `src/pages/StaffPerformance.tsx` (response type gets `series`; `SnapshotCard` gets an optional sparkline; add the Extra revenue tile; compose panels)
- Test: `src/test/staffPerformancePage.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`buildStaffTableRows`, `buildTeamFunnel`, `groupStaffShare`, `extraRevenue`, `StaffSeries`), Task 3 builders, `sparklineOption` + `sourceMixOption` from `@/lib/businessReportCharts`, `EChart`, `CHART`.
- Produces: `LeaderboardPanel`, `OrderYieldPanel`, `TeamFunnelPanel`, `TeamContributionPanel`, `ExtraRevenuePanel`, each `({ rows, reduceMotion }: { rows: StaffRow[]; reduceMotion: boolean | null })`, rendering `<section aria-labelledby>` with headings (region names used by tests): "Confirmed value by staff", "Where every assigned order ended up", "From assigned to delivered", "Team contribution", "Telesales, upsells and saved carts".

- [ ] **Step 1: Update fixtures and write failing tests** — in `src/test/staffPerformancePage.test.tsx`:

Add at the top (after the existing `vi.mock` calls):

```tsx
vi.mock("@/components/business-report/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}));
```

Add `series: { granularity: "day", buckets: [] }` to `reportResponse()` defaults and the `series` field to the local `StaffReportResponse` type (import `StaffSeries` from `@/lib/staffPerformancePresentation`).

Add tests:

```tsx
  it("shows the extra revenue tile and sparklines on the value and count tiles", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      series: { granularity: "day", buckets: [
        { key: "2026-09-17", label: "Sep 17", confirmed_count: 1, confirmed_value: 500 },
        { key: "2026-09-18", label: "Sep 18", confirmed_count: 2, confirmed_value: 900 },
      ] },
    })));

    renderPage();

    const extra = await screen.findByTestId("staff-performance-summary-extra-revenue");
    expect(extra).toHaveTextContent("৳2,400"); // Rafi and Nadia each have telesales ৳1,200 in the default fixture; no upsell or carts
    expect(within(screen.getByTestId("staff-performance-summary-confirmed-value")).getByRole("img", { name: "Confirmed value trend" })).toBeInTheDocument();
    expect(within(screen.getByTestId("staff-performance-summary-confirmation-rate")).queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the leaderboard, order yield, funnel, contribution and extra revenue panels", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse()));

    renderPage();

    expect(await screen.findByRole("region", { name: "Confirmed value by staff" })).toBeInTheDocument();
    expect(screen.getByText("Top this period").closest("section")).toHaveTextContent("Rafi");
    expect(screen.getByRole("region", { name: "Where every assigned order ended up" })).toBeInTheDocument();
    const funnel = screen.getByRole("region", { name: "From assigned to delivered" });
    expect(within(funnel).getByText("Assigned")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Team contribution" })).toHaveTextContent("Rafi");
    expect(screen.getByRole("region", { name: "Telesales, upsells and saved carts" })).toBeInTheDocument();
  });

  it("keeps the charts visible to team members while the tiles stay blurred", async () => {
    roleState.isAdmin = false;
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse()));

    renderPage();

    expect(await screen.findByTestId("staff-performance-summary-locked")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Confirmed value by staff" })).toBeInTheDocument();
  });
```

The default `metrics()` fixture sets `telesales_confirmed_value: 1200` and both default rows use it, so the expected total is ৳2,400; re-check if the fixture differs.

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/test/staffPerformancePage.test.tsx` → the three new tests FAIL.

- [ ] **Step 3: Implement `src/components/staff-performance/StaffCharts.tsx`**

```tsx
import { useId, useMemo, type ReactNode } from "react";
import { EChart } from "@/components/business-report/EChart";
import { CHART } from "@/components/business-report/chartTheme";
import { sourceMixOption } from "@/lib/businessReportCharts";
import { extraRevenueOption, leaderboardOption, YIELD_COLORS, YIELD_KEYS, YIELD_LABELS, yieldOption } from "@/lib/staffPerformanceCharts";
import { buildStaffTableRows, buildTeamFunnel, groupStaffShare } from "@/lib/staffPerformanceMetrics";
import type { StaffRow } from "@/lib/staffPerformancePresentation";

type PanelProps = { rows: StaffRow[]; reduceMotion: boolean | null };

const formatNumber = (value: number) => Number(value || 0).toLocaleString("en-BD");
const formatTaka = (value: number) => `৳${Math.round(value || 0).toLocaleString("en-BD")}`;
const formatPct = (value: number) => `${value.toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`;

function Panel({ eyebrow, title, aside, children }: { eyebrow: string; title: string; aside?: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3 rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5">
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

function Swatch({ color }: { color: string }) {
  return <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color }} />;
}

export function LeaderboardPanel({ rows, reduceMotion }: PanelProps) {
  const tableRows = useMemo(() => buildStaffTableRows(rows), [rows]);
  const option = useMemo(() => leaderboardOption(tableRows), [tableRows]);
  const top = [...tableRows].filter((item) => item.value > 0).sort((a, b) => b.value - a.value)[0];
  return (
    <Panel
      eyebrow="Leaderboard"
      title="Confirmed value by staff"
      aside={top && (
        <div className="text-right">
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/60">Top this period</p>
          <p className="mt-1 text-[22px] font-light tracking-[-0.03em] text-black">{top.name}</p>
        </div>
      )}
    >
      {top
        ? <EChart option={option} ariaLabel="Confirmed value for each staff member, ranked" className="h-[260px] w-full" animate={!reduceMotion} />
        : <p className="py-10 text-center text-[12px] text-black/55">No confirmed orders in this range.</p>}
    </Panel>
  );
}

export function OrderYieldPanel({ rows, reduceMotion }: PanelProps) {
  const tableRows = useMemo(() => buildStaffTableRows(rows), [rows]);
  const funnel = useMemo(() => buildTeamFunnel(rows), [rows]);
  const teamShare = funnel.assigned > 0 ? (funnel.delivered / funnel.assigned) * 100 : null;
  const option = useMemo(() => yieldOption(tableRows, teamShare), [tableRows, teamShare]);
  return (
    <Panel
      eyebrow="Order yield"
      title="Where every assigned order ended up"
      aside={teamShare !== null && <span className="rounded-full bg-black/[0.05] px-3 py-1 text-[11px] tabular-nums text-black/70">Team delivered {formatPct(teamShare)}</span>}
    >
      {teamShare !== null
        ? <EChart option={option} ariaLabel="Share of each member's assigned orders that were delivered, in transit, returned, cancelled or not confirmed" className="h-[260px] w-full" animate={!reduceMotion} />
        : <p className="py-10 text-center text-[12px] text-black/55">No assigned orders in this range.</p>}
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-black/60">
        {YIELD_KEYS.map((key) => <span key={key} className="inline-flex items-center gap-1.5"><Swatch color={YIELD_COLORS[key]} />{YIELD_LABELS[key]}</span>)}
      </div>
      <p className="text-[10px] text-black/45">Sorted by delivered ÷ assigned · dashed line = team average</p>
    </Panel>
  );
}

export function TeamFunnelPanel({ rows }: PanelProps) {
  const funnel = useMemo(() => buildTeamFunnel(rows), [rows]);
  const tableRows = useMemo(() => buildStaffTableRows(rows), [rows]);
  const width = (value: number) => (funnel.assigned > 0 ? `${Math.max(2, (value / funnel.assigned) * 100)}%` : "0%");
  const share = (value: number) => (funnel.assigned > 0 ? formatPct((value / funnel.assigned) * 100) : "—");
  const steps = [
    { label: "Assigned", value: funnel.assigned, color: CHART.ink, drop: `${formatNumber(funnel.notConfirmed + funnel.cancelled)} not confirmed (${formatNumber(funnel.cancelled)} cancelled)` },
    { label: "Confirmed", value: funnel.confirmed, color: CHART.ink, drop: `${formatNumber(funnel.returned)} RTO · ${formatNumber(funnel.inTransit)} in transit` },
    { label: "Delivered", value: funnel.delivered, color: YIELD_COLORS.delivered, drop: null },
  ];
  const byConfirmation = tableRows.filter((item) => item.confRate !== null).sort((a, b) => (b.confRate ?? 0) - (a.confRate ?? 0));
  return (
    <Panel eyebrow="Team funnel" title="From assigned to delivered">
      <div className="grid gap-2">
        {steps.map((step) => (
          <div key={step.label} className="grid gap-1">
            <div className="grid grid-cols-[76px_minmax(0,1fr)_52px] items-center gap-2.5 text-[12px]">
              <span>{step.label}</span>
              <div className="h-[22px] rounded-md" style={{ width: width(step.value), background: step.color }}>
                <span className="block px-2 text-[11px] font-medium leading-[22px] tabular-nums text-[#FAFAF8]">{formatNumber(step.value)}</span>
              </div>
              <span className="text-right tabular-nums text-black/55">{share(step.value)}</span>
            </div>
            {step.drop && <p className="pl-[86px] text-[11px] tabular-nums text-[#B4473A]">− {step.drop}</p>}
          </div>
        ))}
      </div>
      {byConfirmation.length > 0 && (
        <ul aria-label="Confirmation rate by staff" className="mt-auto grid gap-1.5 border-t border-black/[0.08] pt-3">
          {byConfirmation.map((item) => (
            <li key={item.key} className="grid gap-1 text-[11px]">
              <span className="flex justify-between"><span className="text-black/60">{item.name}</span><span className={`tabular-nums ${item.flags.confRate === "worse" ? "font-medium text-[#B4473A]" : ""}`}>{formatPct(item.confRate ?? 0)}</span></span>
              <span className="h-1.5 overflow-hidden rounded-full bg-black/[0.08]" aria-hidden="true">
                <span className="block h-full rounded-full" style={{ width: `${item.confRate}%`, background: item.flags.confRate === "worse" ? "#B4473A" : CHART.ink }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function TeamContributionPanel({ rows, reduceMotion }: PanelProps) {
  const slices = useMemo(() => groupStaffShare(rows, 4), [rows]);
  const option = useMemo(() => sourceMixOption(slices), [slices]);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return (
    <Panel eyebrow="Share of confirmed value" title="Team contribution">
      {total > 0 && <EChart option={option} ariaLabel="Share of confirmed value per staff member" className="h-[180px] w-full" animate={!reduceMotion} />}
      <ul className="mt-auto grid gap-1.5">
        {slices.map((slice, index) => (
          <li key={slice.label} className="grid grid-cols-[10px_1fr_auto_auto] items-center gap-2 text-[12px]">
            <Swatch color={CHART.greys[Math.min(index, CHART.greys.length - 1)]} />
            <span className="truncate">{slice.label}</span>
            <span className="tabular-nums">{formatTaka(slice.value)}</span>
            <span className="min-w-[36px] text-right tabular-nums text-black/45">{Math.round((slice.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function ExtraRevenuePanel({ rows, reduceMotion }: PanelProps) {
  const tableRows = useMemo(() => buildStaffTableRows(rows), [rows]);
  const option = useMemo(() => extraRevenueOption(tableRows), [tableRows]);
  const hasAny = tableRows.some((item) => item.extra > 0);
  return (
    <Panel eyebrow="Extra revenue" title="Telesales, upsells and saved carts">
      {hasAny
        ? <EChart option={option} ariaLabel="Telesales, retained upsell and converted cart value per staff member" className="h-[220px] w-full" animate={!reduceMotion} />
        : <p className="py-10 text-center text-[12px] text-black/55">No telesales, upsells or saved carts in this range.</p>}
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-black/60">
        <span className="inline-flex items-center gap-1.5"><Swatch color={CHART.greys[0]} />Telesales</span>
        <span className="inline-flex items-center gap-1.5"><Swatch color={CHART.greys[2]} />Upsell kept</span>
        <span className="inline-flex items-center gap-1.5"><Swatch color={CHART.greys[3]} />Carts converted</span>
      </div>
      <p className="mt-auto text-[10px] text-black/45">Telesales orders are also counted in confirmed value.</p>
    </Panel>
  );
}
```

- [ ] **Step 4: Update the page** — in `src/pages/StaffPerformance.tsx`:

1. Add `series: StaffSeries;` to `StaffReportResponse` (import `StaffSeries`).
2. Give `SnapshotCard` an optional `spark?: number[]` prop. Inside it, when `spark && spark.length > 1`, render below the description:

```tsx
<EChart option={sparkOption} ariaLabel={`${label} trend`} className="mt-auto h-[30px] w-full" animate={!reduceMotion} />
```

with `const sparkOption = useMemo(() => sparklineOption(spark ?? []), [spark]);` declared at the top of `SnapshotCard` (hooks before any condition).
3. Change the tiles grid to `lg:grid-cols-5` and pass `spark={data.series.buckets.map((b) => b.confirmed_value)}` to the Confirmed value tile and `spark={data.series.buckets.map((b) => b.confirmed_count)}` to Confirmed orders. Memoise both arrays with `useMemo` keyed on `reportQuery.data` above the early returns (hooks must run before `if (reportQuery.isLoading) return …`).
4. Add a fifth tile: `label="Extra revenue"`, value `formatTaka(rankedRows.reduce((sum, row) => sum + extraRevenue(row).total, 0))`, description `"Telesales, upsells and saved carts"`, `testId="staff-performance-summary-extra-revenue"`. It sits inside the same blurred wrapper as the other tiles.
5. After the tiles block (outside the blurred wrapper), add:

```tsx
<section className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
  <LeaderboardPanel rows={rankedRows} reduceMotion={reduceMotion} />
  <OrderYieldPanel rows={rankedRows} reduceMotion={reduceMotion} />
</section>
<section className="grid gap-3 lg:grid-cols-3">
  <TeamFunnelPanel rows={rankedRows} reduceMotion={reduceMotion} />
  <TeamContributionPanel rows={rankedRows} reduceMotion={reduceMotion} />
  <ExtraRevenuePanel rows={rankedRows} reduceMotion={reduceMotion} />
</section>
```

Leave the existing Team performance cards section in place for Task 5.

- [ ] **Step 5: Run to verify pass** — `npx vitest run src/test/staffPerformancePage.test.tsx src/test/staffPerformanceMetrics.test.ts src/test/staffPerformanceCharts.test.ts` → PASS (existing card tests still pass until Task 5).

- [ ] **Step 6: Commit**

```bash
git add src/components/staff-performance/StaffCharts.tsx src/pages/StaffPerformance.tsx src/test/staffPerformancePage.test.tsx
git commit -m "feat: add staff leaderboard, order yield, funnel, contribution and extra revenue charts"
```

---

### Task 5: Team performance table with animated expandable rows

**Files:**
- Create: `src/components/staff-performance/StaffTable.tsx`
- Modify: `src/pages/StaffPerformance.tsx` (replace the Team performance cards section; delete `StaffPerformanceCard`, `DetailGroup` and imports that become unused)
- Test: `src/test/staffPerformancePage.test.tsx`

**Interfaces:**
- Consumes: `buildStaffTableRows`, `sortStaffTableRows`, `extraRevenue`, types (Task 2); `YIELD_KEYS`, `YIELD_LABELS`, `YIELD_COLORS` (Task 3).
- Produces: `StaffTable({ rows }: { rows: StaffRow[] })`. Row `<tr data-testid="staff-performance-row-{user_id}">`, clickable anywhere; toggle button named `Show details for {name}` / `Hide details for {name}` with `aria-expanded`; sortable header buttons named by column label; "Expand all"/"Collapse all" button; table named "Team performance".

- [ ] **Step 1: Write failing tests** — replace the card-specific tests ("stacks team performance cards in a single column", "highlights regular-order outcomes with colorful chips", "shows retained upsell count and value for each staff member", "expands regular-order staff details inline", "shows abandoned-cart activity as a quick-glance chip and in the expanded detail", "hides the abandoned-cart chip when there is no cart activity", "ranks regular-order staff cards by confirmed value without rendering Social Inbox") with:

```tsx
  it("lists the team in a ranked table, most confirmed value first, without Social Inbox", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse()));

    renderPage();

    const table = await screen.findByRole("table", { name: "Team performance" });
    const rows = within(table).getAllByTestId(/^staff-performance-row-/);
    expect(rows[0]).toHaveAttribute("data-testid", `staff-performance-row-${RafiId}`);
    expect(within(rows[1]).getByText(/Former staff/)).toBeInTheDocument();
    expect(screen.queryByText(/Social Inbox/i)).not.toBeInTheDocument();
  });

  it("opens a member's details when any part of the row is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [reportRow({
        orders: metrics({ retained_upsell_count: 2, retained_upsell_value: 600, products: [{ product_id: "p1", product_name: "Mango", packs: 2, kg: 2 }] }),
        abandoned_checkouts: abandonedMetrics({ contacted_count: 4, converted_count: 1, converted_value: 900 }),
      })],
    })));

    renderPage();

    const row = await screen.findByTestId(`staff-performance-row-${RafiId}`);
    await user.click(within(row).getAllByRole("cell")[2]);
    expect(within(row).getByRole("button", { name: "Hide details for Rafi" })).toHaveAttribute("aria-expanded", "true");
    const detail = screen.getByRole("region", { name: "Rafi details" });
    expect(within(detail).getByText("Upsell kept · 2 items")).toBeInTheDocument();
    expect(within(detail).getByText("Contacted").closest("p")).toHaveTextContent("4");
    expect(within(detail).getByRole("table", { name: "Rafi confirmed products" })).toHaveTextContent("Mango");

    await user.click(within(row).getByRole("button", { name: "Hide details for Rafi" }));
    expect(within(row).getByRole("button", { name: "Show details for Rafi" })).toHaveAttribute("aria-expanded", "false");
  });

  it("sorts the table when a column header is clicked and expands everyone at once", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse()));

    renderPage();

    const table = await screen.findByRole("table", { name: "Team performance" });
    await user.click(within(table).getByRole("button", { name: /^Staff/ }));
    expect(within(table).getAllByTestId(/^staff-performance-row-/)[0]).toHaveAttribute("data-testid", `staff-performance-row-${NadiaId}`);

    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(within(table).getByRole("button", { name: "Hide details for Rafi" })).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "Hide details for Nadia" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse all" })).toBeInTheDocument();
  });
```

Keep every other existing test (blur, admin, loading, header, weighted snapshot rates, missing-weight warning, staff filter, all-time, clear filter, retry). If any of those query a card test id, switch them to the row test id.

- [ ] **Step 2: Run to verify failure** — the three new tests FAIL.

- [ ] **Step 3: Implement `src/components/staff-performance/StaffTable.tsx`**

```tsx
import { Fragment, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CaretRight } from "@phosphor-icons/react";
import { YIELD_COLORS, YIELD_KEYS, YIELD_LABELS } from "@/lib/staffPerformanceCharts";
import { buildStaffTableRows, extraRevenue, sortStaffTableRows, type RateFlag, type SortDir, type StaffSortKey, type StaffTableRow } from "@/lib/staffPerformanceMetrics";
import type { StaffRow } from "@/lib/staffPerformancePresentation";

const formatNumber = (value: number) => Number(value || 0).toLocaleString("en-BD");
const formatTaka = (value: number) => `৳${Math.round(value || 0).toLocaleString("en-BD")}`;
const formatKg = (value: number) => `${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })} kg`;
const formatPct = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`);

const COLUMNS: Array<{ key: StaffSortKey | null; label: string; align?: "right" }> = [
  { key: "name", label: "Staff" },
  { key: "assigned", label: "Assigned", align: "right" },
  { key: "confirmed", label: "Confirmed", align: "right" },
  { key: "value", label: "Confirmed value", align: "right" },
  { key: null, label: "Outcome mix" },
  { key: "confRate", label: "Conf. rate", align: "right" },
  { key: "cancelRate", label: "Cancel rate", align: "right" },
  { key: "delRate", label: "Delivered", align: "right" },
  { key: "aov", label: "AOV", align: "right" },
  { key: "kg", label: "Weight", align: "right" },
  { key: "extra", label: "Extra revenue", align: "right" },
];

function Rate({ value, flag }: { value: number | null; flag: RateFlag }) {
  if (flag === "worse") return <span data-flag="worse" className="font-medium text-[#B4473A]">{formatPct(value)}</span>;
  if (flag === "best") return <span data-flag="best" className="font-medium text-[#2F7A55]">{formatPct(value)}</span>;
  return <span>{formatPct(value)}</span>;
}

function YieldBar({ item }: { item: StaffTableRow }) {
  if (item.assigned === 0) return <span className="text-black/35">—</span>;
  return (
    <div className="flex h-2 w-[150px] gap-[2px] overflow-hidden rounded" role="img" aria-label={YIELD_KEYS.map((key) => `${YIELD_LABELS[key]} ${item.yield[key]}`).join(", ")}>
      {YIELD_KEYS.map((key) => item.yield[key] > 0 && (
        <i key={key} className="block h-full" style={{ width: `${(item.yield[key] / item.assigned) * 100}%`, background: YIELD_COLORS[key] }} />
      ))}
    </div>
  );
}

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="grid gap-1">
      <p className="flex justify-between text-[11px]"><span className="text-black/60">{label}</span><span className="tabular-nums">{formatNumber(value)}</span></p>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.08]" aria-hidden="true">
        <div className="h-full rounded-full" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: color }} />
      </div>
    </div>
  );
}

function Detail({ item }: { item: StaffTableRow }) {
  const m = item.row.orders;
  const carts = item.row.abandoned_checkouts;
  const extra = extraRevenue(item.row);
  const totalKg = m.products.reduce((sum, product) => sum + product.kg, 0);
  const totalPacks = m.products.reduce((sum, product) => sum + product.packs, 0);
  const maxKg = Math.max(0, ...m.products.map((product) => product.kg));
  const max = Math.max(m.assigned_count, m.confirmed_count);
  return (
    <section aria-label={`${item.name} details`} className="flex flex-col gap-3 px-3.5 pb-4 pt-3.5">
      <div className="grid gap-2.5 md:grid-cols-3">
        <div className="flex flex-col gap-2 rounded-xl bg-white px-3.5 py-3">
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/60">Order funnel</p>
          <MiniBar label="Assigned" value={m.assigned_count} max={max} color="#0B0B0A" />
          <MiniBar label="Confirmed" value={m.confirmed_count} max={max} color="#0B0B0A" />
          <MiniBar label="Delivered" value={m.delivered_count} max={max} color={YIELD_COLORS.delivered} />
          <MiniBar label="Cancelled" value={m.cancelled_count} max={max} color={YIELD_COLORS.cancelled} />
          <MiniBar label="RTO" value={m.returned_count} max={max} color={YIELD_COLORS.returned} />
        </div>
        <div className="flex flex-col gap-2 rounded-xl bg-white px-3.5 py-3 text-[12px] tabular-nums">
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/60">Extra revenue</p>
          <p className="flex justify-between"><span className="text-black/60">Telesales · {formatNumber(m.telesales_confirmed_count)} orders</span><span>{formatTaka(extra.telesales)}</span></p>
          <p className="flex justify-between"><span className="text-black/60">Upsell kept · {formatNumber(m.retained_upsell_count)} items</span><span>{formatTaka(extra.upsell)}</span></p>
          <p className="flex justify-between"><span className="text-black/60">Carts converted · {formatNumber(carts.converted_count)}</span><span>{formatTaka(extra.carts)}</span></p>
          <p className="mt-auto flex justify-between border-t border-black/[0.08] pt-2 font-medium"><span>Total</span><span>{formatTaka(extra.total)}</span></p>
        </div>
        <div className="flex flex-col gap-2 rounded-xl bg-white px-3.5 py-3 text-[12px] tabular-nums">
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/60">Abandoned carts</p>
          <p className="flex justify-between"><span className="text-black/60">Contacted</span><span>{formatNumber(carts.contacted_count)}</span></p>
          <p className="flex justify-between"><span className="text-black/60">Dismissed</span><span>{formatNumber(carts.dismissed_count)}</span></p>
          <p className="flex justify-between"><span className="text-black/60">Reopened</span><span>{formatNumber(carts.reopened_count)}</span></p>
          <p className="mt-auto flex justify-between border-t border-black/[0.08] pt-2 font-medium">
            <span>Converted</span>
            <span>{formatNumber(carts.converted_count)}{carts.contacted_count > 0 ? ` · ${formatPct((carts.converted_count / carts.contacted_count) * 100)}` : ""}</span>
          </p>
        </div>
      </div>
      <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Confirmed products · {item.name}</p>
      {m.products.length === 0 ? (
        <p className="px-1 text-[11px] text-black/55">No confirmed products in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table aria-label={`${item.name} confirmed products`} className="w-full min-w-[560px] border-collapse rounded-xl bg-white text-[12px] tabular-nums">
            <thead>
              <tr className="border-b border-black/[0.08] text-[8px] uppercase tracking-[0.22em] text-black/55">
                <th scope="col" className="px-3 pb-2 pt-2.5 text-left font-medium">Product</th>
                <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">Packs</th>
                <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">Weight</th>
                <th scope="col" className="w-[40%] px-3 pb-2 pt-2.5 text-left font-medium">Share of kg</th>
              </tr>
            </thead>
            <tbody>
              {m.products.map((product) => (
                <tr key={product.product_id ?? product.product_name} className="border-b border-black/[0.06]">
                  <th scope="row" className="px-3 py-2 text-left font-normal">{product.product_name}</th>
                  <td className="px-3 py-2 text-right">{formatNumber(product.packs)}</td>
                  <td className="px-3 py-2 text-right">{product.kg > 0 ? formatKg(product.kg) : "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/[0.08]" aria-hidden="true"><div className="h-full rounded-full bg-black" style={{ width: `${maxKg > 0 ? (product.kg / maxKg) * 100 : 0}%` }} /></div>
                      <span className="w-9 text-right text-[10px] text-black/45">{totalKg > 0 ? `${Math.round((product.kg / totalKg) * 100)}%` : "—"}</span>
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="bg-black/[0.03] font-semibold">
                <th scope="row" className="px-3 py-2 text-left">All products</th>
                <td className="px-3 py-2 text-right">{formatNumber(totalPacks)}</td>
                <td className="px-3 py-2 text-right">{totalKg > 0 ? formatKg(totalKg) : "—"}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function StaffTable({ rows }: { rows: StaffRow[] }) {
  const tableRows = useMemo(() => buildStaffTableRows(rows), [rows]);
  const [sort, setSort] = useState<{ key: StaffSortKey; dir: SortDir }>({ key: "value", dir: -1 });
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const reduceMotion = useReducedMotion();
  const sorted = useMemo(() => sortStaffTableRows(tableRows, sort.key, sort.dir), [tableRows, sort]);
  const rank = useMemo(() => new Map(sortStaffTableRows(tableRows, "value", -1).map((item, index) => [item.key, index + 1])), [tableRows]);
  const allOpen = tableRows.length > 0 && tableRows.every((item) => open.has(item.key));
  const transition = { duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] as const };

  const toggle = (key: string) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const onSort = (key: StaffSortKey) => setSort((current) => (
    current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: key === "name" || key === "cancelRate" ? 1 : -1 }
  ));

  return (
    <section aria-labelledby="team-performance-heading" className="flex flex-col gap-3 rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 id="team-performance-heading" className="font-sf-display text-[15px] font-semibold text-black">Team performance</h2>
        <div className="h-3.5 w-px bg-black/10" />
        <span className="text-[13px] tabular-nums text-black/60">{formatNumber(rows.length)} {rows.length === 1 ? "member" : "members"}</span>
        <span className="ml-auto hidden text-[11px] text-black/45 sm:inline">Click a column to sort · click a row for details</span>
        <button
          type="button"
          onClick={() => setOpen(allOpen ? new Set() : new Set(tableRows.map((item) => item.key)))}
          className="h-8 rounded-full bg-black/[0.05] px-3 text-[12px] text-black transition-colors hover:bg-black/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <div className="-mx-1 overflow-x-auto px-1">
        <table aria-labelledby="team-performance-heading" className="w-full min-w-[1000px] border-collapse text-[12px] tabular-nums">
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
                    <button type="button" onClick={() => onSort(column.key as StaffSortKey)} className={`uppercase tracking-[0.22em] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 ${sort.key === column.key ? "text-black" : ""}`}>
                      {column.label}{sort.key === column.key && <span aria-hidden="true">{sort.dir === 1 ? " ▴" : " ▾"}</span>}
                    </button>
                  ) : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => {
              const isOpen = open.has(item.key);
              const detailId = `staff-performance-detail-${item.key}`;
              const position = rank.get(item.key) ?? 0;
              return (
                <Fragment key={item.key}>
                  <tr
                    data-testid={`staff-performance-row-${item.key}`}
                    onClick={() => toggle(item.key)}
                    className={`cursor-pointer border-b border-black/[0.09] transition-colors hover:bg-black/[0.03] ${isOpen ? "bg-black/[0.03]" : ""}`}
                  >
                    <td className="px-2.5 py-3">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={detailId}
                        aria-label={`${isOpen ? "Hide" : "Show"} details for ${item.name}`}
                        className="flex items-center gap-2 text-[13px] font-semibold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
                      >
                        <CaretRight weight="light" size={14} className={`transition-transform motion-reduce:transition-none ${isOpen ? "rotate-90" : ""}`} />
                        <span className={`grid h-5 w-5 place-items-center rounded-md text-[10px] ${position === 1 ? "bg-black text-[#FAFAF8]" : "bg-black/[0.06] text-black/60"}`}>{position}</span>
                        {item.name}
                        {!item.isActive && <span className="text-[10px] font-normal text-black/45">· Former staff</span>}
                      </button>
                    </td>
                    <td className="px-2.5 py-3 text-right">{formatNumber(item.assigned)}</td>
                    <td className="px-2.5 py-3 text-right">{formatNumber(item.confirmed)}</td>
                    <td className="px-2.5 py-3 text-right">{formatTaka(item.value)}</td>
                    <td className="px-2.5 py-3"><YieldBar item={item} /></td>
                    <td className="px-2.5 py-3 text-right"><Rate value={item.confRate} flag={item.flags.confRate} /></td>
                    <td className="px-2.5 py-3 text-right"><Rate value={item.cancelRate} flag={item.flags.cancelRate} /></td>
                    <td className="px-2.5 py-3 text-right"><Rate value={item.delRate} flag={item.flags.delRate} /></td>
                    <td className="px-2.5 py-3 text-right">{item.aov === null ? "—" : formatTaka(item.aov)}</td>
                    <td className="px-2.5 py-3 text-right">{formatKg(item.kg)}</td>
                    <td className="px-2.5 py-3 text-right">{formatTaka(item.extra)}</td>
                  </tr>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <tr key="detail" id={detailId} className="bg-black/[0.03]">
                        <td colSpan={COLUMNS.length} className="p-0">
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={transition} className="overflow-hidden">
                            <Detail item={item} />
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-black/60">
        {YIELD_KEYS.map((key) => (
          <span key={key} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ background: YIELD_COLORS[key] }} />{YIELD_LABELS[key]}</span>
        ))}
        <span><span className="font-medium text-[#B4473A]">Red</span> = more than 5 pts worse than the team average</span>
        <span><span className="font-medium text-[#2F7A55]">Green</span> = best on the team</span>
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-[10px] text-black/45">
        <span>Conf. rate = confirmed ÷ assigned · Delivered = delivered ÷ confirmed · AOV = confirmed value ÷ confirmed orders</span>
        <span>Outcome mix covers each member's assigned orders</span>
      </div>
    </section>
  );
}
```

In `src/pages/StaffPerformance.tsx`, replace the Team performance `motion.section` (with its `StaffPerformanceCard` list) by `<StaffTable rows={rankedRows} />`, then delete `StaffPerformanceCard`, `DetailGroup`, and every import/helper that becomes unused (`Chip`, `CaretDown`, `CaretRight`, `AnimatePresence`, `formatKg`, `formatRate` if unused — let lint decide).

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/test/staffPerformancePage.test.tsx` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/staff-performance/StaffTable.tsx src/pages/StaffPerformance.tsx src/test/staffPerformancePage.test.tsx
git commit -m "feat: replace staff cards with a sortable team table and animated details"
```

---

### Task 6: Verification and browser QA

- [ ] `npm test` → all pass, output free of new warnings (a `window.scrollTo` stub already exists in `src/test/setup.ts`).
- [ ] `npm run lint` → 0 errors.
- [ ] `npx tsc --noEmit -p tsconfig.app.json` → count not above the pre-branch baseline; none in touched files.
- [ ] `npm run build` → succeeds; ECharts stays out of the main entry chunk (`grep -c zrender dist/assets/index-*.js` → 0).
- [ ] Visual QA with sample data at 1280px and 390px (temporary harness rendering the new components; never committed): no horizontal page overflow; leaderboard and yield charts look distinct; long staff names truncate; rows open smoothly.
- [ ] Check `/reports/staff` on the local dev server as admin and as a team member (tiles blurred, charts visible).

---

## Self-review notes

- Spec coverage: tiles + sparklines + Extra revenue (T1, T4); leaderboard (T3, T4); order yield over assigned orders (T1-T4); team funnel with confirmation by staff (T2, T4); team contribution donut (T2, T4); extra revenue chart (T3, T4); team table with rank, flags, best, former staff, animated click-anywhere rows, funnel/extra/carts cards and confirmed products (T5); blur preserved (T4).
- Types used across tasks: `StaffSeries` (T2) → T4; `StaffTableRow`, `YieldKey`, `RateFlag`, `StaffSortKey`, `SortDir` (T2) → T3, T5; `YIELD_*` (T3) → T4, T5; `escapeHtml` export (T2) → T3.
