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
    confirmed_assigned_returned_count: 0, confirmed_assigned_cancelled_count: 0, confirmed_value: 0, confirmed_kg: 0, confirmation_rate: null,
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
    expect(r.flags).toEqual({ confRate: "worse", cancelRate: "worse", delRate: "worse" }); // 52/70 = 74.3 < 83.5 - 5
    expect(i).toMatchObject({ assigned: 0, confRate: null, cancelRate: null, delRate: null, deliveredShare: null, isActive: false });
    expect(i.flags).toEqual({ confRate: null, cancelRate: null, delRate: null });
  });

  it("does not double count an assigned order that was confirmed and then cancelled", () => {
    const flip = row("f", "Flip", {
      assigned_count: 10, confirmed_assigned_count: 6, cancelled_assigned_count: 3, confirmed_assigned_cancelled_count: 1,
      confirmed_assigned_delivered_count: 3, confirmed_assigned_returned_count: 1,
    });
    const [f] = buildStaffTableRows([flip]);
    expect(f.yield).toEqual({ delivered: 3, inTransit: 1, returned: 1, cancelled: 3, notConfirmed: 2 });
    expect(Object.values(f.yield).reduce((sum, value) => sum + value, 0)).toBe(10);
    expect(buildTeamFunnel([flip]).confirmed).toBe(5);
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

  it("names a single leftover member instead of folding it into Other", () => {
    const five = ["A", "B", "C", "D", "E"].map((name, index) => row(name, name, { confirmed_value: 600 - index * 100 }));
    expect(groupStaffShare(five, 4)).toEqual([
      { label: "A", value: 600 }, { label: "B", value: 500 }, { label: "C", value: 400 }, { label: "D", value: 300 }, { label: "E", value: 200 },
    ]);
  });
});

describe("extraRevenue", () => {
  it("adds telesales, retained upsell and converted cart value", () => {
    expect(extraRevenue(sadia)).toEqual({ telesales: 5000, upsell: 2000, carts: 1000, total: 8000 });
  });
});
