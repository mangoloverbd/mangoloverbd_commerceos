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
    assigned_count: 0, handled_count: 0, handled_confirmed_count: 0, handled_confirmed_value: 0, handled_confirmed_kg: 0, handled_cancelled_count: 0, handled_cancelled_value: 0,
    handled_delivered_count: 0, handled_delivered_value: 0, handled_returned_count: 0, handled_returned_value: 0, confirmed_count: 0, confirmed_assigned_count: 0, confirmed_assigned_delivered_count: 0,
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

// Handled basis: each order counted once by the member's last action, so
// handled_confirmed + handled_cancelled = handled. The assigned and
// per-activity counters are deliberately misleading: the rates must ignore them.
const sadia = row("s", "Sadia", {
  handled_count: 100, handled_confirmed_count: 88, handled_cancelled_count: 12,
  handled_delivered_count: 78, handled_returned_count: 2,
  confirmed_count: 90, cancelled_count: 999, delivered_count: 999, returned_count: 999,
  confirmed_value: 90000, confirmed_kg: 220, telesales_confirmed_value: 5000, retained_upsell_value: 2000,
  assigned_count: 5, confirmed_assigned_count: 5, cancelled_assigned_count: 0,
}, { abandoned_checkouts: carts({ converted_value: 1000 }) });
const rahim = row("r", "Rahim", {
  handled_count: 100, handled_confirmed_count: 72, handled_cancelled_count: 28,
  handled_delivered_count: 50, handled_returned_count: 8,
  confirmed_count: 72, confirmed_value: 70000, confirmed_kg: 170,
});
const idle = row("i", "Idle", {}, { is_active: false });

describe("buildStaffTableRows", () => {
  it("derives rates, yield segments over handled orders, and flags versus the team average", () => {
    const [s, r, i] = buildStaffTableRows([sadia, rahim, idle]);

    // conf = 88 / 100, cancel = 12 / 100
    expect(s).toMatchObject({ key: "s", name: "Sadia", handled: 100, confirmed: 88, value: 90000, confRate: 88, cancelRate: 12, kg: 220, aov: 1000, extra: 8000, isActive: true });
    expect(s.delRate).toBeCloseTo(88.64, 1); // 78 / 88
    expect(s.yield).toEqual({ delivered: 78, inTransit: 8, returned: 2, cancelled: 12 });
    expect(Object.values(s.yield).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(s.deliveredShare).toBe(78);
    expect(r).toMatchObject({ handled: 100, confRate: 72 });
    expect(r.cancelRate).toBeCloseTo(28, 6);
    expect(r.yield).toEqual({ delivered: 50, inTransit: 14, returned: 8, cancelled: 28 });
    // team: conf 160/200 = 80, cancel 40/200 = 20, delivered 128/160 = 80
    expect(s.flags).toEqual({ confRate: "best", cancelRate: "best", delRate: "best" });
    expect(r.flags).toEqual({ confRate: "worse", cancelRate: "worse", delRate: "worse" }); // 50/72 = 69.4 < 80 - 5
    expect(i).toMatchObject({ handled: 0, confRate: null, cancelRate: null, delRate: null, deliveredShare: null, isActive: false });
    expect(i.flags).toEqual({ confRate: null, cancelRate: null, delRate: null });
  });

  it("keeps the outcome segments summing to handled even when activity counters repeat", () => {
    // Reviewer's case: cancel -> reopen -> cancel and confirm -> cancel -> reconfirm inflate the activity counters.
    const repeated = row("x", "Repeat", {
      handled_count: 2, handled_confirmed_count: 1, handled_cancelled_count: 1, handled_delivered_count: 1,
      confirmed_count: 2, cancelled_count: 3, delivered_count: 2,
    });
    const flip = row("f", "Flip", {
      handled_count: 10, handled_confirmed_count: 5, handled_cancelled_count: 5, handled_delivered_count: 3, handled_returned_count: 1,
    });
    const rows = buildStaffTableRows([repeated, flip, sadia, rahim, idle]);
    for (const item of rows) {
      expect(Object.values(item.yield).reduce((sum, value) => sum + value, 0)).toBe(item.handled);
    }
    expect(rows[0]).toMatchObject({ handled: 2, confirmed: 1, confRate: 50, cancelRate: 50, delRate: 100 });
    expect(rows[1].yield).toEqual({ delivered: 3, inTransit: 1, returned: 1, cancelled: 5 });
    expect(buildTeamFunnel([repeated, flip])).toMatchObject({ handled: 12, confirmed: 6, cancelled: 6 });
  });

  it("never marks anyone best when fewer than two members have handled orders", () => {
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
  it("sums the handled population and its outcomes", () => {
    expect(buildTeamFunnel([sadia, rahim, idle])).toEqual({
      handled: 200, confirmed: 160, delivered: 128, returned: 10, inTransit: 22, cancelled: 40,
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
