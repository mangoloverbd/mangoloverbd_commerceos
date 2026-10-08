import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { periodLabel, trendPoints, type BucketUnit } from "./metricTrend";
import type { HomeMetric, HomeSummary } from "./types";

export type TrendMetricKey = "sessions" | "sales" | "orders" | "conversion_rate";

const COPY: Record<TrendMetricKey, { title: string; description: string }> = {
  sessions: { title: "Sessions over time", description: "Visits to your storefront" },
  sales: { title: "Total sales over time", description: "Order value including delivery, cancelled orders excluded" },
  orders: { title: "Orders over time", description: "Orders placed, cancelled orders excluded" },
  conversion_rate: { title: "Conversion rate over time", description: "Percentage of storefront sessions that placed an order" },
};

// Same blue pair as the overview charts: solid for this period, light dotted for the comparison.
const CURRENT_COLOR = "#3B82F6";
const PREVIOUS_COLOR = "#93C5FD";

function formatValue(key: TrendMetricKey, value: number, compact = false) {
  if (key === "conversion_rate") return compact ? `${Math.round(value)}%` : `${value.toFixed(2)}%`;
  const number = new Intl.NumberFormat("en-US", compact
    ? { notation: "compact", maximumFractionDigits: 1 }
    : { minimumFractionDigits: key === "sales" ? 2 : 0, maximumFractionDigits: key === "sales" ? 2 : 0 });
  return `${key === "sales" ? "৳" : ""}${number.format(value)}`;
}

export default function MetricTrendCard({ metricKey, metric, unit, range }: {
  metricKey: TrendMetricKey;
  metric: HomeMetric;
  unit: BucketUnit | null;
  range: HomeSummary["range"];
}) {
  const copy = COPY[metricKey];
  const since = range?.since ?? null;
  const comparedSince = range?.compared_with?.since ?? null;
  const points = unit && since ? trendPoints(metric, unit, since) : [];
  const hasPrevious = points.some((point) => point.previous !== null);
  // About seven labels across, whatever the bucket count.
  const tickInterval = Math.max(0, Math.ceil(points.length / 8) - 1);

  return (
    <div data-testid={`home-metric-trend-${metricKey}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-[26px] font-semibold tabular-nums tracking-[-0.01em] text-[#111110]">{formatValue(metricKey, metric.value)}</span>
        {metric.change != null && (
          <span className={`text-[22px] font-medium tabular-nums ${metric.change < 0 ? "text-[#d05555]" : "text-[#2e9e5b]"}`}>
            {metric.change > 0 ? "+" : metric.change < 0 ? "−" : ""}{Math.abs(metric.change)}%
          </span>
        )}
      </div>
      <p className="mt-2 text-[13px] font-medium text-[#111110]">{copy.title}</p>
      <p className="text-[13px] text-[#55534E]">{copy.description}</p>

      {points.length > 0 ? (
        <div className="mt-4 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#ECEAE4" />
              <XAxis dataKey="label" interval={tickInterval} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6F6D68" }} />
              <YAxis width={56} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6F6D68" }} tickFormatter={(value: number) => formatValue(metricKey, value, true)} />
              <Tooltip
                cursor={{ stroke: "#D8D6D0" }}
                contentStyle={{ borderRadius: 8, border: "1px solid #ECEAE4", fontSize: 12 }}
                formatter={(value: number, name: string) => [formatValue(metricKey, value), name === "current" ? "This period" : "Compared"]}
              />
              {hasPrevious && (
                <Line type="monotone" dataKey="previous" stroke={PREVIOUS_COLOR} strokeWidth={2} strokeDasharray="3 4" dot={false} isAnimationActive={false} />
              )}
              <Line type="monotone" dataKey="current" stroke={CURRENT_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-4 text-[12px] text-[#8C8A84]">
          {metric.previous != null ? `Compared period: ${formatValue(metricKey, metric.previous)}. ` : ""}
          No chart for this period.
        </p>
      )}

      {points.length > 0 && since && (
        <div className="mt-3 flex justify-center gap-6 text-[12px] text-[#55534E]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: CURRENT_COLOR }} />
            {periodLabel(since, range?.until)}
          </span>
          {hasPrevious && comparedSince && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: PREVIOUS_COLOR }} />
              {periodLabel(comparedSince, range?.compared_with?.until)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
