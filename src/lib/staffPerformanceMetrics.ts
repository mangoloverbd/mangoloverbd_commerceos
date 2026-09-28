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
    return present.length ? present.reduce((a, b) => pick(a, b)) : null;
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
