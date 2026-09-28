import type { EChartsCoreOption } from "@/lib/echarts";
import { CHART, OUTCOME_COLORS, OUTCOME_KEYS, OUTCOME_LABELS } from "@/components/business-report/chartTheme";
import type { BusinessReportSource, ProductWeight, SeriesBucket } from "@/components/business-report/types";
import type { MixSlice } from "@/lib/businessReportMetrics";
import { maxIndex } from "@/lib/businessReportMetrics";

export const GRID_ROWS = 14;

const taka = (value: number) => `৳${Math.round(value).toLocaleString("en-BD")}`;

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

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

export function sparklineOption(values: number[]): EChartsCoreOption {
  const last = values.length - 1;
  return {
    grid: { left: 0, right: 4, top: 4, bottom: 2 },
    xAxis: { type: "category", show: false, boundaryGap: false, data: values.map((_, index) => index) },
    yAxis: { type: "value", show: false, min: "dataMin" },
    series: [{
      type: "line",
      data: values,
      smooth: 0.35,
      symbol: "none",
      lineStyle: { width: 1.4, color: CHART.ink },
      areaStyle: { color: CHART.track },
      markPoint: {
        symbol: "circle",
        symbolSize: 5,
        itemStyle: { color: CHART.ink },
        label: { show: false },
        data: last >= 0 ? [{ coord: [last, values[last]] }] : [],
      },
    }],
  };
}

export function intakeGridOption(profile: SeriesBucket[]): { option: EChartsCoreOption; ordersPerCell: number; peakIndex: number } {
  const counts = profile.map((bucket) => bucket.intake_count);
  const peakIndex = maxIndex(counts);
  const peak = peakIndex >= 0 ? counts[peakIndex] : 0;
  const ordersPerCell = Math.max(1, Math.ceil(peak / GRID_ROWS));
  const bound = ordersPerCell * GRID_ROWS;
  const cell = { symbol: "rect", symbolSize: ["62%", 11], symbolMargin: 3, symbolBoundingData: bound };
  return {
    ordersPerCell,
    peakIndex,
    option: {
      grid: { left: 14, right: 6, top: 4, bottom: 22 },
      tooltip: tooltip({
        trigger: "axis",
        axisPointer: { type: "none" },
        formatter: (params: Array<{ dataIndex: number; name: string }>) => `${escapeHtml(params[0].name)}<br><b>${counts[params[0].dataIndex]}</b> orders`,
      }),
      xAxis: {
        type: "category",
        data: profile.map((bucket) => bucket.label),
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
          data: counts.map((value, index) => ({ value, itemStyle: { color: index === peakIndex ? CHART.ink : CHART.greys[2] } })),
        },
      ],
    },
  };
}

const SANKEY_VALUE_FIELDS = {
  approved: "approved_value",
  pending: "pending_value",
  cancelled: "cancelled_value",
  returned: "returned_value",
} as const;

export function sankeyParticipants(sources: BusinessReportSource[]) {
  const active = sources.filter((source) => source.order_value > 0);
  const outcomes = OUTCOME_KEYS.filter((key) => active.some((source) => source[SANKEY_VALUE_FIELDS[key]] > 0));
  return { active, outcomes };
}

export function outcomeSankeyOption(sources: BusinessReportSource[]): EChartsCoreOption {
  const { active, outcomes } = sankeyParticipants(sources);
  const total = active.reduce((sum, source) => sum + source.order_value, 0);
  const nodes = [
    ...active.map((source, index) => ({ name: source.label, depth: 0, itemStyle: { color: CHART.greys[Math.min(index, CHART.greys.length - 1)] } })),
    ...outcomes.map((key) => ({ name: OUTCOME_LABELS[key], depth: 1, itemStyle: { color: OUTCOME_COLORS[key] } })),
  ];
  const links = active.flatMap((source) => outcomes
    .map((key) => ({ source: source.label, target: OUTCOME_LABELS[key], value: source[SANKEY_VALUE_FIELDS[key]] }))
    .filter((link) => link.value > 0));
  return {
    tooltip: tooltip({
      formatter: (params: { dataType: string; name: string; value: number; data: { source?: string; target?: string } }) => (
        params.dataType === "edge"
          ? `${escapeHtml(params.data.source ?? "")} → ${escapeHtml(params.data.target ?? "")}<br><b>${taka(params.value)}</b>`
          : `${escapeHtml(params.name)}<br><b>${taka(params.value)}</b> · ${total ? ((params.value / total) * 100).toFixed(1) : "0"}%`
      ),
    }),
    series: [{
      type: "sankey",
      left: 96,
      right: 104,
      top: 8,
      bottom: 8,
      nodeWidth: 7,
      nodeGap: 14,
      layoutIterations: 0,
      draggable: false,
      emphasis: { focus: "adjacency" },
      data: nodes,
      links,
      lineStyle: { color: "gradient", opacity: 0.22, curveness: 0.5 },
      itemStyle: { borderWidth: 0, borderRadius: 3 },
      label: {
        fontSize: 11,
        fontFamily: CHART.font,
        formatter: (params: { name: string; value: number }) => `{n|${params.name}}\n{v|${taka(params.value)}}`,
        rich: {
          n: { color: CHART.ink, fontSize: 11, lineHeight: 15 },
          v: { color: CHART.ink3, fontSize: 10, fontFamily: CHART.mono },
        },
      },
      levels: [
        { depth: 0, label: { position: "left", align: "right" } },
        { depth: 1, label: { position: "right", align: "left" } },
      ],
    }],
  };
}

export function sourceMixOption(slices: MixSlice[]): EChartsCoreOption {
  return {
    tooltip: tooltip({ formatter: (params: { name: string; value: number; percent: number }) => `${escapeHtml(params.name)}<br><b>${taka(params.value)}</b> · ${params.percent}%` }),
    series: [{
      type: "pie",
      radius: ["54%", "92%"],
      padAngle: 1.5,
      itemStyle: { borderColor: CHART.bg, borderWidth: 2 },
      label: { show: true, position: "inside", fontSize: 10, fontWeight: 500, formatter: (params: { percent: number }) => `${Math.round(params.percent)}%` },
      labelLine: { show: false },
      data: slices.map((slice, index) => ({
        name: slice.label,
        value: slice.value,
        itemStyle: { color: CHART.greys[Math.min(index, CHART.greys.length - 1)] },
        label: { color: index < 2 ? CHART.bg : CHART.ink },
      })),
    }],
  };
}

export function approvalBand(approvalRate: number): { label: string; color: string } {
  if (approvalRate < 60) return { label: "Needs attention", color: OUTCOME_COLORS.cancelled };
  if (approvalRate < 75) return { label: "Watch", color: OUTCOME_COLORS.pending };
  if (approvalRate < 90) return { label: "Healthy", color: OUTCOME_COLORS.approved };
  return { label: "Excellent", color: OUTCOME_COLORS.approved };
}

export function approvalGaugeOption(approvalRate: number): EChartsCoreOption {
  return {
    series: [{
      type: "gauge",
      startAngle: 205,
      endAngle: -25,
      min: 0,
      max: 100,
      radius: "96%",
      center: ["50%", "62%"],
      splitNumber: 20,
      axisLine: {
        lineStyle: {
          width: 10,
          color: [[0.6, OUTCOME_COLORS.cancelled], [0.75, OUTCOME_COLORS.pending], [1, OUTCOME_COLORS.approved]],
        },
      },
      progress: { show: false },
      pointer: {
        show: true,
        icon: "circle",
        length: "10%",
        width: 12,
        offsetCenter: [0, "-88%"],
        itemStyle: { color: CHART.bg, borderColor: CHART.ink, borderWidth: 2.5 },
      },
      anchor: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, length: 10, distance: -10, lineStyle: { color: CHART.bg, width: 3 } },
      axisLabel: { show: false },
      title: { show: false },
      detail: { show: false },
      data: [{ value: Number(approvalRate.toFixed(1)) }],
    }],
  };
}

export function bestDayOption(buckets: SeriesBucket[], bestIndex: number): EChartsCoreOption {
  const spacer = Math.max(0, ...buckets.map((bucket) => bucket.order_value)) * 0.018;
  const style = (index: number, highlight: string) => ({
    color: index === bestIndex ? highlight : CHART.track,
    borderRadius: 5,
    ...(index === bestIndex ? { shadowBlur: 14, shadowColor: CHART.ink3 } : {}),
  });
  return {
    grid: { left: 4, right: 4, top: 12, bottom: 24 },
    tooltip: tooltip({
      trigger: "axis",
      axisPointer: { type: "none" },
      formatter: (params: Array<{ dataIndex: number; name: string }>) => {
        const bucket = buckets[params[0].dataIndex];
        return `${escapeHtml(bucket.label)} · <b>${taka(bucket.order_value)}</b><br>Social &amp; manual ${taka(bucket.order_value - bucket.website_value)}<br>Website ${taka(bucket.website_value)}`;
      },
    }),
    xAxis: {
      type: "category",
      data: buckets.map((bucket) => bucket.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: CHART.ink3, fontSize: 10, interval: (index: number) => index % 7 === 0 || index === bestIndex },
    },
    yAxis: { type: "value", show: false },
    series: [
      {
        name: "Website",
        type: "bar",
        stack: "day",
        barWidth: "62%",
        data: buckets.map((bucket, index) => ({ value: bucket.website_value, itemStyle: style(index, CHART.greys[2]) })),
      },
      {
        name: "gap",
        type: "bar",
        stack: "day",
        silent: true,
        tooltip: { show: false },
        itemStyle: { color: "rgba(0,0,0,0)" },
        data: buckets.map(() => ({ value: spacer, itemStyle: { color: "rgba(0,0,0,0)" } })),
      },
      {
        name: "Social & manual",
        type: "bar",
        stack: "day",
        data: buckets.map((bucket, index) => ({ value: bucket.order_value - bucket.website_value, itemStyle: style(index, CHART.ink) })),
      },
    ],
  };
}

export function productRingsOption(products: ProductWeight[]): EChartsCoreOption {
  const top = products.filter((product) => product.kg > 0).slice(0, 5);
  const total = products.reduce((sum, product) => sum + product.kg, 0);
  const width = 100 / Math.max(top.length, 1);
  return {
    tooltip: tooltip({
      formatter: (params: { name: string; value: number }) => (params.name === "rest" ? "" : `${escapeHtml(params.name)}<br><b>${params.value.toLocaleString("en-BD")} kg</b>`),
    }),
    series: top.map((product, index) => ({
      type: "pie",
      radius: ["40%", "50%"],
      center: [`${(index + 0.5) * width}%`, "50%"],
      startAngle: 90,
      label: { show: false },
      emphasis: { scale: false },
      data: [
        { name: product.product_name, value: product.kg, itemStyle: { color: CHART.greys[Math.min(index, 3)] } },
        { name: "rest", value: Math.max(total - product.kg, 0), itemStyle: { color: CHART.track }, tooltip: { show: false } },
      ],
    })),
  };
}
