import { useId, useMemo, type ReactNode } from "react";
import { EChart } from "@/components/business-report/EChart";
import { CHART } from "@/components/business-report/chartTheme";
import { sourceMixOption } from "@/lib/businessReportCharts";
import { extraRevenueOption, leaderboardOption, YIELD_COLORS, YIELD_KEYS, YIELD_LABELS, yieldOption } from "@/lib/staffPerformanceCharts";
import { buildStaffTableRows, buildTeamFunnel, groupStaffShare } from "@/lib/staffPerformanceMetrics";
import type { StaffRow } from "@/lib/staffPerformancePresentation";

type PanelProps = { rows: StaffRow[]; reduceMotion: boolean | null };

const formatNumber = (value: number) => Number(value || 0).toLocaleString("en-BD");
const formatTaka = (value: number) => `৳${Math.round(value || 0).toLocaleString("en-BD")}`;
const formatPct = (value: number) => `${value.toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`;

function Panel({ eyebrow, title, aside, children }: { eyebrow: string; title: string; aside?: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3 rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5">
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

function Swatch({ color }: { color: string }) {
  return <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color }} />;
}

export function LeaderboardPanel({ rows, reduceMotion }: PanelProps) {
  const tableRows = useMemo(() => buildStaffTableRows(rows), [rows]);
  const option = useMemo(() => leaderboardOption(tableRows), [tableRows]);
  const top = [...tableRows].filter((item) => item.value > 0).sort((a, b) => b.value - a.value)[0];
  return (
    <Panel
      eyebrow="Leaderboard"
      title="Confirmed value by staff"
      aside={top && (
        <div className="text-right">
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/60">Top this period</p>
          <p className="mt-1 text-[22px] font-light tracking-[-0.03em] text-black">{top.name}</p>
        </div>
      )}
    >
      {top
        ? <EChart option={option} ariaLabel="Confirmed value for each staff member, ranked" className="h-[260px] w-full" animate={!reduceMotion} />
        : <p className="py-10 text-center text-[12px] text-black/55">No confirmed orders in this range.</p>}
    </Panel>
  );
}

export function OrderYieldPanel({ rows, reduceMotion }: PanelProps) {
  const tableRows = useMemo(() => buildStaffTableRows(rows), [rows]);
  const funnel = useMemo(() => buildTeamFunnel(rows), [rows]);
  const teamShare = funnel.assigned > 0 ? (funnel.delivered / funnel.assigned) * 100 : null;
  const option = useMemo(() => yieldOption(tableRows, teamShare), [tableRows, teamShare]);
  return (
    <Panel
      eyebrow="Order yield"
      title="Where every assigned order ended up"
      aside={teamShare !== null && <span className="rounded-full bg-black/[0.05] px-3 py-1 text-[11px] tabular-nums text-black/70">Team delivered {formatPct(teamShare)} of assigned</span>}
    >
      {teamShare !== null
        ? <EChart option={option} ariaLabel="Share of each member's assigned orders that were delivered, in transit, returned, cancelled or not confirmed" className="h-[260px] w-full" animate={!reduceMotion} />
        : <p className="py-10 text-center text-[12px] text-black/55">No assigned orders in this range.</p>}
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-black/60">
        {YIELD_KEYS.map((key) => <span key={key} className="inline-flex items-center gap-1.5"><Swatch color={YIELD_COLORS[key]} />{YIELD_LABELS[key]}</span>)}
      </div>
      <p className="text-[10px] text-black/45">Sorted by delivered ÷ assigned · dashed line = team average</p>
    </Panel>
  );
}

export function TeamFunnelPanel({ rows }: PanelProps) {
  const funnel = useMemo(() => buildTeamFunnel(rows), [rows]);
  const tableRows = useMemo(() => buildStaffTableRows(rows), [rows]);
  const width = (value: number) => (funnel.assigned > 0 ? `${Math.max(2, (value / funnel.assigned) * 100)}%` : "0%");
  const share = (value: number) => (funnel.assigned > 0 ? formatPct((value / funnel.assigned) * 100) : "—");
  const steps = [
    { label: "Assigned", value: funnel.assigned, color: CHART.ink, drop: `${formatNumber(funnel.notConfirmed + funnel.cancelled)} not confirmed (${formatNumber(funnel.cancelled)} cancelled)` },
    { label: "Confirmed, not cancelled", value: funnel.confirmed, color: CHART.ink, drop: `${formatNumber(funnel.returned)} RTO · ${formatNumber(funnel.inTransit)} in transit` },
    { label: "Delivered", value: funnel.delivered, color: YIELD_COLORS.delivered, drop: null },
  ];
  const byConfirmation = tableRows.filter((item) => item.confRate !== null).sort((a, b) => (b.confRate ?? 0) - (a.confRate ?? 0));
  return (
    <Panel eyebrow="Team funnel" title="From assigned to delivered">
      <div className="grid gap-2">
        {steps.map((step) => (
          <div key={step.label} className="grid gap-1">
            <div className="grid grid-cols-[132px_minmax(0,1fr)_52px] items-center gap-2.5 text-[12px]">
              <span>{step.label}</span>
              <div className="h-[22px] rounded-md" style={{ width: width(step.value), background: step.color }}>
                <span className="block px-2 text-[11px] font-medium leading-[22px] tabular-nums text-[#FAFAF8]">{formatNumber(step.value)}</span>
              </div>
              <span className="text-right tabular-nums text-black/55">{share(step.value)}</span>
            </div>
            {step.drop && <p className="pl-[142px] text-[11px] tabular-nums text-[#B4473A]">− {step.drop}</p>}
          </div>
        ))}
      </div>
      {byConfirmation.length > 0 && (
        <ul aria-label="Confirmation rate by staff" className="mt-auto grid gap-1.5 border-t border-black/[0.08] pt-3">
          {byConfirmation.map((item) => (
            <li key={item.key} className="grid gap-1 text-[11px]">
              <span className="flex justify-between"><span className="text-black/60">{item.name}</span><span className={`tabular-nums ${item.flags.confRate === "worse" ? "font-medium text-[#B4473A]" : ""}`}>{formatPct(item.confRate ?? 0)}</span></span>
              <span className="h-1.5 overflow-hidden rounded-full bg-black/[0.08]" aria-hidden="true">
                <span className="block h-full rounded-full" style={{ width: `${item.confRate}%`, background: item.flags.confRate === "worse" ? "#B4473A" : CHART.ink }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function TeamContributionPanel({ rows, reduceMotion }: PanelProps) {
  const slices = useMemo(() => groupStaffShare(rows, 4), [rows]);
  const option = useMemo(() => sourceMixOption(slices), [slices]);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return (
    <Panel eyebrow="Share of confirmed value" title="Team contribution">
      {total > 0 && <EChart option={option} ariaLabel="Share of confirmed value per staff member" className="h-[180px] w-full" animate={!reduceMotion} />}
      <ul className="mt-auto grid gap-1.5">
        {slices.map((slice, index) => (
          <li key={slice.label} className="grid grid-cols-[10px_1fr_auto_auto] items-center gap-2 text-[12px]">
            <Swatch color={CHART.greys[Math.min(index, CHART.greys.length - 1)]} />
            <span className="truncate">{slice.label}</span>
            <span className="tabular-nums">{formatTaka(slice.value)}</span>
            <span className="min-w-[36px] text-right tabular-nums text-black/45">{Math.round((slice.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function ExtraRevenuePanel({ rows, reduceMotion }: PanelProps) {
  const tableRows = useMemo(() => buildStaffTableRows(rows), [rows]);
  const option = useMemo(() => extraRevenueOption(tableRows), [tableRows]);
  const hasAny = tableRows.some((item) => item.extra > 0);
  return (
    <Panel eyebrow="Extra revenue" title="Telesales, upsells and saved carts">
      {hasAny
        ? <EChart option={option} ariaLabel="Telesales, retained upsell and converted cart value per staff member" className="h-[220px] w-full" animate={!reduceMotion} />
        : <p className="py-10 text-center text-[12px] text-black/55">No telesales, upsells or saved carts in this range.</p>}
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-black/60">
        <span className="inline-flex items-center gap-1.5"><Swatch color={CHART.greys[0]} />Telesales</span>
        <span className="inline-flex items-center gap-1.5"><Swatch color={CHART.greys[2]} />Upsell kept</span>
        <span className="inline-flex items-center gap-1.5"><Swatch color={CHART.greys[3]} />Carts converted</span>
      </div>
      <p className="mt-auto text-[10px] text-black/45">Telesales orders are also counted in confirmed value.</p>
    </Panel>
  );
}
