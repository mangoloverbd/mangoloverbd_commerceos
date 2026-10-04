import { useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";

// Deterministic 0–1 noise so sparkle dots don't jump between renders.
function seeded(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

// Stepped line chart (workflow-editor "growth chart" shape, graphite ink palette).
// Sum consecutive points into at most `max` steps so dense series (e.g. 24
// hourly buckets) stay legible. Labels become "start – end" (using `endLabels`
// for the end when points are spans like hours), or just the end when
// `endOnly` (running totals are labelled by where they end).
function groupSeries(
  values: number[],
  labels: string[] | undefined,
  endLabels: string[] | undefined,
  max: number,
  endOnly: boolean
) {
  if (values.length <= max && !endLabels) return { values, labels };
  const size = Math.max(1, Math.ceil(values.length / max));
  const grouped: number[] = [];
  const groupedLabels: string[] = [];
  for (let i = 0; i < values.length; i += size) {
    grouped.push(values.slice(i, i + size).reduce((sum, v) => sum + v, 0));
    const lastIndex = Math.min(i + size, values.length) - 1;
    const first = labels?.[i];
    const last = endLabels?.[lastIndex] ?? labels?.[lastIndex];
    groupedLabels.push(endOnly ? last ?? "" : first && last && first !== last ? `${first} – ${last}` : first ?? "");
  }
  return { values: grouped, labels: labels ? groupedLabels : undefined };
}

// Smooth path through points that never overshoots between them
// (Fritsch–Carlson monotone cubic), so a burst reads as a hill, not a spike.
function monotonePath(points: { x: number; y: number }[]) {
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`;
  const n = points.length;
  const slopes = points.slice(0, -1).map((p, i) => (points[i + 1].y - p.y) / (points[i + 1].x - p.x));
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === n - 1) return slopes[n - 2];
    const a = slopes[i - 1];
    const b = slopes[i];
    return a * b <= 0 ? 0 : (3 * (a + b)) / ((2 * b + a) / a + (b + 2 * a) / b);
  });
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p = points[i];
    const q = points[i + 1];
    const dx = (q.x - p.x) / 3;
    d += ` C${p.x + dx} ${p.y + tangents[i] * dx} ${q.x - dx} ${q.y - tangents[i + 1] * dx} ${q.x} ${q.y}`;
  }
  return d;
}

export function StepSparkline({
  values: rawValues,
  seed,
  labels: rawLabels,
  endLabels,
  format = (v) => v.toLocaleString(),
  width = 112,
  height = 32,
  animateOnMount = true,
  maxSteps,
  cumulative = false,
  curve = "step",
}: {
  values: number[];
  seed: string;
  labels?: string[];
  /** Where each point ends, for span points like hours ("12 PM" → end "1 PM"). */
  endLabels?: string[];
  format?: (value: number) => string;
  width?: number;
  height?: number;
  /** false: draw instantly on mount and only animate when the data changes. */
  animateOnMount?: boolean;
  /** Sum the series into at most this many steps (use for summable values). */
  maxSteps?: number;
  /** Plot the running total; tooltips read "৳X by <label>". */
  cumulative?: boolean;
  /** "step": staircase with a dot per point. "smooth": monotone curve, soft fill, end dot only. */
  curve?: "step" | "smooth";
}) {
  const grouped =
    maxSteps || endLabels
      ? groupSeries(rawValues, rawLabels, endLabels, maxSteps ?? rawValues.length, cumulative)
      : { values: rawValues, labels: rawLabels };
  const labels = grouped.labels;
  let runningTotal = 0;
  const values = cumulative ? grouped.values.map((v) => (runningTotal += v)) : grouped.values;
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);

  const signature = values.join(",");
  const mountSignature = useRef(animateOnMount ? null : signature);
  const animateIn = mountSignature.current !== signature;
  useEffect(() => {
    if (mountSignature.current !== signature) mountSignature.current = null;
  }, [signature]);

  const top = 4;
  const floor = height - 1;
  const bottom = floor - 3;
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values) > lo ? Math.max(0, ...values) : lo + 1;
  const y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  const base = y(0);
  const step = width / Math.max(values.length, 1);
  const segments = values.map((value, i) => ({ x0: i * step, x1: (i + 1) * step, value }));

  const smooth = curve === "smooth";
  const points = segments.map((seg) => ({ x: (seg.x0 + seg.x1) / 2, y: y(seg.value) }));
  // Steps rise through a soft S-curve instead of a hard vertical riser:
  // flat into the boundary, ease up/down, flat out. `ease` is the half-width.
  const ease = Math.min(step * 0.35, 7);
  const line = smooth
    ? `M0 ${points[0]?.y ?? base} H${points[0]?.x ?? 0} ${monotonePath(points).replace(/^M[^C]*/, "")} H${width}`
    : segments
        .map((s, i) => {
          const yi = y(s.value);
          if (i === 0) return `M${s.x0} ${yi}`;
          const prev = y(segments[i - 1].value);
          if (prev === yi) return "";
          return `H${s.x0 - ease} C${s.x0} ${prev} ${s.x0} ${yi} ${s.x0 + ease} ${yi}`;
        })
        .concat(`H${width}`)
        .join(" ");
  const area = `${line} V${base} H0 Z`;

  const sparkles = (smooth ? [] : segments)
    .flatMap((s, i) =>
      Array.from({ length: Math.round((s.x1 - s.x0) / 6) }, (_, dot) => {
        const k = `${seed}-${i}-${dot}`;
        const from = Math.min(y(s.value), base);
        const span = Math.abs(base - y(s.value));
        return {
          key: k,
          cx: s.x0 + 2 + seeded(`${k}-x`) * Math.max(0, s.x1 - s.x0 - 4),
          cy: from + 3 + seeded(`${k}-y`) * Math.max(0, span - 6),
          r: 0.35 + seeded(`${k}-r`) * 0.45,
          opacity: 0.25 + seeded(`${k}-o`) * 0.5,
          visible: span > 6,
        };
      })
    )
    .filter((dot) => dot.visible);

  const hovered = hover === null ? null : segments[hover];

  return (
    <span className="relative block shrink-0">
      <svg
        data-sparkline
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id={`${id}-line`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={width} y2="0">
            <stop stopColor="#121212" stopOpacity="0.22" />
            <stop offset="0.55" stopColor="#121212" stopOpacity="0.6" />
            <stop offset="1" stopColor="#121212" />
          </linearGradient>
          <linearGradient id={`${id}-fill`} gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={bottom}>
            <stop stopColor="#121212" stopOpacity={smooth ? 0.1 : 0.08} />
            <stop offset="1" stopColor="#121212" stopOpacity="0" />
          </linearGradient>
          <filter id={`${id}-glow`} x="-10%" y="-40%" width="120%" height="220%">
            <feDropShadow dx="0" dy="3" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.1" />
          </filter>
        </defs>

        {(!smooth || lo < 0) && <line
          x1={0}
          x2={width}
          y1={lo < 0 ? base : floor}
          y2={lo < 0 ? base : floor}
          stroke="#121212"
          strokeOpacity="0.12"
          strokeDasharray="2 4"
          strokeLinecap="round"
        />}

        <g key={`${seed}-${signature}`}>
          <motion.path
            d={area}
            fill={`url(#${id}-fill)`}
            initial={animateIn ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          />
          {sparkles.map((dot) => (
            <circle key={dot.key} cx={dot.cx} cy={dot.cy} r={dot.r} fill="#121212" opacity={dot.opacity * 0.45} />
          ))}
          <motion.path
            d={line}
            fill="none"
            stroke={`url(#${id}-line)`}
            strokeWidth={smooth ? 1.5 : 1.25}
            strokeLinejoin="round"
            strokeLinecap="round"
            filter={smooth ? undefined : `url(#${id}-glow)`}
            initial={animateIn ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: [0.215, 0.61, 0.355, 1] }}
          />
          {smooth && points.length > 0 && (
            <circle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r={5}
              fill="#121212"
              opacity={0.08}
            />
          )}
          {segments.map((seg, i) => {
            const latest = i === segments.length - 1;
            if (smooth && !latest) return null;
            return (
              <motion.circle
                key={i}
                data-point
                cx={(seg.x0 + seg.x1) / 2}
                cy={y(seg.value)}
                r={latest ? 2.25 : 1.75}
                fill={latest ? "#121212" : "#ffffff"}
                stroke="#121212"
                strokeOpacity={latest ? 1 : 0.22 + (0.6 * i) / Math.max(1, segments.length - 1)}
                strokeWidth={1}
                initial={animateIn ? { scale: 0, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.15 + (0.75 * i) / Math.max(1, segments.length), ease: [0.215, 0.61, 0.355, 1] }}
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              />
            );
          })}
        </g>

        {hovered && (
          <g pointerEvents="none">
            <line
              x1={(hovered.x0 + hovered.x1) / 2}
              x2={(hovered.x0 + hovered.x1) / 2}
              y1={y(hovered.value)}
              y2={base}
              stroke="#121212"
              strokeOpacity="0.2"
              strokeDasharray="2 3"
            />
            <circle
              cx={(hovered.x0 + hovered.x1) / 2}
              cy={y(hovered.value)}
              r={3}
              fill="white"
              stroke="#121212"
              strokeWidth={1.5}
            />
          </g>
        )}

        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          onPointerMove={(event) => {
            const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
            setHover(Math.min(values.length - 1, Math.max(0, Math.floor(x / step))));
          }}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hovered && (
        <span
          role="tooltip"
          style={{ left: (hovered.x0 + hovered.x1) / 2, top: height + 8 }}
          className="pointer-events-none absolute z-20 flex -translate-x-1/2 flex-col items-center rounded-[8px] bg-white px-2.5 py-1.5 text-center whitespace-nowrap shadow-[0_8px_16px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.08),inset_0_1px_0_rgb(255_255_255/1)]"
        >
          <span className="text-[13px] leading-5 font-[550] text-[#121212] tabular-nums">{format(hovered.value)}</span>
          {labels?.[hover!] && (
            <span className="text-[11px] leading-4 text-black/50">
              {cumulative ? `by ${labels[hover!]}` : labels[hover!]}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
