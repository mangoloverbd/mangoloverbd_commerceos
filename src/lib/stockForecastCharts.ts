// ECharts options for the Analytics "Stock & forecast" tab, in the Business Report vocabulary.
import type { EChartsCoreOption } from "@/lib/echarts";
import { CHART, OUTCOME_COLORS } from "@/components/business-report/chartTheme";
import { escapeHtml } from "@/lib/businessReportCharts";
import type { ForecastDay, ProfitRow } from "@/lib/stockForecast";

const MANGO_SOFT = "rgba(242,140,40,0.16)";
const count = (value: number) => Math.round(value).toLocaleString("en-BD");
const taka = (value: number) => `৳${Math.round(value).toLocaleString("en-BD")}`;
const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const longDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function tooltip(extra: Record<string, unknown> = {}) {
  return {
    backgroundColor: CHART.bg, borderColor: CHART.rule, borderWidth: 1, padding: [6, 10],
    textStyle: { color: CHART.ink, fontFamily: CHART.font, fontSize: 12 }, extraCssText: "box-shadow:none;border-radius:8px;", ...extra,
  };
}

export type ForecastMetric = "orders" | "money";

// Bars for the last 8 weeks, then the forecast line with its likely range as a shaded band.
export function forecastOption(history: Array<{ day: string; orders: number }>, future: ForecastDay[], metric: ForecastMetric, valuePerOrder: number | null): EChartsCoreOption {
  const k = metric === "money" ? valuePerOrder ?? 0 : 1;
  const money = metric === "money";
  const pad = (n: number) => Array<string>(n).fill("-");
  const value = (v: number) => (money ? taka(v * k) : count(v));
  return {
    grid: { left: 4, right: 8, top: 18, bottom: 4, containLabel: true },
    tooltip: tooltip({
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(11,11,10,0.04)" } },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const index = params[0].dataIndex;
        if (index < history.length) return `${escapeHtml(longDay(history[index].day))}<br>${money ? "Delivered value" : "Orders"}: <b>${value(history[index].orders)}</b>`;
        const day = future[index - history.length];
        return `${escapeHtml(longDay(day.day))} · forecast<br><b>${value(day.orders)}</b><br>Likely ${value(day.low)} – ${value(day.high)}`;
      },
    }),
    xAxis: {
      type: "category",
      data: [...history, ...future].map((row) => shortDay(row.day)),
      axisLine: { lineStyle: { color: CHART.rule } },
      axisTick: { show: false },
      axisLabel: { color: CHART.ink3, fontSize: 10, interval: 13 },
    },
    yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: CHART.rule } }, axisLabel: { color: CHART.ink3, fontSize: 10, formatter: (v: number) => (money ? `৳${Math.round(v / 1000)}k` : String(v)) } },
    series: [
      { name: "Actual", type: "bar", barWidth: "62%", data: [...history.map((row) => row.orders * k), ...pad(future.length)], itemStyle: { color: "rgba(11,11,10,0.78)", borderRadius: [2, 2, 0, 0] } },
      { name: "low", type: "line", stack: "band", symbol: "none", silent: true, lineStyle: { opacity: 0 }, data: [...pad(history.length), ...future.map((row) => row.low * k)] },
      { name: "band", type: "line", stack: "band", symbol: "none", silent: true, lineStyle: { opacity: 0 }, areaStyle: { color: MANGO_SOFT }, data: [...pad(history.length), ...future.map((row) => (row.high - row.low) * k)] },
      {
        name: "Forecast", type: "line", smooth: 0.3, symbol: "none", lineStyle: { width: 2, color: CHART.highlight },
        data: [...pad(history.length), ...future.map((row) => row.orders * k)],
        markLine: { silent: true, symbol: "none", label: { formatter: "Today", color: CHART.ink3, fontSize: 10 }, lineStyle: { color: CHART.ink3, type: "dashed" }, data: [{ xAxis: history.length }] },
      },
    ],
  };
}

// Profit after cost price and courier fees; products without a cost price show courier-adjusted revenue in grey.
export function profitOption(rows: ProfitRow[]): EChartsCoreOption {
  const ranked = rows.slice(0, 7).reverse();
  const valueOf = (row: ProfitRow) => (row.profit ?? row.delivered_revenue - row.courier);
  const best = ranked.reduce((top, row, index) => (row.profit !== null && (top < 0 || (ranked[top].profit ?? -Infinity) < row.profit) ? index : top), -1);
  return {
    grid: { left: 4, right: 96, top: 6, bottom: 6, containLabel: true },
    tooltip: tooltip({
      trigger: "axis",
      axisPointer: { type: "none" },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const row = ranked[params[0].dataIndex];
        return `<b>${escapeHtml(row.name)}</b><br>Delivered ${taka(row.delivered_revenue)}<br>${row.cost === null ? "Cost price not set" : `Cost price −${taka(row.cost)}`}<br>Courier −${taka(row.courier)}<br>${row.profit === null ? "Profit unknown" : `Profit <b>${taka(row.profit)}</b> (${Math.round((row.profit / Math.max(row.delivered_revenue, 1)) * 100)}%)`}`;
      },
    }),
    xAxis: { type: "value", show: false, min: 0 },
    yAxis: { type: "category", data: ranked.map((row) => row.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: CHART.ink, fontSize: 12, width: 104, overflow: "truncate" } },
    series: [{
      type: "bar", barWidth: 14, showBackground: true, backgroundStyle: { color: CHART.track, borderRadius: 7 },
      data: ranked.map((row, index) => ({
        value: Math.max(0, valueOf(row)),
        itemStyle: { color: row.profit === null ? "rgba(11,11,10,0.22)" : index === best ? OUTCOME_COLORS.approved : "rgba(11,11,10,0.8)", borderRadius: 7 },
      })),
      label: {
        show: true, position: "right",
        formatter: (params: { dataIndex: number }) => {
          const row = ranked[params.dataIndex];
          return row.profit === null
            ? `{m|No cost price}`
            : `{v|${taka(row.profit)}} {m|${Math.round((row.profit / Math.max(row.delivered_revenue, 1)) * 100)}%}`;
        },
        rich: { v: { color: CHART.ink, fontSize: 12, fontWeight: 500 }, m: { color: CHART.ink3, fontSize: 11 } },
      },
    }],
  };
}
