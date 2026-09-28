import type { EChartsCoreOption } from "@/lib/echarts";
import { CHART, OUTCOME_COLORS } from "@/components/business-report/chartTheme";
import { escapeHtml } from "@/lib/businessReportCharts";
import type { StaffTableRow, YieldKey } from "@/lib/staffPerformanceMetrics";

export const LEADERBOARD_LIMIT = 8;
// Mango accent for the #1 bar; kept off the outcome palette used by the yield chart.
export const LEADERBOARD_HIGHLIGHT = CHART.highlight;
const LEADERBOARD_REST = "#93B4F5";
const YIELD_ROW_HEIGHT = 34;

export function yieldChartHeight(memberCount: number): number {
  return Math.max(220, memberCount * YIELD_ROW_HEIGHT + 36);
}
export const YIELD_KEYS: YieldKey[] = ["delivered", "inTransit", "returned", "cancelled"];
export const YIELD_LABELS: Record<YieldKey, string> = {
  delivered: "Delivered",
  inTransit: "Open / in transit",
  returned: "RTO",
  cancelled: "Cancelled",
};
export const YIELD_COLORS: Record<YieldKey, string> = {
  delivered: OUTCOME_COLORS.approved,
  inTransit: CHART.categorical[4],
  returned: OUTCOME_COLORS.returned,
  cancelled: OUTCOME_COLORS.cancelled,
};

const taka = (value: number) => `৳${Math.round(value).toLocaleString("en-BD")}`;
const count = (value: number) => value.toLocaleString("en-BD");

function tooltip(extra: Record<string, unknown>) {
  return {
    backgroundColor: CHART.bg,
    borderColor: CHART.rule,
    borderWidth: 1,
    padding: [6, 10],
    textStyle: { color: CHART.ink, fontFamily: CHART.font, fontSize: 12 },
    extraCssText: "box-shadow:none;border-radius:8px;",
    ...extra,
  };
}

export function leaderboardOption(rows: StaffTableRow[]): EChartsCoreOption {
  const ranked = [...rows].filter((item) => item.value > 0).sort((a, b) => b.value - a.value).slice(0, LEADERBOARD_LIMIT);
  return {
    grid: { left: 8, right: 8, top: 44, bottom: 46 },
    tooltip: tooltip({
      trigger: "axis",
      axisPointer: { type: "none" },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const item = ranked[params[0].dataIndex];
        return `<b>#${params[0].dataIndex + 1} ${escapeHtml(item.name)}</b><br>${taka(item.value)} confirmed<br>${count(item.confirmed)} orders${item.aov === null ? "" : ` · AOV ${taka(item.aov)}`}`;
      },
    }),
    xAxis: {
      type: "category",
      data: ranked.map((item, index) => `#${index + 1}\n${item.name}`),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: CHART.ink, fontSize: 12, fontWeight: 500, margin: 12, lineHeight: 16, interval: 0, overflow: "truncate", width: 90 },
    },
    yAxis: { type: "value", show: false, max: (extent: { max: number }) => extent.max * 1.06 },
    series: [{
      type: "bar",
      barWidth: "46%",
      data: ranked.map((item, index) => ({
        value: item.value,
        itemStyle: {
          color: index === 0 ? LEADERBOARD_HIGHLIGHT : LEADERBOARD_REST,
          borderRadius: [10, 10, 10, 10],
        },
      })),
      label: {
        show: true,
        position: "top",
        distance: 8,
        formatter: (params: { dataIndex: number }) => {
          const item = ranked[params.dataIndex];
          return `{v|${taka(item.value)}}\n{m|${count(item.confirmed)} orders}`;
        },
        rich: {
          v: { color: CHART.ink, fontSize: 13, fontWeight: 500, lineHeight: 18 },
          m: { color: CHART.ink3, fontSize: 10, lineHeight: 14 },
        },
      },
    }],
  };
}

export function yieldOption(rows: StaffTableRow[], teamDeliveredShare: number | null): EChartsCoreOption {
  const ordered = rows
    .filter((item): item is StaffTableRow & { deliveredShare: number } => item.deliveredShare !== null)
    .sort((a, b) => a.deliveredShare - b.deliveredShare);
  const share = (item: StaffTableRow, key: YieldKey) => (item.handled > 0 ? (item.yield[key] / item.handled) * 100 : 0);
  return {
    grid: { left: 104, right: 58, top: 6, bottom: 22 },
    tooltip: tooltip({
      trigger: "axis",
      axisPointer: { type: "none" },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const item = ordered[params[0].dataIndex];
        return `<b>${escapeHtml(item.name)}</b> · ${count(item.handled)} handled<br>`
          + YIELD_KEYS.map((key) => `${YIELD_LABELS[key]} ${count(item.yield[key])} (${share(item, key).toFixed(1)}%)`).join("<br>");
      },
    }),
    xAxis: {
      type: "value",
      max: 100,
      axisLabel: { color: CHART.ink3, fontSize: 10, formatter: "{value}%" },
      splitLine: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: "category",
      data: ordered.map((item) => item.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: CHART.ink, fontSize: 12, fontWeight: 500, overflow: "truncate", width: 96 },
    },
    series: YIELD_KEYS.map((key, index) => ({
      name: YIELD_LABELS[key],
      type: "bar",
      stack: "yield",
      barMaxWidth: 18,
      barCategoryGap: "40%",
      data: ordered.map((item) => (key === "delivered" ? item.deliveredShare : share(item, key))),
      itemStyle: {
        color: YIELD_COLORS[key],
        borderColor: CHART.bg,
        borderWidth: 1,
        borderRadius: index === 0 ? [4, 0, 0, 4] : index === YIELD_KEYS.length - 1 ? [0, 4, 4, 0] : 0,
      },
      ...(index === 0 && teamDeliveredShare !== null ? {
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: CHART.ink, type: "dashed", width: 1 },
          label: { show: false },
          data: [{ xAxis: teamDeliveredShare }],
        },
      } : {}),
      ...(index === YIELD_KEYS.length - 1 ? {
        label: {
          show: true,
          position: "right",
          color: CHART.ink,
          fontSize: 11,
          fontWeight: 500,
          formatter: (params: { dataIndex: number }) => `${ordered[params.dataIndex].deliveredShare.toFixed(1)}%`,
        },
      } : {}),
    })),
  };
}
