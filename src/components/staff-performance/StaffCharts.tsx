import { useId, useMemo, type ReactNode } from "react";
import { EChart } from "@/components/business-report/EChart";
import { CHART, OUTCOME_COLORS, categoricalColor } from "@/components/business-report/chartTheme";
import { sourceMixOption } from "@/lib/businessReportCharts";
import { leaderboardOption, YIELD_COLORS, YIELD_KEYS, YIELD_LABELS } from "@/lib/staffPerformanceCharts";
import { buildStaffTableRows, buildTeamFunnel, extraRevenue, groupStaffShare, STAFF_FLAG_POINTS, type StaffTableRow, type YieldKey } from "@/lib/staffPerformanceMetrics";
import type { StaffRow } from "@/lib/staffPerformancePresentation";

type PanelProps = { rows: StaffRow[]; reduceMotion: boolean | null };

const formatNumber = (value: number) => Number(value || 0).toLocaleString("en-BD");
const formatTaka = (value: number) => `৳${Math.round(value || 0).toLocaleString("en-BD")}`;
const formatPct = (value: number) => `${value.toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`;

function Panel({ eyebrow, title, aside, children }: { eyebrow: string; title: string; aside?: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex min-h-0 min-w-0 flex-col gap-3 rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5 lg:h-full">
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

// Rows share the card's spare height (38–56px each) and scroll once they no longer fit.
const FILL_LIST = "-mr-2 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pr-2";
const FILL_ROW = "flex max-h-14 min-h-[38px] flex-1 flex-col justify-center gap-1";

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
        ? <EChart option={option} ariaLabel="Confirmed value for each staff member, ranked" className="min-h-[260px] w-full flex-1" animate={!reduceMotion} />
        : <p className="py-10 text-center text-[12px] text-black/55">No confirmed orders in this range.</p>}
    </Panel>
  );
}

const YIELD_ROW = "grid grid-cols-[92px_minmax(0,1fr)_52px] items-center gap-3";

export function OrderYieldPanel({ rows }: PanelProps) {
  const funnel = useMemo(() => buildTeamFunnel(rows), [rows]);
  const teamShare = funnel.handled > 0 ? (funnel.delivered / funnel.handled) * 100 : null;
  const members = useMemo(
    () => buildStaffTableRows(rows)
      .filter((item): item is StaffTableRow & { deliveredShare: number } => item.deliveredShare !== null)
      .sort((a, b) => b.deliveredShare - a.deliveredShare),
    [rows],
  );
  const share = (item: StaffTableRow & { deliveredShare: number }, key: YieldKey) => (
    key === "delivered" ? item.deliveredShare : (item.yield[key] / item.handled) * 100
  );
  return (
    <Panel
      eyebrow="Order yield"
      title="Where every handled order ended up"
      aside={teamShare !== null && <span className="rounded-full bg-black/[0.05] px-3 py-1 text-[11px] tabular-nums text-black/70">Team delivered {formatPct(teamShare)} of handled</span>}
    >
      {teamShare !== null
        ? (
          <div className="grid gap-2.5">
            <ul aria-label="Order yield by staff" className="grid gap-2.5">
              {members.map((item) => {
                const summary = `${item.name}: ${YIELD_KEYS.map((key) => `${YIELD_LABELS[key]} ${formatPct(share(item, key))}`).join(", ")} of ${formatNumber(item.handled)} handled`;
                // Mirrors flagFor's strict rule (more than STAFF_FLAG_POINTS below the team), without its 1e-9 float tolerance.
                const flagged = item.deliveredShare < teamShare - STAFF_FLAG_POINTS;
                const segments = YIELD_KEYS.filter((key) => share(item, key) > 0);
                return (
                  <li key={item.key} data-testid={`staff-yield-row-${item.key}`} className={`${YIELD_ROW} text-[12px]`}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-black">{item.name}</span>
                      <span className="block text-[10px] tabular-nums text-black/50">{formatNumber(item.handled)} handled</span>
                    </span>
                    {/* Exact % widths with no flex gap or borders, so every bar and the team tick share one scale. The gap between
                        segments is painted inside each later segment's background (left 4px left blank, but at least 2px of colour). */}
                    <div role="img" aria-label={summary} title={summary} className="relative flex h-[18px]">
                      {segments.map((key, index) => (
                        <span
                          key={key}
                          data-segment={key}
                          className="h-full shrink-0 bg-no-repeat"
                          style={{
                            width: `${share(item, key)}%`,
                            backgroundImage: `repeating-linear-gradient(90deg, ${YIELD_COLORS[key]} 0 3px, transparent 3px 5px)`,
                            ...(index > 0 ? { backgroundSize: "max(2px, calc(100% - 4px)) 100%", backgroundPosition: "right" } : {}),
                          }}
                        />
                      ))}
                      <span aria-hidden="true" data-testid="staff-yield-team-tick" className="absolute -bottom-1 -top-1 border-l-[1.5px] border-dashed border-black opacity-[0.55]" style={{ left: `${teamShare}%` }} />
                    </div>
                    <span className={`text-right text-[16px] font-medium tabular-nums ${flagged ? "text-[#B4473A]" : "text-black"}`}>{formatPct(item.deliveredShare)}</span>
                  </li>
                );
              })}
            </ul>
            <div className={YIELD_ROW} aria-hidden="true">
              <span />
              <span className="relative h-3">
                <span className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] tabular-nums text-black/60" style={{ left: `${teamShare}%` }}>Team {formatPct(teamShare)}</span>
              </span>
              <span />
            </div>
          </div>
        )
        : <p className="py-10 text-center text-[12px] text-black/55">No handled orders in this range.</p>}
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-black/60">
        {YIELD_KEYS.map((key) => <span key={key} className="inline-flex items-center gap-1.5"><Swatch color={YIELD_COLORS[key]} />{YIELD_LABELS[key]}</span>)}
      </div>
      <p className="text-[10px] text-black/45">Sorted by delivered ÷ handled · dashed line = team average</p>
      <p className="text-[10px] text-black/45">Handled = orders a member confirmed or cancelled</p>
    </Panel>
  );
}

export function TeamFunnelPanel({ rows }: PanelProps) {
  const funnel = useMemo(() => buildTeamFunnel(rows), [rows]);
  const tableRows = useMemo(() => buildStaffTableRows(rows), [rows]);
  const percent = (value: number) => (funnel.handled > 0 ? (value / funnel.handled) * 100 : 0);
  const share = (value: number) => (funnel.handled > 0 ? formatPct((value / funnel.handled) * 100) : "—");
  const steps = [
    { key: "handled", label: "Handled", value: funnel.handled, color: CHART.categorical[0] },
    { key: "confirmed", label: "Confirmed, not cancelled", value: funnel.confirmed, color: CHART.categorical[1] },
    { key: "delivered", label: "Delivered", value: funnel.delivered, color: YIELD_COLORS.delivered },
  ];
  const byConfirmation = tableRows.filter((item) => item.confRate !== null).sort((a, b) => (b.confRate ?? 0) - (a.confRate ?? 0));
  return (
    <Panel eyebrow="Team funnel" title="From handled to delivered">
      <div className="grid gap-2">
        {steps.map((step) => {
          // Below ~20% the bar is too short to hold its count, so the count sits beside it.
          const inside = percent(step.value) >= 20;
          const count = formatNumber(step.value);
          return (
            <div key={step.key} data-testid={`staff-funnel-step-${step.key}`} className="grid grid-cols-[auto_minmax(0,1fr)_44px] items-center gap-2.5 text-[12px]">
              <span className="w-[150px] whitespace-nowrap">{step.label}</span>
              <div className="flex items-center gap-1.5">
                <div className="h-[22px] shrink-0 rounded-md" style={{ width: `${Math.max(1, percent(step.value))}%`, minWidth: 3, background: step.color }}>
                  {inside && <span className="block px-2 text-[11px] font-medium leading-[22px] tabular-nums text-[#FAFAF8]">{count}</span>}
                </div>
                {!inside && <span className="text-[11px] font-medium tabular-nums text-black">{count}</span>}
              </div>
              <span className="text-right tabular-nums text-black/55">{share(step.value)}</span>
            </div>
          );
        })}
      </div>
      {byConfirmation.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 border-t border-black/[0.08] pt-3">
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/60">Confirmation rate by staff</p>
          <ul aria-label="Confirmation rate by staff" className={`${FILL_LIST} max-h-[260px] lg:max-h-none`}>
          {byConfirmation.map((item) => (
            <li key={item.key} className={`${FILL_ROW} text-[11px]`}>
              <span className="flex justify-between"><span className="text-black/60">{item.name}</span><span className={`tabular-nums ${item.flags.confRate === "worse" ? "font-medium text-[#B4473A]" : ""}`}>{formatPct(item.confRate ?? 0)}</span></span>
              <span className="h-1.5 overflow-hidden rounded-full bg-black/[0.08]" aria-hidden="true">
                <span className="block h-full rounded-full" style={{ width: `${item.confRate}%`, background: item.flags.confRate === "worse" ? OUTCOME_COLORS.cancelled : CHART.categorical[1] }} />
              </span>
            </li>
          ))}
          </ul>
        </div>
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
      {total > 0 && <EChart option={option} ariaLabel="Share of confirmed value per staff member" className="min-h-[180px] w-full flex-1" animate={!reduceMotion} />}
      <ul className="mt-auto grid gap-1.5">
        {slices.map((slice, index) => (
          <li key={slice.label} className="grid grid-cols-[10px_1fr_auto_auto] items-center gap-2 text-[12px]">
            <Swatch color={categoricalColor(index)} />
            <span className="truncate">{slice.label}</span>
            <span className="tabular-nums">{formatTaka(slice.value)}</span>
            <span className="min-w-[36px] text-right tabular-nums text-black/45">{Math.round((slice.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const EXTRA_SOURCES = [
  { key: "telesales", label: "Telesales", color: CHART.categorical[0] },
  { key: "upsell", label: "Upsell kept", color: CHART.categorical[1] },
  { key: "carts", label: "Carts converted", color: CHART.highlight },
] as const;

export function ExtraRevenuePanel({ rows }: PanelProps) {
  const members = useMemo(
    () => rows
      .map((row) => ({ key: row.user_id, name: row.display_name, ...extraRevenue(row) }))
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total),
    [rows],
  );
  const top = members[0]?.total ?? 0;
  return (
    <Panel eyebrow="Extra revenue" title="Telesales, upsells and saved carts">
      <ul aria-label="Extra revenue by source" className="grid grid-cols-3 gap-2 border-b border-black/[0.08] pb-3">
        {EXTRA_SOURCES.map((source) => (
          <li key={source.key} className="min-w-0">
            <span className="flex items-center gap-1.5 text-[11px] text-black/60"><Swatch color={source.color} />{source.label}</span>
            <span className="mt-0.5 block text-[15px] font-light tabular-nums text-black">{formatTaka(members.reduce((sum, item) => sum + item[source.key], 0))}</span>
          </li>
        ))}
      </ul>
      {members.length > 0
        ? (
          <ul aria-label="Extra revenue by staff" className={FILL_LIST}>
            {members.map((item) => (
              <li key={item.key} className={`${FILL_ROW} text-[11px]`}>
                <span className="flex justify-between"><span className="text-black/60">{item.name}</span><span className="tabular-nums">{formatTaka(item.total)}</span></span>
                <span className="flex h-1.5 overflow-hidden rounded-full bg-black/[0.08]" aria-hidden="true">
                  {EXTRA_SOURCES.map((source) => (
                    <span key={source.key} className="h-full" style={{ width: `${(item[source.key] / top) * 100}%`, background: source.color }} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )
        : <p className="flex-1 py-10 text-center text-[12px] text-black/55">No telesales, upsells or saved carts in this range.</p>}
      <p className="text-[10px] text-black/45">Telesales orders are also counted in confirmed value.</p>
    </Panel>
  );
}
