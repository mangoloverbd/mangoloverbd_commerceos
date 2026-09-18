import { describe, expect, it } from "vitest";
import {
  buildStaffPerformanceSnapshot,
  sortStaffPerformanceRows,
  type StaffMetrics,
  type StaffRow,
} from "@/lib/staffPerformancePresentation";

function metrics(overrides: Partial<StaffMetrics> = {}): StaffMetrics {
  return {
    assigned_count: 0,
    confirmed_count: 0,
    confirmed_assigned_count: 0,
    confirmed_value: 0,
    confirmed_kg: 0,
    confirmation_rate: null,
    average_order_value: null,
    cancelled_count: 0,
    cancelled_assigned_count: 0,
    cancelled_value: 0,
    cancellation_rate: null,
    delivered_count: 0,
    delivered_value: 0,
    delivered_rate: null,
    returned_count: 0,
    returned_value: 0,
    telesales_confirmed_count: 0,
    telesales_confirmed_value: 0,
    telesales_confirmed_kg: 0,
    products: [],
    ...overrides,
  };
}

function makeRow(
  { display_name = "Staff", ...orderOverrides }: Partial<StaffMetrics> & { display_name?: string } = {},
): StaffRow {
  return {
    user_id: `user-${display_name.toLowerCase()}`,
    display_name,
    is_active: true,
    orders: metrics(orderOverrides),
    social_inbox_orders: metrics({
      assigned_count: 999,
      confirmed_count: 999,
      confirmed_assigned_count: 999,
      confirmed_value: 999999,
      delivered_count: 999,
    }),
  };
}

describe("staff performance presentation", () => {
  it("ranks regular-order staff by confirmed value without mutating the report rows", () => {
    const rows = [
      makeRow({ display_name: "Zara", confirmed_value: 1200 }),
      makeRow({ display_name: "Asha", confirmed_value: 1200 }),
      makeRow({ display_name: "Rafi", confirmed_value: 1800 }),
    ];

    expect(sortStaffPerformanceRows(rows).map((row) => row.display_name))
      .toEqual(["Rafi", "Asha", "Zara"]);
    expect(rows.map((row) => row.display_name)).toEqual(["Zara", "Asha", "Rafi"]);
  });

  it("weights team confirmation and delivery rates from regular-order totals", () => {
    const snapshot = buildStaffPerformanceSnapshot([
      makeRow({
        assigned_count: 2,
        confirmed_assigned_count: 2,
        confirmed_count: 2,
        delivered_count: 2,
        confirmed_value: 2400,
      }),
      makeRow({
        assigned_count: 8,
        confirmed_assigned_count: 4,
        confirmed_count: 4,
        delivered_count: 1,
        confirmed_value: 1200,
      }),
    ]);

    expect(snapshot).toEqual({
      confirmedValue: 3600,
      confirmedCount: 6,
      confirmationRate: 0.6,
      deliveredRate: 0.5,
    });
  });

  it("reports unavailable rates when regular-order denominators are zero", () => {
    expect(buildStaffPerformanceSnapshot([makeRow()])).toEqual({
      confirmedValue: 0,
      confirmedCount: 0,
      confirmationRate: null,
      deliveredRate: null,
    });
  });
});
