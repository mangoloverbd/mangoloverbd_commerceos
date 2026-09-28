import { useId, useMemo, type ReactNode } from "react";
import { EChart } from "@/components/business-report/EChart";
import { CHART, OUTCOME_COLORS, OUTCOME_KEYS, OUTCOME_LABELS, categoricalColor } from "@/components/business-report/chartTheme";
import type { BusinessReportResponse } from "@/components/business-report/types";
import {
  approvalBand,
  approvalGaugeOption,
  bestDayOption,
  intakeGridOption,
  outcomeSankeyOption,
  productRingsOption,
  sankeyParticipants,
  sourceMixOption,
} from "@/lib/businessReportCharts";
import { groupSourceMix, maxIndex, rate } from "@/lib/businessReportMetrics";

type PanelProps = { report: BusinessReportResponse; reduceMotion: boolean | null };

const formatNumber = (value: number) => Number(value || 0).toLocaleString("en-BD");
const formatTaka = (value: number) => `৳${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
const formatKg = (value: number) => `${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })} kg`;
const signedTaka = (value: number) => {
  const rounded = Math.round(Math.abs(value || 0));
  if (rounded === 0) return "৳0";
  return `${value < 0 ? "−" : ""}৳${rounded.toLocaleString("en-BD")}`;
};

const OUTCOME_COUNT_FIELDS = {
  approved: "approved_count",
  pending: "pending_count",
  cancelled: "cancelled_count",
  returned: "returned_count",
} as const;

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
  const { active, outcomes } = useMemo(() => sankeyParticipants(report.sources), [report.sources]);
  const { summary } = report;
  const moving = rate(summary.approved_value, summary.order_value);
  return (
    <Panel
      eyebrow="Order outcomes"
      title="Where each channel's orders end up"
      aside={<span className="rounded-full bg-black/[0.05] px-3 py-1 text-[11px] tabular-nums text-black/70">{`${formatNumber(active.length)} ${active.length === 1 ? "source" : "sources"} · ${formatNumber(outcomes.length)} ${outcomes.length === 1 ? "outcome" : "outcomes"}`}</span>}
    >
      <div className="flex gap-7">
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Total booked</p>
          <p className="mt-1 text-[26px] font-light tabular-nums tracking-[-0.03em] text-black">{formatTaka(summary.order_value)}</p>
        </div>
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Approved by value</p>
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
            <span className="h-2 w-2 rounded-[2px]" style={{ background: categoricalColor(index) }} />
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
  const { summary } = report;
  const approvalRate = rate(summary.approved_count, summary.intake_count);
  const option = useMemo(() => approvalGaugeOption(approvalRate), [approvalRate]);
  const band = approvalBand(approvalRate);
  return (
    <Panel eyebrow="Approval health" title="Approval rate">
      <EChart option={option} ariaLabel={`Approval rate ${approvalRate.toFixed(1)} percent, ${band.label}`} className="h-[170px] w-full" animate={!reduceMotion} />
      <div className="-mt-2 text-center">
        <p className="text-[22px] font-light tabular-nums text-black">{`${approvalRate.toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`}</p>
        <p className="text-[11px] text-black/60">
          <span className="font-medium" style={{ color: band.color }}>{band.label}</span> · {formatNumber(summary.approved_count)} of {formatNumber(summary.intake_count)}
        </p>
      </div>
      <ul aria-label="Order outcomes" className="mt-auto grid gap-1.5">
        {OUTCOME_KEYS.map((key) => {
          const count = summary[OUTCOME_COUNT_FIELDS[key]];
          return (
            <li key={key} className="grid grid-cols-[10px_1fr_auto_auto] items-center gap-2 text-[12px]">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: OUTCOME_COLORS[key] }} />
              <span>{OUTCOME_LABELS[key]}</span>
              <span className="tabular-nums">{formatNumber(count)}</span>
              <span className="min-w-[36px] text-right tabular-nums text-black/45">{Math.round(rate(count, summary.intake_count))}%</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function CoverageBar({ label, covered, total }: { label: string; covered: number; total: number }) {
  const share = rate(covered, total);
  return (
    <div className="grid gap-1.5">
      <p className="text-[10px] tabular-nums text-black/55">{label}</p>
      <div className="h-1 overflow-hidden rounded-full bg-black/[0.08]" aria-hidden="true">
        <div className="h-full rounded-full" style={{ width: `${share}%`, background: share >= 80 ? OUTCOME_COLORS.approved : OUTCOME_COLORS.pending }} />
      </div>
    </div>
  );
}

export function DeliveryEconomicsPanel({ report }: { report: BusinessReportResponse }) {
  const { summary } = report;
  const max = Math.max(summary.delivery_charged, summary.courier_fees_recorded, 1);
  const comparison = [
    { label: "Delivery charged", value: summary.delivery_charged, color: CHART.categorical[0] },
    { label: "Courier fees recorded", value: summary.courier_fees_recorded, color: CHART.categorical[2] },
  ];
  const perOrder = [
    {
      label: "Avg charge per approved order",
      value: summary.approved_count > 0 ? formatTaka(summary.delivery_charged / summary.approved_count) : "—",
    },
    {
      label: "Avg courier fee per recorded order",
      value: summary.courier_fee_order_count > 0 ? formatTaka(summary.courier_fees_recorded / summary.courier_fee_order_count) : "—",
    },
    {
      label: "Net per order",
      value: summary.intake_count > 0 ? signedTaka(summary.net_delivery_position / summary.intake_count) : "—",
    },
  ];
  return (
    <Panel eyebrow="Delivery economics" title="Charges vs courier fees">
      <div>
        <p className="text-[10px] text-black/55">Net delivery position</p>
        <p className={`mt-1 text-[26px] font-light tabular-nums tracking-[-0.03em] ${summary.net_delivery_position < 0 ? "text-[#B4473A]" : summary.net_delivery_position > 0 ? "text-[#2F7A55]" : "text-black"}`}>
          {signedTaka(summary.net_delivery_position)}
        </p>
      </div>
      <div className="grid gap-2.5">
        {comparison.map((item) => (
          <div key={item.label} className="grid gap-1.5">
            <p className="flex justify-between text-[12px]">
              <span className="text-black/60">{item.label}</span>
              <span className="tabular-nums text-black">{formatTaka(item.value)}</span>
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.08]" aria-hidden="true">
              <div className="h-full rounded-full" style={{ width: `${rate(item.value, max)}%`, background: item.color }} />
            </div>
          </div>
        ))}
      </div>
      <ul aria-label="Per-order figures" className="grid gap-1.5 border-t border-black/[0.08] pt-3">
        {perOrder.map((item) => (
          <li key={item.label} className="flex justify-between gap-2 text-[12px]">
            <span className="text-black/60">{item.label}</span>
            <span className="tabular-nums text-black">{item.value}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto grid gap-2.5 border-t border-black/[0.08] pt-3">
        <CoverageBar label={`Courier fee coverage: ${formatNumber(summary.courier_fee_order_count)} of ${formatNumber(summary.intake_count)} orders`} covered={summary.courier_fee_order_count} total={summary.intake_count} />
        <CoverageBar label={`Weight recorded on ${formatNumber(summary.weight_order_count)} of ${formatNumber(summary.intake_count)} orders`} covered={summary.weight_order_count} total={summary.intake_count} />
      </div>
    </Panel>
  );
}

export function BestDayPanel({ report, reduceMotion }: PanelProps) {
  const buckets = report.series.buckets;
  const bestIndex = useMemo(() => maxIndex(buckets.map((bucket) => bucket.order_value)), [buckets]);
  const option = useMemo(() => bestDayOption(buckets, bestIndex), [buckets, bestIndex]);
  if (report.range.from === null || report.series.granularity === "hour" || bestIndex < 0) return null;
  const best = buckets[bestIndex];
  return (
    <Panel
      eyebrow="Best day"
      title="Best day"
      aside={(
        <div className="flex flex-col gap-1.5 text-[11px] text-black/60">
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-[2px]" style={{ background: CHART.categorical[0] }} />Social &amp; manual</span>
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-[2px]" style={{ background: CHART.categorical[1] }} />Website</span>
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-[2px]" style={{ background: CHART.highlight }} />Best day</span>
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

const WEIGHT_ROW_GRID = "grid grid-cols-[10px_36px_minmax(0,1fr)_64px_64px] items-center gap-2.5";

export function ProductWeightPanel({ report, reduceMotion }: PanelProps) {
  const option = useMemo(() => productRingsOption(report.products), [report.products]);
  const total = report.products.reduce((sum, product) => sum + product.kg, 0);
  const approvedTotal = report.products.reduce((sum, product) => sum + product.approved_kg, 0);
  const ringed = report.products.filter((product) => product.kg > 0).slice(0, 5);
  if (report.products.length === 0) return null;
  return (
    <Panel
      eyebrow="Product weight"
      title="Product weight"
      aside={<span className="text-[13px] tabular-nums text-black/60">{`${formatKg(approvedTotal)} approved of ${formatKg(total)} ordered · ${formatNumber(report.products.length)} ${report.products.length === 1 ? "product" : "products"}`}</span>}
    >
      {total > 0 && (
        <div>
          <EChart option={option} ariaLabel="Share of weight by product" className="h-[110px] w-full" animate={!reduceMotion} />
          <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(ringed.length, 1)}, minmax(0, 1fr))` }}>
            {ringed.map((product) => (
              <span key={product.product_id || product.product_name} className="truncate px-1 text-center text-[11px] text-black/60">{product.product_name}</span>
            ))}
          </div>
        </div>
      )}
      <div>
        <div aria-hidden="true" className={`${WEIGHT_ROW_GRID} px-2.5 pb-1.5 text-[8px] font-medium uppercase tracking-[0.3em] text-black/50`}>
          <span />
          <span>Share</span>
          <span>Product</span>
          <span className="text-right">Ordered</span>
          <span className="text-right">Approved</span>
        </div>
        <ul aria-label="Weight by product" className="grid gap-0.5">
          {report.products.map((product, index) => {
            const outcomes = {
              approved: product.approved_kg,
              pending: product.pending_kg,
              cancelled: product.cancelled_kg,
              returned: product.returned_kg,
            };
            const outcomeTotal = OUTCOME_KEYS.reduce((sum, key) => sum + outcomes[key], 0);
            return (
              <li key={product.product_id || product.product_name} className={`${WEIGHT_ROW_GRID} rounded-lg px-2.5 py-2 text-[12px] odd:bg-black/[0.04]`}>
                <span className="h-2 w-2 rounded-[2px]" style={{ background: categoricalColor(index) }} />
                <span className="font-semibold tabular-nums">{Math.round(rate(product.kg, total))}%</span>
                <span className="grid min-w-0 gap-1">
                  <span className="truncate">{product.product_name}</span>
                  {outcomeTotal > 0 && (
                    <span
                      role="img"
                      aria-label={OUTCOME_KEYS.map((key) => `${OUTCOME_LABELS[key]} ${Math.round(rate(outcomes[key], outcomeTotal))}%`).join(", ")}
                      className="flex h-1 max-w-[240px] gap-[2px] overflow-hidden rounded-full"
                    >
                      {OUTCOME_KEYS.map((key) => outcomes[key] > 0 && (
                        <i key={key} className="block h-full" style={{ width: `${rate(outcomes[key], outcomeTotal)}%`, background: OUTCOME_COLORS[key] }} />
                      ))}
                    </span>
                  )}
                </span>
                <span data-testid="product-weight-ordered" className="text-right tabular-nums text-black/60">
                  <span className="block">{formatKg(product.kg)}</span>
                  <span className="block text-[10px] text-black/45">{`${formatNumber(product.packs)} packs`}</span>
                </span>
                <span data-testid="product-weight-approved" className="text-right tabular-nums">
                  <span className="block font-medium">{formatKg(product.approved_kg)}</span>
                  <span className="block text-[10px] text-black/45">{`${formatNumber(product.approved_packs)} packs`}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="grid gap-1.5">
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-black/60">
          {OUTCOME_KEYS.map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ background: OUTCOME_COLORS[key] }} />{OUTCOME_LABELS[key]}</span>
          ))}
        </div>
        <p className="text-[10px] text-black/45">Approved = confirmed, processing, shipped or delivered. Ordered = every order placed in this range, including pending, cancelled and returned.</p>
      </div>
    </Panel>
  );
}
