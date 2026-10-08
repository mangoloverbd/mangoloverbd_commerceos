import { orderSourceLabel } from "@/lib/orderSource";
import type { SourceDetail, StaffRow } from "@/lib/staffPerformancePresentation";

export const STAFF_FLAG_POINTS = 5;

export type YieldKey = "delivered" | "inTransit" | "returned" | "cancelled";
export type StaffYield = Record<YieldKey, number>;
export type RateFlag = "best" | "worse" | null;

export type StaffTableRow = {
  key: string;
  name: string;
  isActive: boolean;
  handled: number;
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

export type StaffSortKey = "name" | "handled" | "confirmed" | "value" | "confRate" | "cancelRate" | "delRate" | "aov" | "kg" | "extra";
export type SortDir = 1 | -1;

const pct = (numerator: number, denominator: number): number | null => (denominator > 0 ? (numerator / denominator) * 100 : null);

export function extraRevenue(row: StaffRow) {
  const telesales = row.orders.telesales_confirmed_value || 0;
  const upsell = row.orders.retained_upsell_value || 0;
  const carts = row.abandoned_checkouts.converted_value || 0;
  return { telesales, upsell, carts, total: telesales + upsell + carts };
}

// Handled = orders a member confirmed or cancelled, each counted once and
// classified by the member's last action, so confirmed + cancelled = handled.
function staffYield(row: StaffRow): StaffYield {
  const m = row.orders;
  const delivered = m.handled_delivered_count || 0;
  const returned = m.handled_returned_count || 0;
  return {
    delivered,
    inTransit: Math.max(0, (m.handled_confirmed_count || 0) - delivered - returned),
    returned,
    cancelled: m.handled_cancelled_count || 0,
  };
}

function flagFor(value: number | null, average: number | null, best: number | null, higherIsBetter: boolean, allowBest: boolean): RateFlag {
  if (value === null || average === null) return null;
  if (allowBest && best !== null && value === best) return "best";
  // The 1e-9 tolerance ignores float noise (11 / 20 * 100 = 55.00000000000001), so a gap of exactly 5 points is never flagged.
  const worse = higherIsBetter ? value < average - STAFF_FLAG_POINTS - 1e-9 : value > average + STAFF_FLAG_POINTS + 1e-9;
  return worse ? "worse" : null;
}

// Team rates over every row; the table flags compare each member against these.
export function staffTeamAverages(rows: StaffRow[]) {
  const totals = rows.reduce((sum, row) => ({
    handled: sum.handled + (row.orders.handled_count || 0),
    cancelled: sum.cancelled + (row.orders.handled_cancelled_count || 0),
    confirmed: sum.confirmed + (row.orders.handled_confirmed_count || 0),
    delivered: sum.delivered + (row.orders.handled_delivered_count || 0),
  }), { handled: 0, cancelled: 0, confirmed: 0, delivered: 0 });
  return {
    confRate: pct(totals.confirmed, totals.handled),
    cancelRate: pct(totals.cancelled, totals.handled),
    delRate: pct(totals.delivered, totals.confirmed),
  };
}

export function buildStaffTableRows(rows: StaffRow[]): StaffTableRow[] {
  const averages = staffTeamAverages(rows);
  const base = rows.map((row) => {
    const m = row.orders;
    const segments = staffYield(row);
    const handled = m.handled_count || 0;
    const confirmed = m.handled_confirmed_count || 0;
    return {
      key: row.user_id,
      name: row.display_name,
      isActive: row.is_active,
      handled,
      confirmed,
      value: m.handled_confirmed_value || 0,
      kg: m.handled_confirmed_kg || 0,
      aov: confirmed > 0 ? (m.handled_confirmed_value || 0) / confirmed : null,
      confRate: pct(confirmed, handled),
      cancelRate: pct(segments.cancelled, handled),
      delRate: pct(segments.delivered, confirmed),
      yield: segments,
      deliveredShare: pct(segments.delivered, handled),
      extra: extraRevenue(row).total,
      row,
    };
  });
  const withHandled = base.filter((item) => item.handled > 0);
  const allowBest = withHandled.length >= 2;
  // No leader when every compared value ties (e.g. everyone at 0% delivered).
  const bestOf = (values: Array<number | null>, pick: (a: number, b: number) => number) => {
    const present = values.filter((value): value is number => value !== null);
    if (present.length === 0 || present.every((value) => value === present[0])) return null;
    return present.reduce((a, b) => pick(a, b));
  };
  const best = {
    confRate: bestOf(withHandled.map((item) => item.confRate), Math.max),
    cancelRate: bestOf(withHandled.map((item) => item.cancelRate), Math.min),
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

export type TeamFunnel = { handled: number; confirmed: number; delivered: number; returned: number; inTransit: number; cancelled: number };

export function buildTeamFunnel(rows: StaffRow[]): TeamFunnel {
  return rows.reduce<TeamFunnel>((sum, row) => {
    const segments = staffYield(row);
    return {
      handled: sum.handled + (row.orders.handled_count || 0),
      confirmed: sum.confirmed + (row.orders.handled_confirmed_count || 0),
      delivered: sum.delivered + segments.delivered,
      returned: sum.returned + segments.returned,
      inTransit: sum.inTransit + segments.inTransit,
      cancelled: sum.cancelled + segments.cancelled,
    };
  }, { handled: 0, confirmed: 0, delivered: 0, returned: 0, inTransit: 0, cancelled: 0 });
}

export type ShareSlice = { label: string; value: number };

export function groupStaffShare(rows: StaffRow[], maxSlices = 4): ShareSlice[] {
  const sorted = rows
    .filter((row) => row.orders.confirmed_value > 0)
    .sort((a, b) => b.orders.confirmed_value - a.orders.confirmed_value);
  const shown = sorted.length === maxSlices + 1 ? sorted.length : maxSlices;
  const top = sorted.slice(0, shown).map((row) => ({ label: row.display_name, value: row.orders.confirmed_value }));
  const rest = sorted.slice(shown).reduce((sum, row) => sum + row.orders.confirmed_value, 0);
  return rest > 0 ? [...top, { label: "Other", value: rest }] : top;
}

export type StaffSourceRow = {
  source: string;
  label: string;
  handled: number;
  confirmed: number;
  cancelled: number;
  delivered: number;
  returned: number;
  value: number;
  confRate: number | null;
  teamConfRate: number | null;
  yield: StaffYield;
  flag: RateFlag;
};

// One member's handled orders by source, each confirmation rate flagged against the team's rate for that same source.
export function buildStaffSourceRows(rows: StaffRow[], userId: string): StaffSourceRow[] {
  const member = rows.find((row) => row.user_id === userId);
  if (!member) return [];
  const sourcesOf = (row: StaffRow) => row.orders.sources ?? [];
  return sourcesOf(member).filter((detail) => detail.handled_count > 0).map((detail) => {
    const peers = rows.map((row) => sourcesOf(row).find((other) => other.source === detail.source)).filter((other): other is SourceDetail => !!other && other.handled_count > 0);
    const team = peers.reduce((sum, other) => ({ handled: sum.handled + other.handled_count, confirmed: sum.confirmed + other.confirmed_count }), { handled: 0, confirmed: 0 });
    const rates = peers.map((other) => pct(other.confirmed_count, other.handled_count) as number);
    const best = rates.length >= 2 && !rates.every((rate) => rate === rates[0]) ? Math.max(...rates) : null;
    const confRate = pct(detail.confirmed_count, detail.handled_count);
    const teamConfRate = pct(team.confirmed, team.handled);
    const inTransit = Math.max(0, detail.confirmed_count - detail.delivered_count - detail.returned_count);
    return {
      source: detail.source,
      label: orderSourceLabel(detail.source),
      handled: detail.handled_count,
      confirmed: detail.confirmed_count,
      cancelled: detail.cancelled_count,
      delivered: detail.delivered_count,
      returned: detail.returned_count,
      value: detail.confirmed_value,
      confRate,
      teamConfRate,
      yield: { delivered: detail.delivered_count, inTransit, returned: detail.returned_count, cancelled: detail.cancelled_count },
      flag: flagFor(confRate, teamConfRate, best, true, best !== null),
    };
  });
}
