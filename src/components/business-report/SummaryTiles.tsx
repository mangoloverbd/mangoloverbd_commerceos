import { useMemo } from "react";
import { motion } from "framer-motion";
import { EChart } from "@/components/business-report/EChart";
import type { BusinessReportResponse, SeriesBucket } from "@/components/business-report/types";
import { sparklineOption } from "@/lib/businessReportCharts";
import { percentChange, pointChange, rate } from "@/lib/businessReportMetrics";

const formatNumber = (value: number) => Number(value || 0).toLocaleString("en-BD");
const formatTaka = (value: number) => `৳${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
const formatKg = (value: number) => `${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })} kg`;
const formatPct = (value: number) => `${value.toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`;

type Delta = { text: string; tone: "good" | "bad" | "neutral" };

function percentDelta(current: number, previous: number | undefined): Delta | null {
  if (previous === undefined) return null;
  const change = percentChange(current, previous);
  if (change === null) return null;
  const rounded = Math.round(change * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return { text: `${sign}${Math.abs(rounded).toLocaleString("en-BD")}% vs previous period`, tone: rounded > 0 ? "good" : rounded < 0 ? "bad" : "neutral" };
}

function pointsDelta(current: number, previous: number | undefined, higherIsBetter: boolean): Delta | null {
  if (previous === undefined) return null;
  const rounded = Math.round(pointChange(current, previous) * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  const better = higherIsBetter ? rounded > 0 : rounded < 0;
  return { text: `${sign}${Math.abs(rounded).toLocaleString("en-BD")} pts`, tone: rounded === 0 ? "neutral" : better ? "good" : "bad" };
}

const TONE_CLASS: Record<Delta["tone"], string> = {
  good: "text-[#2F7A55]",
  bad: "text-[#B4473A]",
  neutral: "text-black/55",
};

function Tile({
  label, value, description, delta, spark, testId, delay, reduceMotion,
}: {
  label: string;
  value: string;
  description: string;
  delta: Delta | null;
  spark: number[];
  testId: string;
  delay: number;
  reduceMotion: boolean | null;
}) {
  const option = useMemo(() => sparklineOption(spark), [spark]);
  return (
    <motion.div
      data-testid={testId}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : delay, duration: 0.35 }}
      className="flex min-h-[112px] flex-col rounded-2xl bg-black/[0.04] px-5 pb-2 pt-3"
    >
      <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">{label}</p>
      <p className="mt-1 text-2xl font-light tabular-nums tracking-[-0.04em] text-black">{value}</p>
      <p className="mt-0.5 text-[11px] text-black/60">
        {description}
        {delta && <span className={`ml-1.5 font-medium tabular-nums ${TONE_CLASS[delta.tone]}`}>{delta.text}</span>}
      </p>
      {spark.length > 1 && (
        <EChart option={option} ariaLabel={`${label} trend`} className="mt-auto h-[30px] w-full" animate={!reduceMotion} />
      )}
    </motion.div>
  );
}

function pick(buckets: SeriesBucket[], field: keyof Pick<SeriesBucket, "intake_count" | "order_value" | "order_kg" | "approved_count" | "cancelled_count">) {
  return buckets.map((bucket) => bucket[field]);
}

export function SummaryTiles({ report, reduceMotion }: { report: BusinessReportResponse; reduceMotion: boolean | null }) {
  const tiles = useMemo(() => {
    const { summary, previous, series } = report;
    const prev = previous?.summary;
    const approvedRate = rate(summary.approved_count, summary.intake_count);
    const cancelledRate = rate(summary.cancelled_count, summary.intake_count);
    const buckets = series.buckets;
    return [
    {
      label: "Intake", value: formatNumber(summary.intake_count), description: "Regular orders created",
      delta: percentDelta(summary.intake_count, prev?.intake_count), spark: pick(buckets, "intake_count"), testId: "business-report-summary-intake",
    },
    {
      label: "Order value", value: formatTaka(summary.order_value - summary.cancelled_value), description: "Excludes cancelled · before delivery",
      delta: percentDelta(summary.order_value - summary.cancelled_value, prev ? prev.order_value - prev.cancelled_value : undefined),
      spark: buckets.map((bucket) => bucket.order_value - bucket.cancelled_value), testId: "business-report-summary-order-value",
    },
    {
      label: "Weight", value: formatKg(summary.order_kg), description: `Recorded on ${formatNumber(summary.weight_order_count)} of ${formatNumber(summary.intake_count)} orders`,
      delta: percentDelta(summary.order_kg, prev?.order_kg), spark: pick(buckets, "order_kg"), testId: "business-report-summary-weight",
    },
    {
      label: "Approved / progressing", value: formatNumber(summary.approved_count),
      description: `${formatPct(approvedRate)} of intake${summary.approved_kg > 0 ? ` · ${formatKg(summary.approved_kg)}` : ""}`,
      delta: pointsDelta(approvedRate, prev && prev.intake_count > 0 ? rate(prev.approved_count, prev.intake_count) : undefined, true),
      spark: pick(buckets, "approved_count"), testId: "business-report-summary-approved",
    },
    {
      label: "Cancelled", value: formatNumber(summary.cancelled_count),
      description: `${formatPct(cancelledRate)} of intake${summary.cancelled_kg > 0 ? ` · ${formatKg(summary.cancelled_kg)}` : ""}`,
      delta: pointsDelta(cancelledRate, prev && prev.intake_count > 0 ? rate(prev.cancelled_count, prev.intake_count) : undefined, false),
      spark: pick(buckets, "cancelled_count"), testId: "business-report-summary-cancelled",
    },
    ];
  }, [report]);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {tiles.map((tile, index) => (
        <Tile key={tile.testId} {...tile} delay={0.02 + index * 0.04} reduceMotion={reduceMotion} />
      ))}
    </div>
  );
}
