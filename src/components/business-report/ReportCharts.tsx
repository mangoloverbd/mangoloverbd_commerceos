import { useId, useMemo, type ReactNode } from "react";
import { EChart } from "@/components/business-report/EChart";
import { CHART } from "@/components/business-report/chartTheme";
import type { BusinessReportResponse } from "@/components/business-report/types";
import {
  approvalBand,
  approvalGaugeOption,
  bestDayOption,
  intakeGridOption,
  outcomeSankeyOption,
  productRingsOption,
  sourceMixOption,
} from "@/lib/businessReportCharts";
import { groupSourceMix, maxIndex, rate } from "@/lib/businessReportMetrics";

type PanelProps = { report: BusinessReportResponse; reduceMotion: boolean | null };

const formatNumber = (value: number) => Number(value || 0).toLocaleString("en-BD");
const formatTaka = (value: number) => `৳${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
const formatKg = (value: number) => `${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })} kg`;

function Panel({ eyebrow, title, aside, children, className = "" }: { eyebrow: string; title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={`flex min-w-0 flex-col gap-3 rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">{eyebrow}</p>
          <h2 id={headingId} className="mt-1 font-sf-display text-[15px] font-semibold text-black">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function IntakeRhythmPanel({ report, reduceMotion }: PanelProps) {
  const { option, ordersPerCell, peakIndex } = useMemo(() => intakeGridOption(report.hourly_profile), [report.hourly_profile]);
  const peak = peakIndex >= 0 ? report.hourly_profile[peakIndex] : null;
  const label = peak
    ? `Orders by hour of day, peak ${peak.label} with ${formatNumber(peak.intake_count)} orders`
    : "Orders by hour of day, no orders";
  return (
    <Panel
      eyebrow="Intake rhythm"
      title="When orders arrive"
      aside={<p className="text-right font-mono text-[10px] leading-relaxed text-black/45">// CELL: <b className="font-medium text-black">{ordersPerCell} {ordersPerCell === 1 ? "ORDER" : "ORDERS"}</b><br />// HOUR OF DAY</p>}
    >
      <div className="flex gap-7 font-mono">
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">[Σ] Total</p>
          <p className="mt-1 text-[26px] font-light tabular-nums tracking-[-0.03em] text-black">{formatNumber(report.summary.intake_count)}</p>
        </div>
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">[⬆] Peak</p>
          <p className="mt-1 text-[26px] font-light tabular-nums tracking-[-0.03em] text-black">{peak ? peak.label : "—"}</p>
        </div>
      </div>
      <EChart option={option} ariaLabel={label} className="h-[250px] w-full" animate={!reduceMotion} />
    </Panel>
  );
}

export function OutcomeSankeyPanel({ report, reduceMotion }: PanelProps) {
  const option = useMemo(() => outcomeSankeyOption(report.sources), [report.sources]);
  const { summary } = report;
  const moving = rate(summary.approved_value, summary.order_value);
  return (
    <Panel
      eyebrow="Order outcomes"
      title="Where each channel's orders end up"
      aside={<span className="rounded-full bg-black/[0.05] px-3 py-1 text-[11px] tabular-nums text-black/70">{report.sources.length} sources · 4 outcomes</span>}
    >
      <div className="flex gap-7">
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Total booked</p>
          <p className="mt-1 text-[26px] font-light tabular-nums tracking-[-0.03em] text-black">{formatTaka(summary.order_value)}</p>
        </div>
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Delivered or moving</p>
          <p className="mt-1 text-[26px] font-light tabular-nums tracking-[-0.03em] text-black">{moving.toLocaleString("en-BD", { maximumFractionDigits: 1 })}%</p>
        </div>
      </div>
      <EChart option={option} ariaLabel="Order value flowing from each source to approved, pending, cancelled and RTO" className="h-[250px] w-full" animate={!reduceMotion} />
    </Panel>
  );
}

export function SourceMixPanel({ report, reduceMotion }: PanelProps) {
  const slices = useMemo(() => groupSourceMix(report.sources, 4), [report.sources]);
  const option = useMemo(() => sourceMixOption(slices), [slices]);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return (
    <Panel eyebrow="Source mix" title="Order value by channel">
      <EChart option={option} ariaLabel="Share of order value by source" className="h-[200px] w-full" animate={!reduceMotion} />
      <ul className="grid gap-1.5">
        {slices.map((slice, index) => (
          <li key={slice.label} className="grid grid-cols-[10px_1fr_auto_auto] items-center gap-2 text-[12px]">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: CHART.greys[Math.min(index, CHART.greys.length - 1)] }} />
            <span>{slice.label}</span>
            <span className="tabular-nums">{formatTaka(slice.value)}</span>
            <span className="min-w-[36px] text-right tabular-nums text-black/45">{Math.round(rate(slice.value, total))}%</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function ApprovalGaugePanel({ report, reduceMotion }: PanelProps) {
  const approvalRate = rate(report.summary.approved_count, report.summary.intake_count);
  const option = useMemo(() => approvalGaugeOption(approvalRate), [approvalRate]);
  const band = approvalBand(approvalRate);
  return (
    <Panel eyebrow="Approval health" title="Approval rate">
      <EChart option={option} ariaLabel={`Approval rate ${approvalRate.toFixed(1)} percent, ${band.label}`} className="h-[190px] w-full" animate={!reduceMotion} />
      <div className="-mt-2 text-center">
        <p className="text-[22px] font-light tabular-nums text-black">{`${approvalRate.toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`}</p>
        <p className="text-[11px] text-black/60">
          <span className="font-medium" style={{ color: band.color }}>{band.label}</span> · {formatNumber(report.summary.approved_count)} of {formatNumber(report.summary.intake_count)}
        </p>
      </div>
    </Panel>
  );
}

export function BestDayPanel({ report, reduceMotion }: PanelProps) {
  const buckets = report.series.buckets;
  const bestIndex = useMemo(() => maxIndex(buckets.map((bucket) => bucket.order_value)), [buckets]);
  const option = useMemo(() => bestDayOption(buckets, bestIndex), [buckets, bestIndex]);
  if (report.series.granularity === "hour" || bestIndex < 0) return null;
  const best = buckets[bestIndex];
  return (
    <Panel
      eyebrow="Best day"
      title="Best day"
      aside={(
        <div className="flex flex-col gap-1.5 text-[11px] text-black/60">
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-[2px]" style={{ background: CHART.ink }} />Social &amp; manual</span>
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-[2px]" style={{ background: CHART.greys[2] }} />Website</span>
        </div>
      )}
    >
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="text-[28px] font-light tabular-nums tracking-[-0.03em] text-black">{formatTaka(best.order_value)}</span>
        <span className="text-[13px] text-black/60">on {best.label} · {Math.round(rate(best.website_value, best.order_value))}% website</span>
      </p>
      <EChart option={option} ariaLabel={`Daily order value, best day ${best.label}`} className="h-[220px] w-full" animate={!reduceMotion} />
    </Panel>
  );
}

export function ProductWeightPanel({ report, reduceMotion }: PanelProps) {
  const option = useMemo(() => productRingsOption(report.products), [report.products]);
  const total = report.products.reduce((sum, product) => sum + product.kg, 0);
  if (report.products.length === 0) return null;
  return (
    <Panel
      eyebrow="Product weight"
      title="Product weight"
      aside={<span className="text-[13px] tabular-nums text-black/60">{formatKg(total)} · {formatNumber(report.products.length)} products</span>}
    >
      {total > 0 && <EChart option={option} ariaLabel="Share of weight by product" className="h-[110px] w-full" animate={!reduceMotion} />}
      <ul className="grid gap-0.5">
        {report.products.map((product, index) => (
          <li key={product.product_id || product.product_name} className="grid grid-cols-[10px_44px_minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] odd:bg-black/[0.04]">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: CHART.greys[Math.min(index, 3)] }} />
            <span className="font-semibold tabular-nums">{Math.round(rate(product.kg, total))}%</span>
            <span className="truncate">{product.product_name}</span>
            <span className="text-[11px] tabular-nums text-black/45">{`${formatKg(product.approved_kg)} approved · ${formatNumber(product.packs)} packs`}</span>
            <span className="tabular-nums">{formatKg(product.kg)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
