import { describe, expect, it } from "vitest";
import type { StaffTableRow } from "@/lib/staffPerformanceMetrics";
import { LEADERBOARD_HIGHLIGHT, LEADERBOARD_LIMIT, leaderboardOption } from "@/lib/staffPerformanceCharts";

type Series = { name?: string; type: string; data: Array<{ value: number; itemStyle?: { color?: string } } | number> };
const seriesOf = (option: unknown) => (option as { series: Series[] }).series;
const axisData = (option: unknown, axis: "xAxis" | "yAxis") => ((option as Record<string, { data: string[] }>)[axis]).data;
type TooltipFormatter = (params: Array<{ dataIndex: number }>) => string;
const tooltipOf = (option: unknown) => (option as { tooltip: { formatter: TooltipFormatter } }).tooltip.formatter;

function row(name: string, value: number, deliveredShare: number | null, extra = 0): StaffTableRow {
  return {
    key: name, name, isActive: true, handled: 100, confirmed: 10, value, kg: 0, aov: value / 10,
    confRate: 80, cancelRate: 10, delRate: 90, deliveredShare, extra,
    yield: { delivered: deliveredShare ?? 0, inTransit: 100 - (deliveredShare ?? 0) - 15, returned: 5, cancelled: 10 },
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

  it("highlights #1 in the flat mango accent with no shadow", () => {
    const [bars] = seriesOf(leaderboardOption([row("A", 2000, 50), row("B", 1000, 50)]));
    const top = (bars.data as Array<{ itemStyle: Record<string, unknown> }>)[0].itemStyle;

    expect(top.color).toBe(LEADERBOARD_HIGHLIGHT);
    expect(top).not.toHaveProperty("shadowBlur");
  });

  it("escapes staff names in the tooltip", () => {
    const option = leaderboardOption([row("<img src=x onerror=alert(1)>", 1000, 50)]);
    const html = tooltipOf(option)([{ dataIndex: 0 }]);
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });
});

describe("leaderboardOption value label", () => {
  it("keeps the leaderboard value label short: value plus order count only", () => {
    const option = leaderboardOption([row("A", 139410, 50)]);
    const label = (option as { series: Array<{ label: { formatter: (p: { dataIndex: number }) => string } }> }).series[0].label.formatter({ dataIndex: 0 });
    expect(label).toContain("10 orders");
    expect(label).not.toContain("·");
  });
});
