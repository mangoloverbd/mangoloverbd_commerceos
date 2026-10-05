import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { HomeMetric } from "./types";

const number = new Intl.NumberFormat("en-US");

type MetricKey = "sessions" | "sales" | "orders" | "conversion_rate";

const METRICS: { key: MetricKey; label: string; format: (value: number) => string; adminOnly: boolean }[] = [
  { key: "sessions", label: "Sessions", format: (value) => number.format(value), adminOnly: false },
  { key: "sales", label: "Total sales", format: (value) => `৳${number.format(Math.round(value))}`, adminOnly: true },
  { key: "orders", label: "Orders", format: (value) => number.format(value), adminOnly: true },
  { key: "conversion_rate", label: "Conversion rate", format: (value) => `${value.toFixed(2)}%`, adminOnly: true },
];

export function Sparkline({ series, up }: { series: number[] | null; up: boolean }) {
  const values = series && series.length > 1 ? series : [0, 0];
  const max = Math.max(...values);
  const points = values
    .map((value, index) => {
      const x = 1 + (index / (values.length - 1)) * 32;
      const y = max > 0 ? 12 - (value / max) * 10 : 12;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg aria-hidden="true" width="34" height="14" viewBox="0 0 34 14" className="shrink-0">
      <polyline points={points} fill="none" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
        className={up ? "stroke-[#3FA34D]" : "stroke-[#8C8A84]"} />
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
  const up = (metric?.change ?? 0) > 0;
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
          {metric && <Sparkline series={metric.series} up={up} />}
          {metric?.change != null && (
            <span className={cn("tabular-nums", up ? "text-[#3FA34D]" : "text-[#8C8A84]")}>{formatChange(metric.change)}</span>
          )}
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
    <header className="relative z-[3] flex items-start justify-between gap-6 px-8 pt-[26px] max-md:flex-col max-md:px-4 max-md:pt-4">
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
