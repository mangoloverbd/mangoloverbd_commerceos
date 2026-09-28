import { describe, expect, it } from "vitest";
import type { StaffTableRow } from "@/lib/staffPerformanceMetrics";
import { LEADERBOARD_LIMIT, extraRevenueOption, leaderboardOption, yieldChartHeight, yieldOption } from "@/lib/staffPerformanceCharts";

type Series = { name?: string; type: string; data: Array<{ value: number; itemStyle?: { color?: string } } | number>; markLine?: { data: Array<{ xAxis: number }> } };
const seriesOf = (option: unknown) => (option as { series: Series[] }).series;
const axisData = (option: unknown, axis: "xAxis" | "yAxis") => ((option as Record<string, { data: string[] }>)[axis]).data;
type TooltipFormatter = (params: Array<{ dataIndex: number }>) => string;
const tooltipOf = (option: unknown) => (option as { tooltip: { formatter: TooltipFormatter } }).tooltip.formatter;

function row(name: string, value: number, deliveredShare: number | null, extra = 0): StaffTableRow {
  return {
    key: name, name, isActive: true, assigned: 100, confirmed: 10, value, kg: 0, aov: value / 10,
    confRate: 80, cancelRate: 10, delRate: 90, deliveredShare, extra,
    yield: { delivered: deliveredShare ?? 0, inTransit: 5, returned: 5, cancelled: 10, notConfirmed: 100 - (deliveredShare ?? 0) - 20 },
    flags: { confRate: null, cancelRate: null, delRate: null },
    row: { user_id: name, display_name: name, is_active: true, orders: {} as never, social_inbox_orders: {} as never, abandoned_checkouts: { contacted_count: 0, dismissed_count: 0, reopened_count: 0, converted_count: 0, converted_value: 0 } },
  };
}

describe("leaderboardOption", () => {
  it("ranks by confirmed value, highlights only #1, and caps the number of columns", () => {
    const rows = Array.from({ length: 10 }, (_, index) => row(`S${index}`, 1000 + index * 100, 50));
    const option = leaderboardOption(rows);
    const [bars] = seriesOf(option);
    const colors = (bars.data as Array<{ itemStyle: { color: string } }>).map((item) => item.itemStyle.color);

    expect(bars.data).toHaveLength(LEADERBOARD_LIMIT);
    expect(axisData(option, "xAxis")[0]).toContain("S9");
    expect(colors[0]).not.toBe(colors[1]);
    expect(new Set(colors.slice(1)).size).toBe(1);
  });

  it("escapes staff names in the tooltip", () => {
    const option = leaderboardOption([row("<img src=x onerror=alert(1)>", 1000, 50)]);
    const html = tooltipOf(option)([{ dataIndex: 0 }]);
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });
});

describe("yieldOption", () => {
  it("stacks five outcome segments as percentages of assigned, sorted so the best share is on top", () => {
    const option = yieldOption([row("Low", 1, 40), row("High", 1, 80), row("None", 1, null)], 60);
    const series = seriesOf(option);

    expect(series).toHaveLength(5);
    expect(axisData(option, "yAxis")).toEqual(["Low", "High"]); // category axis draws bottom-up
    expect(series[0].data).toEqual([40, 80]);
    expect(series[0].markLine?.data).toEqual([{ xAxis: 60 }]);
  });
});

describe("extraRevenueOption", () => {
  it("draws one stacked bar per member with extra revenue, largest at the top", () => {
    const rows = [row("A", 1, 50, 3000), row("B", 1, 50, 0), row("C", 1, 50, 9000)];
    const option = extraRevenueOption(rows);
    expect(axisData(option, "yAxis")).toEqual(["A", "C"]);
    expect(seriesOf(option)).toHaveLength(3);
  });
});

describe("layout helpers", () => {
  it("grows the yield chart with the number of members, with a floor", () => {
    expect(yieldChartHeight(2)).toBe(220);
    expect(yieldChartHeight(12)).toBe(12 * 34 + 36);
  });

  it("keeps the leaderboard value label short: value plus order count only", () => {
    const option = leaderboardOption([row("A", 139410, 50)]);
    const label = (option as { series: Array<{ label: { formatter: (p: { dataIndex: number }) => string } }> }).series[0].label.formatter({ dataIndex: 0 });
    expect(label).toContain("10 orders");
    expect(label).not.toContain("·");
  });
});
