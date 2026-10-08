import { lazy, Suspense, useId, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { Format } from "@number-flow/react";
import { MetricNumberFlow } from "@/components/ui/number-flow";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { RISE_EASE } from "./Rise";
import { perBucket, type BucketUnit } from "./metricTrend";
import type { HomeMetric, HomeSummary } from "./types";

// Recharts loads on the first hover, keeping it out of Home's first paint.
const MetricTrendCard = lazy(() => import("./MetricTrendCard"));

type MetricKey = "sessions" | "sales" | "orders" | "conversion_rate";

// How each value rolls in MetricNumberFlow: currency, plain count or two-decimal rate.
const METRICS: { key: MetricKey; label: string; prefix: string; suffix?: string; format?: Format; adminOnly: boolean }[] = [
  { key: "sessions", label: "Sessions", prefix: "", adminOnly: false },
  { key: "sales", label: "Total sales", prefix: "৳", adminOnly: true },
  { key: "orders", label: "Orders", prefix: "", adminOnly: true },
  { key: "conversion_rate", label: "Conversion rate", prefix: "", suffix: "%", format: { minimumFractionDigits: 2, maximumFractionDigits: 2 }, adminOnly: true },
];

const CHANGE_FORMAT: Format = { maximumFractionDigits: 0, signDisplay: "exceptZero" };

const SPARK_W = 32;
const SPARK_H = 20;
const SPARK_PAD = 2;
// Buckets are averaged down to this many points so the wave stays legible at sparkline size.
const SPARK_POINTS = 6;

// Shopify's tones: green when up, red when down, grey with no baseline.
const TONES = {
  up: { from: "#C9EBC2", to: "#2F9A3E", text: "text-[#3FA34D]" },
  down: { from: "#F6CBC8", to: "#D23F3F", text: "text-[#D64545]" },
  flat: { from: "#D6D4CE", to: "#A9A7A1", text: "text-[#6F6D68]" },
} as const;
type Tone = keyof typeof TONES;

const toneOf = (change: number | null): Tone => (change == null || change === 0 ? "flat" : change > 0 ? "up" : "down");

// Averages consecutive buckets into at most `count` points.
function downsample(values: number[], count = SPARK_POINTS) {
  if (values.length <= count) return values;
  return Array.from({ length: count }, (_, i) => {
    const group = values.slice(Math.floor((i * values.length) / count), Math.floor(((i + 1) * values.length) / count));
    return group.reduce((sum, value) => sum + value, 0) / group.length;
  });
}

/**
 * Uniform cubic B-spline through the points' hull (d3's curveBasis): it starts and
 * ends on the first and last points and rounds every turn in between, which gives
 * the soft wave of Shopify's sparklines. It never leaves the points' range.
 */
export function smoothPath(points: [number, number][]) {
  if (points.length < 2) return "";
  const f = (n: number) => n.toFixed(2);
  const [x0, y0] = points[0];
  let d = `M${f(x0)},${f(y0)}`;
  if (points.length === 2) return `${d}L${f(points[1][0])},${f(points[1][1])}`;
  // Pad the ends so the curve meets the first and last points.
  const p = [points[0], points[0], ...points, points[points.length - 1], points[points.length - 1]];
  for (let i = 1; i < p.length - 2; i++) {
    const [bx, by] = p[i];
    const [cx, cy] = p[i + 1];
    const [dx, dy] = p[i + 2];
    d += `C${f((2 * bx + cx) / 3)},${f((2 * by + cy) / 3)} ${f((bx + 2 * cx) / 3)},${f((by + 2 * cy) / 3)} ${f((bx + 4 * cx + dx) / 6)},${f((by + 4 * cy + dy) / 6)}`;
  }
  return d;
}

// Each period's own value as a short wave, stroked in a fading green or red, like Shopify's metric strip.
export function Sparkline({ values: raw, tone }: { values: number[]; tone: Tone }) {
  const gradientId = useId();
  const reduceMotion = useReducedMotion();
  if (!raw.length) return null;
  const values = downsample(raw.length === 1 ? [raw[0], raw[0]] : raw);
  const min = Math.min(...values);
  const span = Math.max(...values) - min;
  const points = values.map((value, index): [number, number] => [
    SPARK_PAD + (index / (values.length - 1)) * (SPARK_W - SPARK_PAD * 2),
    span > 0 ? SPARK_H - SPARK_PAD - ((value - min) / span) * (SPARK_H - SPARK_PAD * 2) : SPARK_H / 2,
  ]);
  const { from, to } = TONES[tone];
  const [endX, endY] = points[points.length - 1];
  return (
    <svg aria-hidden="true" width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} className="shrink-0 overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
        {/* The line tapers in from nothing on the left, so the eye lands on today's end. */}
        <linearGradient id={`${gradientId}-fade`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="35%" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id={`${gradientId}-mask`} maskUnits="userSpaceOnUse" x="-2" y="-2" width={SPARK_W + 4} height={SPARK_H + 4}>
          <rect x="-2" y="-2" width={SPARK_W + 4} height={SPARK_H + 4} fill={`url(#${gradientId}-fade)`} />
        </mask>
      </defs>
      <motion.path
        mask={`url(#${gradientId}-mask)`}
        d={smoothPath(points)}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduceMotion ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: RISE_EASE }}
      />
      {/* The latest value, capping the line. */}
      <motion.circle
        cx={endX}
        cy={endY}
        r="2.5"
        fill={to}
        initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, delay: 0.8, ease: RISE_EASE }}
        style={{ transformOrigin: `${endX}px ${endY}px` }}
      />
    </svg>
  );
}

// Fades in a value that only exists once data has arrived (change, sparkline).
function Appear({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      className="flex items-center"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.25 }}
    >
      {children}
    </motion.span>
  );
}

// Hovering a metric opens its chart over the period, like Shopify's Home.
function MetricTrend({ metricKey, metric, unit, range, children }: {
  metricKey: MetricKey;
  metric: HomeMetric | null;
  unit: BucketUnit | null;
  range: HomeSummary["range"];
  children: ReactNode;
}) {
  // The wrapper stays mounted while loading: swapping it in when data arrives
  // would remount the number and skip its roll-up from 0.
  return (
    <HoverCard openDelay={150} closeDelay={100} {...(metric ? {} : { open: false })}>
      <HoverCardTrigger asChild>
        <div className="cursor-default">{children}</div>
      </HoverCardTrigger>
      {metric && (
        <HoverCardContent sideOffset={12} className="w-[min(560px,calc(100vw-24px))] rounded-2xl border-[#ECEAE4] bg-white p-6">
          <Suspense fallback={<div className="h-[340px]" />}>
            <MetricTrendCard metricKey={metricKey} metric={metric} unit={unit} range={range} />
          </Suspense>
        </HoverCardContent>
      )}
    </HoverCard>
  );
}

const BUCKET_MS = { hour: 60 * 60 * 1000, day: 24 * 60 * 60 * 1000 } as const;
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

// Each bucket's own value, leaving out one still in progress so the wave doesn't dip at the end.
function sparkValuesOf(metric: HomeMetric | null, unit: BucketUnit | null, until: string | undefined) {
  const values = metric?.buckets ?? perBucket(metric?.series ?? null);
  if (!values || !unit || !until || values.length < 3) return values;
  const inProgress = (Date.parse(until) + DHAKA_OFFSET_MS) % BUCKET_MS[unit] !== 0;
  return inProgress ? values.slice(0, -1) : values;
}

function MetricItem({ label, metric, loading, prefix, suffix, format, locked, sparkValues }: {
  label: string;
  metric: HomeMetric | null;
  /** First load: show 0 so the value rolls up when it arrives. */
  loading: boolean;
  prefix: string;
  suffix?: string;
  format?: Format;
  locked: boolean;
  sparkValues: number[] | null;
}) {
  const tone = toneOf(metric?.change ?? null);
  return (
    <div className="flex flex-col items-center gap-2" data-testid={`home-metric-${label}`}>
      <span className="text-[13px] text-[#55534E]">{label}</span>
      {locked ? (
        <span title="Admins only" aria-label={`${label}: admins only`} className="select-none text-[14px] font-medium text-[#111110] blur-[6px]">
          ৳00,000
        </span>
      ) : (
        <div className="flex items-center gap-2 text-[14px]">
          {loading || metric ? (
            <MetricNumberFlow
              value={metric?.value ?? 0}
              prefix={prefix}
              suffix={suffix}
              format={format}
              className={`font-medium tabular-nums text-[#111110] transition-opacity duration-300 ${loading ? "opacity-30" : ""}`}
            />
          ) : (
            <b className="font-medium text-[#111110]">—</b>
          )}
          {sparkValues && <Sparkline values={sparkValues} tone={tone} />}
          {metric?.change != null && (
            <Appear>
              <MetricNumberFlow value={metric.change} prefix="" suffix="%" format={CHANGE_FORMAT} className={`tabular-nums ${TONES[tone].text}`} />
            </Appear>
          )}
        </div>
      )}
    </div>
  );
}

function LiveIndicator({ count, loading, pulse }: { count: number | null; loading: boolean; pulse: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="flex items-center gap-2 pt-1.5 text-[13px] text-[#55534E]" aria-live="polite">
      Live visitors {count === null && !loading
        ? <b className="font-medium text-[#111110]">—</b>
        : <MetricNumberFlow value={count ?? 0} prefix="" className={`font-medium tabular-nums text-[#111110] transition-opacity duration-300 ${loading ? "opacity-30" : ""}`} />}
      <span className="relative h-2.5 w-2.5 rounded-full border-2 border-[#3FA34D]" aria-hidden="true">
        {/* Spins once each time the globe's pin lands on a new place. */}
        {pulse > 0 && !reduceMotion && (
          <motion.span
            key={pulse}
            className="absolute -inset-[6px] rounded-full border border-dashed border-[#3FA34D]/60"
            initial={{ opacity: 0, rotate: 0, scale: 0.7 }}
            animate={{ opacity: [0, 1, 1, 0], rotate: 140, scale: 1 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        )}
      </span>
    </div>
  );
}

export function HomeMetricStrip({ metrics, loading, liveCount, livePulse = 0, isAdmin, scope, range, unit = null }: {
  metrics: Record<MetricKey, HomeMetric | null> | undefined;
  /** The reported period, for the hover chart's dates. */
  range?: HomeSummary["range"];
  /** Hours for a single day, days for a span; null for all time. */
  unit?: BucketUnit | null;
  /** No summary yet (first load). */
  loading: boolean;
  liveCount: number | null;
  /** Bumped each time the globe's pin lands; spins the live ring once. */
  livePulse?: number;
  isAdmin: boolean;
  /** The period and channel controls on the left. */
  scope: ReactNode;
}) {
  return (
    <header className="relative z-[3] flex items-start justify-between gap-6 px-3 pt-4 max-md:flex-col max-md:px-3 max-md:pt-4">
      {scope}
      <div className="flex flex-wrap justify-center gap-x-9 gap-y-4 max-[1360px]:gap-x-6">
        {METRICS.map(({ key, label, prefix, suffix, format, adminOnly }) => (
          <MetricTrend key={key} metricKey={key} metric={adminOnly && !isAdmin ? null : metrics?.[key] ?? null} unit={unit} range={range}>
            <MetricItem label={label} metric={metrics?.[key] ?? null} loading={loading} prefix={prefix} suffix={suffix} format={format} locked={adminOnly && !isAdmin} sparkValues={sparkValuesOf(metrics?.[key] ?? null, unit, range?.until)} />
          </MetricTrend>
        ))}
      </div>
      <LiveIndicator count={liveCount} loading={loading} pulse={livePulse} />
    </header>
  );
}
