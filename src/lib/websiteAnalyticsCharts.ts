// ECharts options for the Analytics page website tabs, in the Business Report /
// Staff Performance chart vocabulary (chartTheme colors, borderless tooltips).
import type { EChartsCoreOption } from "@/lib/echarts";
import { CHART, OUTCOME_COLORS, categoricalColor } from "@/components/business-report/chartTheme";
import { escapeHtml } from "@/lib/businessReportCharts";
import {
  formatNumber, formatPct, formatTaka, hourLabel, rate, sourceLabel,
  type AcquisitionRow, type DailyRow, type DeviceRow, type HourRow, type ProductRow,
} from "@/lib/websiteAnalytics";

const GRID_ROWS = 14;

function tooltip(extra: Record<string, unknown> = {}) {
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

const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export type TrafficMetric = "visitors" | "orders";

// Bars for this period with the previous period as a faint dashed line, aligned by day position.
export function trafficOption(daily: DailyRow[], previous: DailyRow[] | null, metric: TrafficMetric): EChartsCoreOption {
  const pick = (row: DailyRow) => (metric === "visitors" ? row.visitors : row.ordered_sessions);
  const values = daily.map(pick);
  const before = previous ? previous.map(pick).slice(0, daily.length) : [];
  const peak = values.reduce((best, value, index) => (value > (values[best] ?? -1) ? index : best), -1);
  const name = metric === "visitors" ? "Visitors" : "Visits with an order";
  return {
    grid: { left: 4, right: 4, top: 22, bottom: 24, containLabel: true },
    tooltip: tooltip({
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(11,11,10,0.04)" } },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const index = params[0].dataIndex;
        const prior = before[index];
        return `${escapeHtml(dayLabel(daily[index].day))}<br>${name}: <b>${formatNumber(values[index])}</b>${prior === undefined ? "" : `<br>Previous period: ${formatNumber(prior)}`}`;
      },
    }),
    xAxis: {
      type: "category",
      data: daily.map((row) => dayLabel(row.day)),
      axisLine: { lineStyle: { color: CHART.rule } },
      axisTick: { show: false },
      axisLabel: { color: CHART.ink3, fontSize: 10, interval: Math.max(0, Math.ceil(daily.length / 6) - 1) },
    },
    yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: CHART.rule } }, axisLabel: { color: CHART.ink3, fontSize: 10 } },
    series: [
      {
        name,
        type: "bar",
        barWidth: "56%",
        data: values.map((value, index) => ({ value, itemStyle: { color: index === peak && value > 0 ? CHART.highlight : "rgba(11,11,10,0.8)", borderRadius: [3, 3, 0, 0] } })),
      },
      ...(before.length ? [{
        name: "Previous period",
        type: "line",
        smooth: 0.35,
        symbol: "none",
        lineStyle: { width: 1.5, type: "dashed", color: "rgba(11,11,10,0.35)" },
        data: before,
      }] : []),
    ],
  };
}

// Dot grid of visits by Dhaka hour, same construction as the Business Report intake rhythm.
export function rhythmOption(hourly: HourRow[]): { option: EChartsCoreOption; visitsPerCell: number } {
  const counts = hourly.map((row) => row.sessions);
  const peak = Math.max(0, ...counts);
  const peakIndex = peak > 0 ? counts.indexOf(peak) : -1;
  const visitsPerCell = Math.max(1, Math.ceil(peak / GRID_ROWS));
  const bound = visitsPerCell * GRID_ROWS;
  const cell = { symbol: "rect", symbolSize: ["62%", 9], symbolMargin: 3, symbolBoundingData: bound };
  return {
    visitsPerCell,
    option: {
      grid: { left: 8, right: 6, top: 4, bottom: 22 },
      tooltip: tooltip({
        trigger: "axis",
        axisPointer: { type: "none" },
        formatter: (params: Array<{ dataIndex: number }>) => `${hourLabel(params[0].dataIndex)}<br><b>${formatNumber(counts[params[0].dataIndex])}</b> visits`,
      }),
      xAxis: {
        type: "category",
        data: hourly.map((row) => hourLabel(row.hour)),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: CHART.ink3, fontFamily: CHART.mono, fontSize: 9, interval: 3 },
      },
      yAxis: { type: "value", max: bound, show: false },
      series: [
        { type: "pictorialBar", ...cell, symbolRepeat: GRID_ROWS, z: 1, silent: true, itemStyle: { color: CHART.track }, data: counts.map(() => bound) },
        {
          type: "pictorialBar",
          ...cell,
          symbolRepeat: GRID_ROWS,
          symbolClip: true,
          z: 2,
          data: counts.map((value, index) => ({ value, itemStyle: { color: index === peakIndex ? CHART.ramp[3] : CHART.ramp[Math.min(2, Math.floor((value / Math.max(peak, 1)) * 3))] } })),
        },
      ],
    },
  };
}

export type Slice = { label: string; value: number };

// Top slices plus one grouped "Other" slice, so the donut stays readable.
export function groupSlices(slices: Slice[], keep = 4): Slice[] {
  const sorted = [...slices].filter((slice) => slice.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= keep + 1) return sorted;
  const rest = sorted.slice(keep).reduce((sum, slice) => sum + slice.value, 0);
  return [...sorted.slice(0, keep), { label: "Other", value: rest }];
}

export function sessionDonutOption(slices: Slice[]): EChartsCoreOption {
  return {
    tooltip: tooltip({ formatter: (params: { name: string; value: number; percent: number }) => `${escapeHtml(params.name)}<br><b>${formatNumber(params.value)}</b> visits · ${params.percent}%` }),
    series: [{
      type: "pie",
      radius: ["54%", "92%"],
      padAngle: 1.5,
      itemStyle: { borderColor: CHART.bg, borderWidth: 2 },
      label: { show: true, position: "inside", fontSize: 10, fontWeight: 500, formatter: (params: { percent: number }) => (params.percent >= 6 ? `${Math.round(params.percent)}%` : "") },
      labelLine: { show: false },
      data: slices.map((slice, index) => ({
        name: slice.label,
        value: slice.value,
        itemStyle: { color: categoricalColor(index) },
        label: { color: index < CHART.categorical.length - 1 ? CHART.bg : CHART.ink },
      })),
    }],
  };
}

// Horizontal bars of delivered merchandise value by credited source.
export function deliveredBySourceOption(rows: AcquisitionRow[]): EChartsCoreOption {
  const ranked = [...rows].sort((a, b) => b.delivered_value - a.delivered_value || b.orders - a.orders).slice(0, 8).reverse();
  return {
    grid: { left: 4, right: 76, top: 4, bottom: 4, containLabel: true },
    tooltip: tooltip({
      trigger: "axis",
      axisPointer: { type: "none" },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const row = ranked[params[0].dataIndex];
        return `<b>${escapeHtml(sourceLabel(row.source, row.medium))}</b><br>${formatTaka(row.delivered_value)} delivered<br>${formatNumber(row.delivered)} of ${formatNumber(row.orders)} orders delivered`;
      },
    }),
    xAxis: { type: "value", show: false },
    yAxis: {
      type: "category",
      data: ranked.map((row) => sourceLabel(row.source, row.medium)),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: CHART.ink, fontSize: 12 },
    },
    series: [{
      type: "bar",
      barWidth: 14,
      data: ranked.map((row, index) => ({ value: row.delivered_value, itemStyle: { color: index === ranked.length - 1 ? CHART.highlight : "rgba(11,11,10,0.8)", borderRadius: 7 } })),
      label: { show: true, position: "right", color: CHART.ink2, fontSize: 11, formatter: (params: { value: number }) => formatTaka(params.value) },
      showBackground: true,
      backgroundStyle: { color: CHART.track, borderRadius: 7 },
    }],
  };
}

const OUTCOME_NODES = [
  { key: "delivered", label: "Delivered", color: OUTCOME_COLORS.approved },
  { key: "active", label: "In progress", color: OUTCOME_COLORS.pending },
  { key: "cancelled", label: "Cancelled", color: OUTCOME_COLORS.cancelled },
  { key: "returned", label: "Returned", color: OUTCOME_COLORS.returned },
] as const;

const outcomeCount = (row: AcquisitionRow, key: (typeof OUTCOME_NODES)[number]["key"]) =>
  key === "delivered" ? row.delivered + row.partial_delivered : row[key];

// Orders flowing from each credited source to their current outcome.
export function sourceOutcomeSankeyOption(rows: AcquisitionRow[]): EChartsCoreOption {
  const active = [...rows].filter((row) => row.orders > 0).sort((a, b) => b.orders - a.orders).slice(0, 6);
  const outcomes = OUTCOME_NODES.filter((node) => active.some((row) => outcomeCount(row, node.key) > 0));
  const label = (row: AcquisitionRow) => sourceLabel(row.source, row.medium);
  return {
    tooltip: tooltip({
      formatter: (params: { dataType: string; name: string; value: number; data: { source?: string; target?: string } }) => (
        params.dataType === "edge"
          ? `${escapeHtml(params.data.source ?? "")} → ${escapeHtml(params.data.target ?? "")}<br><b>${formatNumber(params.value)}</b> orders`
          : `${escapeHtml(params.name)}<br><b>${formatNumber(params.value)}</b> orders`
      ),
    }),
    series: [{
      type: "sankey",
      left: 96,
      right: 92,
      top: 8,
      bottom: 8,
      nodeWidth: 7,
      nodeGap: 14,
      layoutIterations: 0,
      draggable: false,
      emphasis: { focus: "adjacency" },
      data: [
        ...active.map((row, index) => ({ name: label(row), depth: 0, itemStyle: { color: categoricalColor(index) } })),
        ...outcomes.map((node) => ({ name: node.label, depth: 1, itemStyle: { color: node.color } })),
      ],
      links: active.flatMap((row) => outcomes
        .map((node) => ({ source: label(row), target: node.label, value: outcomeCount(row, node.key) }))
        .filter((link) => link.value > 0)),
      lineStyle: { color: "gradient", opacity: 0.22, curveness: 0.5 },
      itemStyle: { borderWidth: 0, borderRadius: 3 },
      label: {
        fontSize: 11,
        fontFamily: CHART.font,
        formatter: (params: { name: string; value: number }) => `{n|${params.name}}\n{v|${formatNumber(params.value)}}`,
        rich: { n: { color: CHART.ink, fontSize: 11, lineHeight: 15 }, v: { color: CHART.ink3, fontSize: 10, fontFamily: CHART.mono } },
      },
      levels: [
        { depth: 0, label: { position: "left", align: "right" } },
        { depth: 1, label: { position: "right", align: "left" } },
      ],
    }],
  };
}

export const productName = (row: ProductRow) => row.name || row.product_slug.replace(/-/g, " ");

// Most viewed products; the label shows view → order → delivered.
export function productLeaderboardOption(products: ProductRow[]): EChartsCoreOption {
  const ranked = products.slice(0, 8).reverse();
  return {
    grid: { left: 4, right: 110, top: 4, bottom: 4, containLabel: true },
    tooltip: tooltip({
      trigger: "axis",
      axisPointer: { type: "none" },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const row = ranked[params[0].dataIndex];
        return `<b>${escapeHtml(productName(row))}</b><br>${formatNumber(row.views)} views in ${formatNumber(row.sessions)} visits<br>${formatNumber(row.orders)} orders · ${formatNumber(row.delivered)} delivered`;
      },
    }),
    xAxis: { type: "value", show: false },
    yAxis: {
      type: "category",
      data: ranked.map(productName),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: CHART.ink, fontSize: 12, width: 130, overflow: "truncate" },
    },
    series: [{
      type: "bar",
      barWidth: 14,
      data: ranked.map((row, index) => ({ value: row.views, itemStyle: { color: index === ranked.length - 1 ? CHART.highlight : "rgba(11,11,10,0.8)", borderRadius: 7 } })),
      showBackground: true,
      backgroundStyle: { color: CHART.track, borderRadius: 7 },
      label: {
        show: true,
        position: "right",
        formatter: (params: { dataIndex: number }) => {
          const row = ranked[params.dataIndex];
          return `{v|${formatNumber(row.views)}} {m|→ ${formatNumber(row.orders)} → ${formatNumber(row.delivered)}}`;
        },
        rich: { v: { color: CHART.ink, fontSize: 12, fontWeight: 500 }, m: { color: CHART.ink3, fontSize: 11 } },
      },
    }],
  };
}

// One ring per product: its share of delivered orders among the listed products.
export function deliveredRingsOption(products: ProductRow[]): EChartsCoreOption {
  const top = [...products].filter((row) => row.delivered > 0).sort((a, b) => b.delivered - a.delivered).slice(0, 4);
  const total = top.reduce((sum, row) => sum + row.delivered, 0);
  const width = 100 / Math.max(top.length, 1);
  return {
    tooltip: tooltip({ formatter: (params: { name: string; value: number }) => (params.name === "rest" ? "" : `${escapeHtml(params.name)}<br><b>${formatNumber(params.value)}</b> delivered orders`) }),
    series: top.map((row, index) => ({
      type: "pie",
      radius: ["44%", "56%"],
      center: [`${(index + 0.5) * width}%`, "50%"],
      startAngle: 90,
      emphasis: { scale: false },
      label: {
        show: true,
        position: "center",
        formatter: () => `${Math.round(rate(row.delivered, total))}%`,
        color: CHART.ink,
        fontSize: 16,
        fontWeight: 300,
      },
      data: [
        { name: productName(row), value: row.delivered, itemStyle: { color: categoricalColor(index) } },
        { name: "rest", value: Math.max(total - row.delivered, 0), itemStyle: { color: CHART.track }, tooltip: { show: false } },
      ],
    })),
  };
}

const DEVICE_NAMES: Record<string, string> = { mobile: "Mobile", desktop: "Desktop", tablet: "Tablet", unknown: "Unknown" };

export function deviceConversionOption(devices: DeviceRow[]): EChartsCoreOption {
  const rows = devices.filter((row) => row.sessions > 0);
  return {
    grid: { left: 4, right: 4, top: 24, bottom: 4, containLabel: true },
    tooltip: tooltip({
      trigger: "axis",
      axisPointer: { type: "none" },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const row = rows[params[0].dataIndex];
        return `<b>${DEVICE_NAMES[row.device] ?? escapeHtml(row.device)}</b><br>${formatNumber(row.sessions)} visits<br>${formatNumber(row.ordered_sessions)} with an order (${formatPct(rate(row.ordered_sessions, row.sessions))})`;
      },
    }),
    xAxis: { type: "category", data: rows.map((row) => DEVICE_NAMES[row.device] ?? row.device), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: CHART.ink, fontSize: 12 } },
    yAxis: { type: "value", show: false, max: (extent: { max: number }) => Math.max(extent.max * 1.25, 1) },
    series: [{
      type: "bar",
      barWidth: "42%",
      data: rows.map((row) => ({ value: Math.round(rate(row.ordered_sessions, row.sessions) * 10) / 10, itemStyle: { color: "rgba(11,11,10,0.8)", borderRadius: [6, 6, 6, 6] } })),
      label: { show: true, position: "top", color: CHART.ink, fontSize: 12, formatter: (params: { value: number }) => formatPct(params.value) },
    }],
  };
}
