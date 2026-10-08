import { describe, expect, it } from "vitest";
import {
  buildStaffPerformanceSnapshot,
  buildStaffSparks,
  sortStaffPerformanceRows,
  type AbandonedCartMetrics,
  type StaffMetrics,
  type StaffRow,
} from "@/lib/staffPerformancePresentation";

function metrics(overrides: Partial<StaffMetrics> = {}): StaffMetrics {
  return {
    assigned_count: 0,
    handled_count: 0,
    handled_confirmed_count: 0, handled_confirmed_value: 0, handled_confirmed_kg: 0, handled_cancelled_count: 0, handled_cancelled_value: 0,
    handled_delivered_count: 0, handled_delivered_value: 0, handled_returned_count: 0, handled_returned_value: 0,
    confirmed_count: 0,
    confirmed_assigned_count: 0,
    confirmed_assigned_delivered_count: 0,
    confirmed_assigned_returned_count: 0,
    confirmed_assigned_cancelled_count: 0,
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
    retained_upsell_count: 0,
    retained_upsell_value: 0,
    products: [],
    sources: [],
    ...overrides,
  };
}

function abandonedMetrics(overrides: Partial<AbandonedCartMetrics> = {}): AbandonedCartMetrics {
  return {
    contacted_count: 0,
    dismissed_count: 0,
    reopened_count: 0,
    converted_count: 0,
    converted_value: 0,
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
    abandoned_checkouts: abandonedMetrics(),
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

  it("weights team confirmation over handled orders and delivery over confirmed orders", () => {
    const snapshot = buildStaffPerformanceSnapshot([
      makeRow({
        // Assigned and per-activity counters must not drive the rates.
        assigned_count: 100,
        confirmed_assigned_count: 1,
        confirmed_count: 3,
        delivered_count: 9,
        handled_count: 2,
        handled_confirmed_count: 1,
        handled_delivered_count: 1,
        confirmed_value: 2400,
      }),
      makeRow({
        confirmed_count: 5,
        delivered_count: 9,
        handled_count: 8,
        handled_confirmed_count: 5,
        handled_delivered_count: 2,
        confirmed_value: 1200,
      }),
    ]);

    // confirmation = (1 + 5) / (2 + 8) = 0.6; delivered = (1 + 2) / (1 + 5) = 0.5
    expect(snapshot).toEqual({
      confirmedValue: 3600,
      confirmedCount: 8,
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

describe("buildStaffSparks", () => {
  const bucket = (handled: number, confirmed: number, delivered: number, extra: number) => ({
    key: "k",
    label: "l",
    confirmed_count: confirmed,
    confirmed_value: confirmed * 100,
    handled_count: handled,
    handled_confirmed_count: confirmed,
    handled_delivered_count: delivered,
    extra_value: extra,
  });

  it("derives per-bucket rates and carries the last rate over empty buckets", () => {
    const sparks = buildStaffSparks([
      bucket(0, 0, 0, 0),
      bucket(4, 2, 1, 300),
      bucket(0, 0, 0, 0),
      bucket(5, 5, 5, 50),
    ]);

    expect(sparks.value).toEqual([0, 200, 0, 500]);
    expect(sparks.count).toEqual([0, 2, 0, 5]);
    expect(sparks.confirmationRate).toEqual([0.5, 0.5, 0.5, 1]);
    expect(sparks.deliveredRate).toEqual([0.5, 0.5, 0.5, 1]);
    expect(sparks.extra).toEqual([0, 300, 0, 50]);
  });

  it("returns no rate points when no bucket has a denominator", () => {
    const sparks = buildStaffSparks([bucket(0, 0, 0, 0), bucket(0, 0, 0, 0)]);

    expect(sparks.confirmationRate).toEqual([]);
    expect(sparks.deliveredRate).toEqual([]);
  });
});
