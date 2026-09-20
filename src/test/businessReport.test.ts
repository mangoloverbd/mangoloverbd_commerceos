import { afterEach, describe, expect, it, vi } from "vitest";
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
    fulfillment_status: null,
    price: 0,
    delivery_rate: 0,
    courier_fee: null,
    courier_status: null,
    return_status: null,
    ...overrides,
  };
}

function dayRequest() {
  return resolveBusinessReportRequest({
    from: "2026-09-18",
    to: "2026-09-18",
  });
}

describe("business report request", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses exact inclusive Dhaka date bounds and supports All Time", () => {
    expect(dayRequest()).toEqual({
      range: { from: "2026-09-18", to: "2026-09-18" },
      since: "2026-09-17T18:00:00.000Z",
      until: "2026-09-18T18:00:00.000Z",
    });
    expect(resolveBusinessReportRequest({})).toEqual({
      range: { from: null, to: null },
      since: null,
      until: null,
    });
  });

  it("rejects incomplete, invalid, and reversed report date ranges", () => {
    expect(() => resolveBusinessReportRequest({ from: "2026-09-18" }))
      .toThrow("Provide both from and to dates");
    expect(() => resolveBusinessReportRequest({ from: "2026-02-30", to: "2026-03-01" }))
      .toThrow("Invalid report date");
    expect(() => resolveBusinessReportRequest({ from: "2026-09-19", to: "2026-09-18" }))
      .toThrow("Report start date must not be after the end date");
  });

  it("rejects future dates and bounded ranges too large for the daily series", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T06:00:00.000Z"));

    expect(() => resolveBusinessReportRequest({ from: "2025-09-19", to: "2026-09-20" }))
      .toThrow("Report date range must not exceed 366 days");
    expect(() => resolveBusinessReportRequest({ from: "2026-09-20", to: "2026-09-21" }))
      .toThrow("Report date cannot be in the future");
    expect(resolveBusinessReportRequest({ from: "2025-09-20", to: "2026-09-20" }).range)
      .toEqual({ from: "2025-09-20", to: "2026-09-20" });
  });
});

describe("business report normalization", () => {
  it.each([
    ["storefront", "website"],
    ["CUSTOM_WEBSITE_TRACKER", "website"],
    ["facebook", "facebook"],
    ["unknown-source", "manual_other"],
    [null, "manual_other"],
  ])("normalizes source %o to %s", (source, expected) => {
    expect(normalizeBusinessReportSource(source)).toBe(expected);
  });

  it("keeps only canonical Website landing-page paths", () => {
    expect(normalizeBusinessReportLandingPage(" /step/katimon-mango/?utm=meta "))
      .toBe("/step/katimon-mango");
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
    [order({ status: "cancelled", return_status: "completed" }), "returned"],
    [order({ status: "cancelled", courier_status: "returned" }), "returned"],
    [order({ status: "processing", courier_status: "rejected" }), "cancelled"],
    [order({ status: "processing", courier_status: "cancelled_approval_pending" }), "approved"],
    [order({ status: "cancelled", courier_status: "cancelled", return_status: "completed" }), "cancelled"],
    [order({ status: "pending", fulfillment_status: "fulfilled" }), "approved"],
    [order({ status: "pending", fulfillment_status: "partial" }), "approved"],
    [order({ status: "pending", fulfillment_status: "cancelled" }), "cancelled"],
  ])("classifies the current order state as %s", (row, expected) => {
    expect(classifyBusinessReportOutcome(row)).toBe(expected);
  });
});

describe("buildBusinessReport", () => {
  it("aggregates current outcomes, source economics, landing pages, and hourly intake", () => {
    const report = buildBusinessReport([
      order({
        id: "web-approved",
        source: "storefront",
        landing_page_path: "/step/katimon-mango",
        status: "processing",
        price: "1000",
        delivery_rate: "120",
        courier_fee: "80",
      }),
      order({
        id: "web-cancelled",
        created_at: "2026-09-18T04:00:00.000Z",
        source: "website",
        landing_page_path: "invalid",
        status: "cancelled",
        price: 400,
        delivery_rate: 60,
      }),
      order({
        id: "facebook-rto",
        created_at: "2026-09-18T05:00:00.000Z",
        source: "facebook",
        status: "confirmed",
        courier_status: "Return To Hub",
        price: 700,
        delivery_rate: 60,
        courier_fee: 50,
      }),
      order({
        id: "other-pending",
        created_at: "2026-09-18T06:00:00.000Z",
        source: "mystery",
        status: "pending",
        price: 300,
        delivery_rate: 60,
        courier_fee: 0,
      }),
      order({
        id: "outside-range",
        created_at: "2026-09-17T17:59:59.999Z",
        source: "phone",
        status: "confirmed",
        price: 999,
      }),
    ], dayRequest());

    expect(report.range).toEqual({ from: "2026-09-18", to: "2026-09-18" });
    expect(report.summary).toEqual({
      intake_count: 4,
      order_value: 2400,
      approved_count: 1,
      approved_value: 1000,
      cancelled_count: 1,
      cancelled_value: 400,
      returned_count: 1,
      returned_value: 700,
      pending_count: 1,
      pending_value: 300,
      delivery_charged: 120,
      courier_fees_recorded: 130,
      net_delivery_position: -10,
      courier_fee_order_count: 3,
    });
    expect(report.sources.map((source) => source.label))
      .toEqual(["Website", "Facebook", "Manual / Other"]);
    expect(report.sources[0]).toMatchObject({
      source: "website",
      intake_count: 2,
      order_value: 1400,
      approved_count: 1,
      cancelled_count: 1,
      returned_count: 0,
      pending_count: 0,
      delivery_charged: 120,
      courier_fees_recorded: 80,
      net_delivery_position: 40,
      courier_fee_order_count: 1,
    });
    expect(report.sources[0].landing_pages).toEqual([
      {
        path: "/step/katimon-mango",
        label: "/step/katimon-mango",
        intake_count: 1,
        order_value: 1000,
        approved_count: 1,
        cancelled_count: 0,
        returned_count: 0,
        pending_count: 0,
      },
      {
        path: null,
        label: "Other website",
        intake_count: 1,
        order_value: 400,
        approved_count: 0,
        cancelled_count: 1,
        returned_count: 0,
        pending_count: 0,
      },
    ]);
    expect(report.series).toMatchObject({ granularity: "hour", label: "Intake by hour" });
    expect(report.series.buckets).toHaveLength(24);
    expect(report.series.buckets
      .filter((bucket) => bucket.intake_count > 0)
      .map((bucket) => [bucket.label, bucket.intake_count]))
      .toEqual([["9a", 1], ["10a", 1], ["11a", 1], ["12p", 1]]);
  });

  it("fills every bounded Dhaka day in a multi-day intake series", () => {
    const request = resolveBusinessReportRequest({ from: "2026-09-18", to: "2026-09-20" });
    const report = buildBusinessReport([
      order({ id: "first-day", created_at: "2026-09-18T03:00:00.000Z", price: 100 }),
      order({ id: "last-day", created_at: "2026-09-20T03:00:00.000Z", price: 200 }),
    ], request);

    expect(report.series).toMatchObject({ granularity: "day", label: "Intake by day" });
    expect(report.series.buckets.map((bucket) => [bucket.key, bucket.intake_count, bucket.order_value]))
      .toEqual([
        ["2026-09-18", 1, 100],
        ["2026-09-19", 0, 0],
        ["2026-09-20", 1, 200],
      ]);
  });

  it("stops at the requested final day near the calendar maximum", () => {
    const originalToISOString = Date.prototype.toISOString;
    let toISOStringCalls = 0;
    const toISOStringSpy = vi.spyOn(Date.prototype, "toISOString").mockImplementation(function toISOString() {
      toISOStringCalls += 1;
      if (toISOStringCalls > 5) throw new Error("Date series exceeded the requested range");
      return originalToISOString.call(this);
    });

    try {
      const report = buildBusinessReport([], {
        range: { from: "9999-12-30", to: "9999-12-31" },
        since: "9999-12-29T18:00:00.000Z",
        until: "9999-12-31T18:00:00.000Z",
      });

      expect(report.series.buckets.map((bucket) => bucket.key))
        .toEqual(["9999-12-30", "9999-12-31"]);
    } finally {
      toISOStringSpy.mockRestore();
    }
  });

  it("keeps the most recent 30 active Dhaka days in chronological order for All Time", () => {
    const orders = Array.from({ length: 31 }, (_, index) => order({
      id: `day-${index}`,
      created_at: new Date(Date.UTC(2026, 7, 19 + index, 3)).toISOString(),
      price: index + 1,
    }));

    const report = buildBusinessReport(orders, resolveBusinessReportRequest({}));

    expect(report.series).toMatchObject({
      granularity: "day",
      label: "Recent intake activity",
    });
    expect(report.series.buckets).toHaveLength(30);
    expect(report.series.buckets[0]?.key).toBe("2026-08-20");
    expect(report.series.buckets.at(-1)?.key).toBe("2026-09-18");
  });
});
