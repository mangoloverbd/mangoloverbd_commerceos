import { describe, expect, it } from "vitest";
import { biggestDrop, funnelSteps, healthSummary, peakHour, percentDelta, sourceLabel, sourcePerformance, timeAgo, type WebsiteTotals } from "@/lib/websiteAnalytics";
import { groupSlices, trafficOption } from "@/lib/websiteAnalyticsCharts";

const totals: WebsiteTotals = { sessions: 200, visitors: 150, new_visitors: 120, pageviews: 600, product_views: 260, engaged_seconds: 0, bounced_sessions: 60,
  product_sessions: 140, cart_sessions: 30, checkout_sessions: 20, ordered_sessions: 12, orders: 13, delivered_sessions: 8,
  reached_product_sessions: 150, reached_checkout_sessions: 24 };

describe("website analytics metrics", () => {
  it("builds the funnel from cumulative stages and leaves the optional cart out", () => {
    expect(funnelSteps(totals).map((step) => [step.key, step.value])).toEqual([
      ["visits", 200], ["product", 150], ["checkout", 24], ["order", 12], ["delivered", 8],
    ]);
  });
  it("finds the website step that loses the most visits, ignoring delivery", () => {
    expect(biggestDrop(funnelSteps(totals))).toEqual({ index: 1, kept: 24 / 150 });
    expect(biggestDrop(funnelSteps({ ...totals, delivered_sessions: 0 }))?.index).toBe(1);
    expect(biggestDrop(funnelSteps({ ...totals, sessions: 0, reached_product_sessions: 0, reached_checkout_sessions: 0, ordered_sessions: 0 }))).toBeNull();
  });
  it("shows no percentage change against an empty previous period", () => {
    expect(percentDelta(10, 0)).toBeNull();
    expect(percentDelta(150, 100)).toEqual({ text: "+50%", tone: "good" });
    expect(percentDelta(50, 100)).toEqual({ text: "−50%", tone: "bad" });
  });
  it("names sources and separates paid traffic", () => {
    expect(sourceLabel("facebook", "paid")).toBe("Facebook ads");
    expect(sourceLabel("facebook", "social")).toBe("Facebook");
    expect(sourceLabel("campaign_link", "campaign_link")).toBe("Campaign links");
    expect(sourceLabel("m.example.com", "referral")).toBe("m.example.com");
  });
  it("joins visits with credited orders and keeps sources that only have orders", () => {
    const rows = sourcePerformance(
      [{ source: "direct", medium: "none", sessions: 80, visitors: 60, bounced_sessions: 30, ordered_sessions: 3, orders: 4 }],
      [{ source: "facebook", medium: "paid", orders: 9, placed_value: 0, delivered: 6, delivered_value: 7200, partial_delivered: 0, returned: 1, cancelled: 1, active: 1 }],
    );
    expect(rows.map((row) => [row.source, row.sessions, row.economics?.orders ?? null])).toEqual([["direct", 80, null], ["facebook", 0, 9]]);
  });
  it("groups small sources into Other and finds the peak hour", () => {
    expect(groupSlices([1, 2, 3, 4, 5, 6].map((value) => ({ label: `s${value}`, value })), 4).map((slice) => slice.label)).toEqual(["s6", "s5", "s4", "s3", "Other"]);
    expect(peakHour([{ hour: 9, sessions: 3 }, { hour: 21, sessions: 8 }])).toEqual({ hour: 21, sessions: 8 });
    expect(peakHour([{ hour: 9, sessions: 0 }])).toBeNull();
  });
  it("summarises data health and recency", () => {
    const base = { latest_event_at: null, collecting: true, rollup: { last_succeeded_at: null, last_failed_at: null, healthy: true }, matched_orders: 0, website_orders: 0, order_coverage: null, direct_sessions: 0, direct_share: null };
    expect(healthSummary(base)).toEqual({ label: "Healthy", tone: "ok" });
    expect(healthSummary({ ...base, collecting: false }).label).toBe("Not collecting");
    expect(healthSummary({ ...base, rollup: { ...base.rollup, healthy: false } }).label).toBe("Summary late");
    expect(timeAgo(new Date(Date.now() - 5 * 60000).toISOString())).toBe("5 min ago");
    expect(timeAgo(null)).toBe("never");
  });
  it("highlights the busiest day and overlays the previous period", () => {
    const daily = [{ day: "2026-10-01", sessions: 1, visitors: 3, pageviews: 1, ordered_sessions: 0 }, { day: "2026-10-02", sessions: 1, visitors: 9, pageviews: 1, ordered_sessions: 1 }];
    const option = trafficOption(daily, daily, "visitors") as { series: Array<{ data: Array<{ value: number; itemStyle?: { color: string } } | number> }> };
    expect(option.series).toHaveLength(2);
    const bars = option.series[0].data as Array<{ value: number; itemStyle: { color: string } }>;
    expect(bars[1].itemStyle.color).toBe("#F28C28");
    expect(bars[0].itemStyle.color).not.toBe("#F28C28");
  });
});
