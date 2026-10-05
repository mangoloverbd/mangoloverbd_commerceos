import { useId, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { HomeMetric } from "./types";

const number = new Intl.NumberFormat("en-US");

type MetricKey = "sessions" | "sales" | "orders" | "conversion_rate";

const METRICS: { key: MetricKey; label: string; format: (value: number) => string; adminOnly: boolean }[] = [
  { key: "sessions", label: "Sessions", format: (value) => number.format(value), adminOnly: false },
  { key: "sales", label: "Total sales", format: (value) => `৳${number.format(Math.round(value))}`, adminOnly: true },
  { key: "orders", label: "Orders", format: (value) => number.format(value), adminOnly: true },
  { key: "conversion_rate", label: "Conversion rate", format: (value) => `${value.toFixed(2)}%`, adminOnly: true },
];

const SPARK_W = 34;
const SPARK_H = 16;
const SPARK_PAD = 1.5;

/**
 * Smooth path through the points that never overshoots between them
 * (monotone cubic, Fritsch–Carlson), so a running total never appears to dip.
 */
export function smoothPath(points: [number, number][]) {
  if (points.length < 2) return "";
  const n = points.length;
  const slopes = points.slice(0, -1).map(([x, y], i) => (points[i + 1][1] - y) / (points[i + 1][0] - x));
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === n - 1) return slopes[n - 2];
    return slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  });
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) { tangents[i] = 0; tangents[i + 1] = 0; continue; }
    const a = tangents[i] / slopes[i];
    const b = tangents[i + 1] / slopes[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangents[i] = t * a * slopes[i];
      tangents[i + 1] = t * b * slopes[i];
    }
  }
  let d = `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const dx = (x1 - x0) / 3;
    d += `C${(x0 + dx).toFixed(2)},${(y0 + tangents[i] * dx).toFixed(2)} ${(x1 - dx).toFixed(2)},${(y1 - tangents[i + 1] * dx).toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)}`;
  }
  return d;
}

// The running total as a soft grey curve over a fading fill, like Shopify's metric strip.
export function Sparkline({ series }: { series: number[] }) {
  const gradientId = useId();
  if (!series.length) return null;
  // A running total is 0 when the period starts, so the curve rises from the baseline.
  const values = [0, ...series];
  const max = Math.max(...values);
  const bottom = SPARK_H - SPARK_PAD;
  const points = values.map((value, index): [number, number] => [
    SPARK_PAD + (index / (values.length - 1)) * (SPARK_W - SPARK_PAD * 2),
    max > 0 ? bottom - (value / max) * (SPARK_H - SPARK_PAD * 2) : bottom,
  ]);
  const line = smoothPath(points);
  const area = `${line}L${points[points.length - 1][0].toFixed(2)},${SPARK_H}L${points[0][0].toFixed(2)},${SPARK_H}Z`;
  return (
    <svg aria-hidden="true" width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} className="shrink-0 overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#B5B3AD" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#B5B3AD" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke="#A9A7A1" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatChange(change: number) {
  return `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change)}%`;
}

function MetricItem({ label, metric, format, locked }: {
  label: string;
  metric: HomeMetric | null;
  format: (value: number) => string;
  locked: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2" data-testid={`home-metric-${label}`}>
      <span className="text-[15px] text-[#55534E]">{label}</span>
      {locked ? (
        <span title="Admins only" aria-label={`${label}: admins only`} className="select-none text-[15px] font-semibold text-[#111110] blur-[6px]">
          ৳00,000
        </span>
      ) : (
        <div className="flex items-center gap-2 text-[15px]">
          <b className="font-semibold tabular-nums text-[#111110]">{metric ? format(metric.value) : "—"}</b>
          {metric?.series && <Sparkline series={metric.series} />}
          {metric?.change != null && <span className="tabular-nums text-[#6F6D68]">{formatChange(metric.change)}</span>}
        </div>
      )}
    </div>
  );
}

function LiveIndicator({ count }: { count: number | null }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="flex items-center gap-2 pt-1.5 text-[14px] text-[#55534E]" aria-live="polite">
      Live visitors <b className="font-semibold tabular-nums text-[#111110]">{count ?? "—"}</b>
      <span className="relative h-2.5 w-2.5 rounded-full border-2 border-[#3FA34D]" aria-hidden="true">
        <motion.span
          className="absolute -inset-[6px] rounded-full border border-dashed border-[#3FA34D]/50"
          animate={reduceMotion ? undefined : { rotate: 360 }}
          transition={{ duration: 6, ease: "linear", repeat: Infinity }}
        />
      </span>
    </div>
  );
}

export function HomeMetricStrip({ metrics, liveCount, isAdmin, scope }: {
  metrics: Record<MetricKey, HomeMetric | null> | undefined;
  liveCount: number | null;
  isAdmin: boolean;
  /** The period and channel controls on the left. */
  scope: ReactNode;
}) {
  return (
    <header className="relative z-[3] flex items-start justify-between gap-6 px-5 pt-4 max-md:flex-col max-md:px-4 max-md:pt-4">
      {scope}
      <div className="flex flex-wrap justify-center gap-x-9 gap-y-4 max-[1360px]:gap-x-6">
        {METRICS.map(({ key, label, format, adminOnly }) => (
          <MetricItem key={key} label={label} metric={metrics?.[key] ?? null} format={format} locked={adminOnly && !isAdmin} />
        ))}
      </div>
      <LiveIndicator count={liveCount} />
    </header>
  );
}
