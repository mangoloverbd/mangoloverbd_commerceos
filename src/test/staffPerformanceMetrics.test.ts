import { describe, expect, it } from "vitest";
import type { AbandonedCartMetrics, StaffMetrics, StaffRow } from "@/lib/staffPerformancePresentation";
import {
  buildStaffSourceRows,
  buildStaffTableRows,
  buildTeamFunnel,
  extraRevenue,
  groupStaffShare,
  sortStaffTableRows,
  staffTeamAverages,
} from "@/lib/staffPerformanceMetrics";

function metrics(overrides: Partial<StaffMetrics> = {}): StaffMetrics {
  return {
    assigned_count: 0, handled_count: 0, handled_confirmed_count: 0, handled_confirmed_value: 0, handled_confirmed_kg: 0, handled_cancelled_count: 0, handled_cancelled_value: 0,
    handled_delivered_count: 0, handled_delivered_value: 0, handled_returned_count: 0, handled_returned_value: 0, confirmed_count: 0, confirmed_assigned_count: 0, confirmed_assigned_delivered_count: 0,
    confirmed_assigned_returned_count: 0, confirmed_assigned_cancelled_count: 0, confirmed_value: 0, confirmed_kg: 0, confirmation_rate: null,
    average_order_value: null, cancelled_count: 0, cancelled_assigned_count: 0, cancelled_value: 0,
    cancellation_rate: null, delivered_count: 0, delivered_value: 0, delivered_rate: null, returned_count: 0,
    returned_value: 0, telesales_confirmed_count: 0, telesales_confirmed_value: 0, telesales_confirmed_kg: 0,
    retained_upsell_count: 0, retained_upsell_value: 0, products: [], sources: [], ...overrides,
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
  handled_confirmed_value: 88000, handled_confirmed_kg: 200,
  confirmed_count: 90, cancelled_count: 999, delivered_count: 999, returned_count: 999,
  confirmed_value: 95000, confirmed_kg: 220, telesales_confirmed_value: 5000, retained_upsell_value: 2000,
  assigned_count: 5, confirmed_assigned_count: 5, cancelled_assigned_count: 0,
}, { abandoned_checkouts: carts({ converted_value: 1000 }) });
const rahim = row("r", "Rahim", {
  handled_count: 100, handled_confirmed_count: 72, handled_cancelled_count: 28,
  handled_delivered_count: 50, handled_returned_count: 8,
  handled_confirmed_value: 70000, handled_confirmed_kg: 170,
  confirmed_count: 72, confirmed_value: 70000, confirmed_kg: 170,
});
const idle = row("i", "Idle", {}, { is_active: false });

describe("buildStaffTableRows", () => {
  it("derives rates, yield segments over handled orders, and flags versus the team average", () => {
    const [s, r, i] = buildStaffTableRows([sadia, rahim, idle]);

    // conf = 88 / 100, cancel = 12 / 100
    expect(s).toMatchObject({ key: "s", name: "Sadia", handled: 100, confirmed: 88, value: 88000, confRate: 88, cancelRate: 12, kg: 200, aov: 1000, extra: 8000, isActive: true });
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

  it("takes value, weight and AOV from the handled confirmed orders so value / orders = AOV", () => {
    // Brief's A/B/C shape: activity counters say 2 confirmations worth ৳1,500; only A is still confirmed.
    const abc = row("a", "ABC", {
      handled_count: 3, handled_confirmed_count: 1, handled_confirmed_value: 1000, handled_confirmed_kg: 2,
      handled_cancelled_count: 2, handled_delivered_count: 1,
      confirmed_count: 2, confirmed_value: 1500, confirmed_kg: 5,
    });
    const [item] = buildStaffTableRows([abc]);
    expect(item).toMatchObject({ confirmed: 1, value: 1000, kg: 2, aov: 1000 });
    expect(buildStaffTableRows([row("z", "Zero", { confirmed_value: 500, confirmed_count: 1 })])[0].aov).toBeNull();
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

  it("never marks anyone best when every compared value ties", () => {
    // Both members confirmed everything and delivered nothing: all rates tie, so no one leads.
    const a = row("a", "A", { handled_count: 10, handled_confirmed_count: 10 });
    const b = row("b", "B", { handled_count: 20, handled_confirmed_count: 20 });
    const rows = buildStaffTableRows([a, b]);
    for (const item of rows) expect(item.flags).toEqual({ confRate: null, cancelRate: null, delRate: null });
  });

  it("still marks a real leader best when others are strictly lower", () => {
    const leader = row("l", "Leader", { handled_count: 10, handled_confirmed_count: 10, handled_delivered_count: 9 });
    const tied = row("t", "Tied", { handled_count: 10, handled_confirmed_count: 10, handled_delivered_count: 8 });
    const [l, t] = buildStaffTableRows([leader, tied]);
    // conf and cancel tie at 100% / 0%, so only the delivered rate has a leader.
    expect(l.flags).toEqual({ confRate: null, cancelRate: null, delRate: "best" });
    expect(t.flags).toEqual({ confRate: null, cancelRate: null, delRate: null });
  });
});

describe("worse flag tolerance", () => {
  it("does not flag a gap that is exactly 5 points once float noise is ignored", () => {
    // 11 / 20 * 100 = 55.00000000000001 in floating point; team = 20 / 40 = 50%.
    const high = row("h", "High", { handled_count: 20, handled_confirmed_count: 9, handled_cancelled_count: 11 });
    const low = row("l", "Low", { handled_count: 20, handled_confirmed_count: 11, handled_cancelled_count: 9 });
    const [h] = buildStaffTableRows([high, low]);
    expect(h.cancelRate).toBeGreaterThan(55);
    expect(h.flags.cancelRate).toBeNull();
    expect(h.flags.confRate).toBeNull(); // 45% confirmed vs 50% team, exactly 5 below
  });

  it("still flags a gap just over 5 points", () => {
    // 40% vs team 34.96% = 5.04 points above.
    const high = row("h", "High", { handled_count: 2500, handled_confirmed_count: 1500, handled_cancelled_count: 1000 });
    const low = row("l", "Low", { handled_count: 2500, handled_confirmed_count: 1752, handled_cancelled_count: 748 });
    const [h] = buildStaffTableRows([high, low]);
    expect(h.flags.cancelRate).toBe("worse");
    expect(h.flags.confRate).toBe("worse");
  });
});

describe("staffTeamAverages", () => {
  it("returns the team rates the flags are measured against", () => {
    const averages = staffTeamAverages([sadia, rahim, idle]);
    expect(averages).toEqual({ confRate: 80, cancelRate: 20, delRate: 80 });
    expect(staffTeamAverages([idle])).toEqual({ confRate: null, cancelRate: null, delRate: null });
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

describe("buildStaffSourceRows", () => {
  const source = (name: string, handled: number, confirmed: number, delivered = 0, returned = 0) => ({
    source: name, handled_count: handled, confirmed_count: confirmed, confirmed_value: confirmed * 100,
    cancelled_count: handled - confirmed, delivered_count: delivered, returned_count: returned,
  });

  it("labels each source and flags a confirmation rate against the team rate for that same source", () => {
    const rows = [
      row("a", "Abeda", { sources: [source("website", 10, 9, 6, 1), source("facebook", 10, 5)] }),
      row("b", "Bashir", { sources: [source("website", 10, 7), source("facebook", 10, 9)] }),
    ];

    const result = buildStaffSourceRows(rows, "a");

    expect(result.map((item) => item.label)).toEqual(["Website", "Facebook"]);
    expect(result[0]).toMatchObject({ handled: 10, confirmed: 9, cancelled: 1, value: 900, confRate: 90, teamConfRate: 80, flag: "best" });
    expect(result[0].yield).toEqual({ delivered: 6, inTransit: 2, returned: 1, cancelled: 1 });
    // Facebook team rate is 70%; Abeda's 50% is 20 points below.
    expect(result[1]).toMatchObject({ confRate: 50, teamConfRate: 70, flag: "worse" });
  });

  it("never marks a lone member best and skips sources with no handled orders", () => {
    const rows = [row("a", "Abeda", { sources: [source("phone", 4, 3), source("whatsapp", 0, 0)] })];

    const result = buildStaffSourceRows(rows, "a");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ source: "phone", label: "Phone", flag: null });
  });
});
