import { describe, expect, it } from "vitest";
import { trendPoints, dhakaDateLabel, periodLabel } from "@/components/home/metricTrend";

describe("trendPoints", () => {
  it("turns running totals back into each hour's own value", () => {
    const points = trendPoints({ series: [0, 1080, 1080, 1580], previous_series: [200, 200, 700, 900] }, "hour", "2026-10-05T18:00:00.000Z");

    expect(points.map((point) => point.current)).toEqual([0, 1080, 0, 500]);
    expect(points.map((point) => point.previous)).toEqual([200, 0, 500, 200]);
    expect(points.map((point) => point.label)).toEqual(["12 AM", "1 AM", "2 AM", "3 AM"]);
  });

  it("labels day buckets with Dhaka dates", () => {
    const points = trendPoints({ series: [100, 150, 150], previous_series: null }, "day", "2026-09-29T18:00:00.000Z");

    expect(points.map((point) => point.label)).toEqual(["Sep 30", "Oct 1", "Oct 2"]);
    expect(points.map((point) => point.current)).toEqual([100, 50, 0]);
    expect(points.every((point) => point.previous === null)).toBe(true);
  });

  it("charts a rate's own per-bucket values instead of differencing its running series", () => {
    const points = trendPoints(
      { series: [0, 6, 2], previous_series: [0, 4, 4], buckets: [0, 6, 0.67], previous_buckets: [0, 4, 0] },
      "hour",
      "2026-10-05T18:00:00.000Z",
    );
    expect(points.map((point) => point.current)).toEqual([0, 6, 0.67]);
    expect(points.map((point) => point.previous)).toEqual([0, 4, 0]);
  });

  it("has nothing to chart without a series", () => {
    expect(trendPoints({ series: null, previous_series: null }, "hour", "2026-10-05T18:00:00.000Z")).toEqual([]);
  });
});

describe("dhakaDateLabel", () => {
  it("names the Dhaka day an instant falls on", () => {
    expect(dhakaDateLabel("2026-10-05T18:00:00.000Z")).toBe("Oct 6, 2026");
  });
});

describe("periodLabel", () => {
  it("shows one date for a single day and a span for several", () => {
    expect(periodLabel("2026-10-05T18:00:00.000Z", "2026-10-06T12:37:00.000Z")).toBe("Oct 6, 2026");
    expect(periodLabel("2026-09-29T18:00:00.000Z", "2026-10-05T18:00:00.000Z")).toBe("Sep 30, 2026 – Oct 5, 2026");
  });
});
