import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDown, Info, LockSimple } from '@phosphor-icons/react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EChart } from '@/components/business-report/EChart';
import { CHART, OUTCOME_COLORS } from '@/components/business-report/chartTheme';
import { escapeHtml, sparklineOption } from '@/lib/businessReportCharts';
import type { EChartsCoreOption } from '@/lib/echarts';
import { CAMPAIGN_CHANNEL_SLOTS, campaignChannelLabel, campaignMoney, channelColor, campaignRate, campaignReason, type CampaignMetrics, type CampaignOrder, type CampaignReport, type CampaignRow } from '@/lib/campaignLinks';

export const labelClass = 'text-[8px] font-medium uppercase tracking-[0.3em] text-black';
const ease = [0.23, 1, 0.32, 1] as const;
const count = (value: number) => value.toLocaleString('en-BD');


export function ChannelChip({ channel, extra }: { channel: string; extra?: string }) {
  return <span className="inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-md bg-black/[0.05] px-1.5 text-[11px] font-medium text-black/65">
    <i aria-hidden="true" className="block h-1.5 w-1.5 rounded-full" style={{ background: channelColor(channel) }} />{campaignChannelLabel(channel)}{extra ? ` · ${extra}` : ''}
  </span>;
}

export function Hint({ label, children }: { label: string; children: ReactNode }) {
  return <TooltipProvider delayDuration={150}><Tooltip>
    <TooltipTrigger asChild><button type="button" aria-label={label} className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full align-[-2px] text-black/40 hover:text-black"><Info weight="light" size={14} aria-hidden="true" /></button></TooltipTrigger>
    <TooltipContent className="max-w-[240px] text-[11px] leading-relaxed">{children}</TooltipContent>
  </Tooltip></TooltipProvider>;
}

export function Panel({ eyebrow, title, hint, aside, children, className = '' }: { eyebrow: string; title: string; hint?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  const headingId = useId();
  return <section aria-labelledby={headingId} className={`flex min-w-0 flex-col gap-3 rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5 ${className}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className={labelClass}>{eyebrow}</p><h2 id={headingId} className="mt-1 font-sf-display text-[15px] font-semibold text-black">{title}{hint && <Hint label={`About ${title.toLowerCase()}`}>{hint}</Hint>}</h2></div>
      {aside}
    </div>
    {children}
  </section>;
}

type Delta = { text: string; tone: 'good' | 'bad' | 'neutral' };
function percentDelta(current: number | null | undefined, previous: number | null | undefined): Delta | null {
  if (current == null || previous == null || previous <= 0) return null;
  const rounded = Math.round((current - previous) / previous * 1000) / 10;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return { text: `${sign}${Math.abs(rounded).toLocaleString('en-BD')}%`, tone: rounded > 0 ? 'good' : rounded < 0 ? 'bad' : 'neutral' };
}
const TONE_CLASS: Record<Delta['tone'], string> = { good: 'text-[#2F7A55]', bad: 'text-[#B4473A]', neutral: 'text-black/55' };

type TileSpec = { key: string; label: string; value: string; description: string; reasons?: string[]; delta: Delta | null; spark: number[]; locked?: boolean };
function Tile({ tile, index, reduceMotion }: { tile: TileSpec; index: number; reduceMotion: boolean | null }) {
  const option = useMemo(() => sparklineOption(tile.spark), [tile.spark]);
  const span = index < 3 ? 'sm:col-span-2' : index === 4 ? 'col-span-2 sm:col-span-3' : 'sm:col-span-3';
  return <motion.div
    initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
    transition={{ delay: reduceMotion ? 0 : index * 0.04, duration: 0.35, ease }}
    className={`flex min-h-[112px] flex-col rounded-2xl bg-black/[0.04] px-5 pb-2 pt-3 xl:col-span-1 ${span}`}>
    <p className={labelClass}>{tile.label}</p>
    {tile.locked
      ? <p className="mt-3 flex items-center gap-1.5 text-[13px] text-black/45"><LockSimple weight="light" size={14} aria-hidden="true" />Visible to admins</p>
      : <p className="mt-1 text-2xl font-light tabular-nums tracking-[-0.04em] text-black">{tile.value}</p>}
    <p className="mt-0.5 text-[11px] text-black/60">{tile.description}{tile.delta && <span className={`ml-1.5 font-medium tabular-nums ${TONE_CLASS[tile.delta.tone]}`} title="Compared with the previous period of the same length">{tile.delta.text}</span>}</p>
    {tile.reasons?.map(reason => <p key={reason} className="mt-0.5 text-[11px] text-black/60">{campaignReason(reason)}</p>)}
    {!tile.locked && tile.spark.length > 1 && <EChart option={option} ariaLabel={`${tile.label} trend`} className="mt-auto h-[30px] w-full" animate={!reduceMotion} />}
  </motion.div>;
}

export function CampaignTiles({ metrics, previous, daily, showFinancials, showLockedProfit }: {
  metrics: CampaignMetrics; previous?: CampaignMetrics; daily: CampaignReport['daily']; showFinancials: boolean; showLockedProfit: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const tiles = useMemo<TileSpec[]>(() => {
    const spark = (pick: (day: CampaignReport['daily'][number]) => number | null) => daily.map(day => pick(day) ?? 0);
    const list: TileSpec[] = [
      { key: 'clicks', label: 'Clicks', value: count(metrics.clicks), description: 'Bot previews excluded', delta: percentDelta(metrics.clicks, previous?.clicks), spark: spark(day => day.clicks) },
      { key: 'orders', label: 'Orders', value: count(metrics.orders), description: `${campaignRate(metrics.click_to_order)} of clicks`, delta: percentDelta(metrics.orders, previous?.orders), spark: spark(day => day.orders) },
      { key: 'delivered', label: 'Delivered', value: count(metrics.delivered), description: `${campaignRate(metrics.order_to_delivered)} of orders`, delta: percentDelta(metrics.delivered, previous?.delivered), spark: spark(day => day.delivered) },
      { key: 'revenue', label: 'Delivered revenue', value: campaignMoney(metrics.delivered_revenue), description: 'Delivered order value',
        reasons: metrics.delivered_revenue == null ? metrics.revenue_incomplete_reasons : undefined, delta: percentDelta(metrics.delivered_revenue, previous?.delivered_revenue), spark: spark(day => day.delivered_revenue) },
    ];
    if (showFinancials) list.push({ key: 'profit', label: 'Est. profit', value: campaignMoney(metrics.estimated_delivered_profit), description: 'After product cost and courier',
      reasons: metrics.estimated_delivered_profit == null ? metrics.profit_incomplete_reasons : undefined,
      delta: percentDelta(metrics.estimated_delivered_profit, previous?.estimated_delivered_profit), spark: spark(day => day.estimated_delivered_profit ?? null) });
    else if (showLockedProfit) list.push({ key: 'profit', label: 'Est. profit', value: '', description: 'Costs and profit are hidden for team members.', delta: null, spark: [], locked: true });
    return list;
  }, [metrics, previous, daily, showFinancials, showLockedProfit]);
  return <section aria-label="Totals for the selected dates" className="grid grid-cols-2 gap-3 sm:grid-cols-6 xl:grid-cols-5">
    {tiles.map((tile, index) => <Tile key={tile.key} tile={tile} index={index} reduceMotion={reduceMotion} />)}
  </section>;
}

export function CampaignFunnelPanel({ metrics }: { metrics: CampaignMetrics }) {
  const reduceMotion = useReducedMotion();
  const stages = [['Clicks', metrics.clicks], ['Captured checkouts', metrics.captured_checkouts], ['Orders', metrics.orders], ['Delivered', metrics.delivered]] as const;
  const max = Math.max(1, ...stages.map(([, value]) => value));
  const lossHigh = (metrics.loss_rate ?? 0) >= 0.15;
  return <Panel eyebrow="Funnel" title="From click to delivery" hint="Follows clicks made in the selected dates (Dhaka). One click can lead to more than one order, and outcomes keep updating as couriers report back.">
    <ol className="flex flex-col gap-1.5">
      {stages.map(([label, value], index) => {
        const next = stages[index + 1];
        // A square-root scale keeps small stages visible next to thousands of clicks.
        const width = value > 0 ? Math.max(3, Math.sqrt(value / max) * 100) : 0;
        return <li key={label} className="flex flex-col gap-1.5">
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-xs">
            <span>{label}</span>
            <span aria-hidden="true" className="h-[26px] overflow-hidden rounded-[7px] bg-black/[0.07]">
              <motion.span className={`block h-full origin-left rounded-[7px] ${label === 'Delivered' ? 'bg-[#1F9D63]' : 'bg-black/85'}`} style={{ width: `${width}%` }}
                initial={reduceMotion ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: reduceMotion ? 0 : index * 0.07, duration: 0.6, ease }} />
            </span>
            <span className="text-right font-medium tabular-nums">{count(value)}</span>
          </div>
          {next && value > 0 && <p className="ml-[7.25rem] inline-flex items-center gap-1 text-[11px] tabular-nums text-black/45"><ArrowDown weight="light" size={11} aria-hidden="true" />{campaignRate(next[1] / value)} continue</p>}
        </li>;
      })}
    </ol>
    <dl className="grid grid-cols-3 gap-2 border-t border-black/[0.09] pt-3 text-[11px] text-black/60">
      <div><dt>Click → order</dt><dd className="text-lg font-light tabular-nums tracking-[-0.03em] text-black">{campaignRate(metrics.click_to_order)}</dd></div>
      <div><dt>Order → delivered</dt><dd className="text-lg font-light tabular-nums tracking-[-0.03em] text-black">{campaignRate(metrics.order_to_delivered)}</dd></div>
      <div><dt>Cancelled + returned</dt><dd className={`text-lg font-light tabular-nums tracking-[-0.03em] ${lossHigh ? 'text-[#B4473A]' : 'text-black'}`}>{campaignRate(metrics.loss_rate)}</dd></div>
    </dl>
  </Panel>;
}

const TREND_METRICS = {
  clicks: { label: 'Clicks', pick: (day: CampaignReport['daily'][number]) => day.clicks, money: false },
  orders: { label: 'Orders from these clicks', pick: (day: CampaignReport['daily'][number]) => day.orders, money: false },
  revenue: { label: 'Delivered revenue', pick: (day: CampaignReport['daily'][number]) => day.delivered_revenue, money: true },
} as const;
type TrendKey = keyof typeof TREND_METRICS;
const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function CampaignTrendChart({ daily, className = 'h-56 w-full' }: { daily: CampaignReport['daily']; className?: string }) {
  const reduceMotion = useReducedMotion();
  const [metric, setMetric] = useState<TrendKey>('clicks');
  const spec = TREND_METRICS[metric];
  const values = daily.map(day => spec.pick(day));
  const known = values.filter((value): value is number => value != null);
  const peak = known.length > 1 && Math.max(...known) > 0 ? values.indexOf(Math.max(...known)) : -1;
  const format = (value: number | null) => value == null ? '—' : spec.money ? campaignMoney(value) : count(value);
  const option = useMemo<EChartsCoreOption>(() => ({
    animation: !reduceMotion, animationDuration: 450, animationEasing: 'cubicOut',
    grid: { top: 18, bottom: 26, left: 48, right: 6 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(11,11,10,0.04)' } }, backgroundColor: CHART.bg, borderColor: CHART.rule, textStyle: { color: CHART.ink, fontSize: 12 },
      formatter: (items: Array<{ name: string; value: number | null }>) => items.length ? `${escapeHtml(items[0].name)}<br><b>${escapeHtml(format(items[0].value))}</b> ${escapeHtml(spec.label.toLowerCase())}` : '' },
    xAxis: { type: 'category', data: daily.map(day => shortDay(day.day)), axisLine: { lineStyle: { color: CHART.rule } }, axisTick: { show: false }, axisLabel: { color: CHART.ink3, fontSize: 10, hideOverlap: true } },
    yAxis: { type: 'value', minInterval: spec.money ? 0 : 1, splitLine: { lineStyle: { color: CHART.rule } },
      axisLabel: { color: CHART.ink3, fontSize: 10, formatter: (value: number) => spec.money ? `৳${value >= 1000 ? `${Math.round(value / 1000)}k` : value}` : count(value) } },
    series: [{ type: 'bar', barMaxWidth: 28, barWidth: '55%', data: values.map((value, index) => ({ value, itemStyle: { color: index === peak ? CHART.highlight : 'rgba(11,11,10,0.78)', borderRadius: [3, 3, 0, 0] } })),
      markPoint: peak >= 0 ? { symbolSize: 0, label: { show: true, position: 'top', color: '#9A4A06', fontSize: 10, formatter: 'Best day' }, data: [{ coord: [peak, values[peak]] }] } : undefined }],
  }), [daily, values, peak, spec, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="flex min-w-0 flex-col gap-2">
    <div role="group" aria-label="Chart metric" className="inline-flex self-start rounded-[10px] bg-black/[0.05] p-[3px]">
      {(Object.keys(TREND_METRICS) as TrendKey[]).map(key => <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key)}
        className={`rounded-lg px-2.5 py-1 text-xs transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] ${metric === key ? 'bg-white text-black shadow-[0_1px_2px_rgba(11,11,10,0.08)]' : 'text-black/60 hover:text-black'}`}>
        {key === 'orders' ? 'Orders' : TREND_METRICS[key].label.replace('Delivered revenue', 'Revenue')}</button>)}
    </div>
    <EChart option={option} ariaLabel={`${spec.label} by Dhaka click day`} className={className} animate={!reduceMotion} />
    <details className="text-[11px] text-black/60"><summary className="cursor-pointer py-1">View daily numbers</summary>
      <table className="mt-1 w-full text-left tabular-nums"><caption className="sr-only">Daily campaign numbers by click day</caption>
        <thead><tr><th className="py-1 font-medium">Click day</th><th className="font-medium">Clicks</th><th className="font-medium">Orders from these clicks</th><th className="font-medium">Delivered revenue</th></tr></thead>
        <tbody>{daily.map(day => <tr key={day.day}><th scope="row" className="py-0.5 font-normal">{day.day}</th><td>{day.clicks}</td><td>{day.orders}</td><td>{campaignMoney(day.delivered_revenue)}</td></tr>)}</tbody>
      </table>
    </details>
  </div>;
}

export function CampaignChannelMix({ rows }: { rows: CampaignRow[] }) {
  const reduceMotion = useReducedMotion();
  const slices = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      if (!row.delivered_revenue) continue;
      const key = (CAMPAIGN_CHANNEL_SLOTS as readonly string[]).includes(row.channel) ? row.channel : 'other';
      totals.set(key, (totals.get(key) ?? 0) + row.delivered_revenue);
    }
    return [...CAMPAIGN_CHANNEL_SLOTS, 'other'].filter(key => totals.get(key)).map(key => ({ key, label: key === 'other' ? 'Other channels' : campaignChannelLabel(key), value: totals.get(key)!, color: channelColor(key) }));
  }, [rows]);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const option = useMemo<EChartsCoreOption>(() => ({
    animation: !reduceMotion, tooltip: { show: false },
    series: [{ type: 'pie', radius: ['62%', '90%'], padAngle: 2, itemStyle: { borderRadius: 4 }, labelLine: { show: false }, emphasis: { scale: false },
      label: { show: true, position: 'center', formatter: () => `{a|${campaignMoney(total)}}\n{b|delivered}`, rich: { a: { fontSize: 13, fontWeight: 500, color: CHART.ink }, b: { fontSize: 10, color: CHART.ink3, padding: [3, 0, 0, 0] } } },
      data: slices.map(slice => ({ name: slice.label, value: slice.value, itemStyle: { color: slice.color } })) }],
  }), [slices, total, reduceMotion]);
  return <div className="flex min-w-0 flex-col gap-2">
    <p className={labelClass}>Delivered revenue by channel</p>
    {total > 0 ? <>
      <EChart option={option} ariaLabel={`Delivered revenue by channel: ${slices.map(slice => `${slice.label} ${Math.round(slice.value / total * 100)}%`).join(', ')}`} className="h-[150px] w-full" animate={!reduceMotion} />
      <ul className="flex flex-col gap-2 text-xs">{slices.map(slice => <li key={slice.key} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2">
        <i aria-hidden="true" className="block h-2.5 w-2.5 rounded-[3px]" style={{ background: slice.color }} /><span>{slice.label}</span><span className="tabular-nums text-black/60">{campaignRate(slice.value / total)}</span>
      </li>)}</ul>
    </> : <p className="py-8 text-center text-xs text-black/50">No delivered revenue yet.</p>}
  </div>;
}

const OUTCOME_PARTS = [
  ['delivered', 'Delivered', OUTCOME_COLORS.approved], ['confirmed', 'Confirmed', 'rgba(11,11,10,0.3)'], ['pending', 'Pending', OUTCOME_COLORS.pending],
  ['cancelled', 'Cancelled', OUTCOME_COLORS.cancelled], ['returned', 'Returned', OUTCOME_COLORS.returned],
] as const;
export function OutcomeBar({ metrics, legend = false }: { metrics: CampaignMetrics; legend?: boolean }) {
  const total = OUTCOME_PARTS.reduce((sum, [key]) => sum + metrics[key], 0);
  if (!total) return <span className="text-[11px] text-black/50">No orders yet</span>;
  return <div className="flex min-w-[150px] flex-col gap-1.5">
    <div role="img" aria-label={OUTCOME_PARTS.map(([key, label]) => `${metrics[key]} ${label.toLowerCase()}`).join(', ')} className="flex h-2 gap-[2px] overflow-hidden rounded bg-black/[0.04]">
      {OUTCOME_PARTS.map(([key, , color]) => metrics[key] > 0 && <i key={key} className="block h-full" style={{ width: `${metrics[key] / total * 100}%`, background: color }} />)}
    </div>
    <span className="text-[11px] tabular-nums text-black/60"><b className="font-medium text-[#2F7A55]">{campaignRate(metrics.delivered / total)} delivered</b> · {metrics.cancelled + metrics.returned} lost</span>
    {legend && <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">{OUTCOME_PARTS.map(([key, label, color]) => <li key={key} className="inline-flex items-center gap-1.5">
      <i aria-hidden="true" className="block h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />{label}<span className="tabular-nums text-black/60">{metrics[key]}</span>
    </li>)}</ul>}
  </div>;
}

const ORDER_STATUS: Record<string, [string, string]> = {
  delivered: ['Delivered', OUTCOME_COLORS.approved], confirmed: ['Confirmed', 'rgba(11,11,10,0.35)'], pending: ['Pending', OUTCOME_COLORS.pending],
  cancelled: ['Cancelled', OUTCOME_COLORS.cancelled], returned: ['Returned', OUTCOME_COLORS.returned],
};
export function CampaignOrdersList({ orders, hasMore }: { orders: CampaignOrder[] | undefined; hasMore?: boolean }) {
  if (!orders?.length) return <p className="text-xs text-black/55">No orders from these clicks yet.</p>;
  return <>
    <ul className="flex flex-col">{orders.map(order => {
      const [label, color] = order.delivery_kind === 'partial' ? ['Partial delivery', OUTCOME_COLORS.approved] : ORDER_STATUS[order.outcome] ?? [order.outcome, 'rgba(11,11,10,0.35)'];
      return <li key={order.id} className="grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-black/[0.08] py-2.5 text-xs first:border-t-0">
        <Link to={`/orders/${order.id}`} className="font-mono text-[11px] underline-offset-4 hover:underline">#{order.order_number || order.id.slice(0, 8)}</Link>
        <span className="text-black/60">{new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dhaka' })}</span>
        <span className="text-right tabular-nums">{campaignMoney(order.delivered_revenue ?? order.order_value)}</span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium"><i aria-hidden="true" className="block h-1.5 w-1.5 rounded-full" style={{ background: color }} />{label}</span>
        {order.amount_incomplete_reason && <p className="col-span-4 -mt-1 text-[11px] text-black/55">{campaignReason(order.amount_incomplete_reason)}</p>}
      </li>;
    })}</ul>
    {hasMore && <p className="text-[11px] text-black/55">Showing the newest 50 orders. Totals include every attributed order.</p>}
  </>;
}

export function CampaignUpdatedNote({ report, showFinancials }: { report: CampaignReport; showFinancials: boolean }) {
  return <p className="text-[11px] leading-relaxed text-black/45">
    Updated {new Date(report.meta.as_of).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} (Dhaka) · Recent outcomes may change as deliveries finish.
    {showFinancials && report.meta.profit_basis && <> {report.meta.profit_basis}</>}
  </p>;
}

// The body shared by the slide-in panel and the full detail page.
export function CampaignLinkInsights({ row, report, showFinancials, compact = false }: { row: CampaignRow; report: CampaignReport; showFinancials: boolean; compact?: boolean }) {
  const kpis: Array<[string, string]> = [
    ['Clicks', count(row.clicks)], ['Orders', count(row.orders)], ['Delivered', count(row.delivered)],
    ['Delivered revenue', campaignMoney(row.delivered_revenue)], ['Click → order', campaignRate(row.click_to_order)],
  ];
  return <div className="flex flex-col gap-3">
    <dl className={`grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'}`}>
      {kpis.map(([label, value]) => <div key={label} className="rounded-xl bg-black/[0.04] px-3 py-2.5"><dt className={labelClass}>{label}</dt><dd className="mt-1 text-xl font-light tabular-nums tracking-[-0.03em]">{value}</dd></div>)}
      {showFinancials
        ? <div className="rounded-xl bg-black/[0.04] px-3 py-2.5"><dt className={labelClass}>Est. profit</dt><dd className="mt-1 text-xl font-light tabular-nums tracking-[-0.03em]">{campaignMoney(row.estimated_delivered_profit)}</dd>
          {row.estimated_delivered_profit == null && row.profit_incomplete_reasons?.map(reason => <p key={reason} className="mt-1 text-[11px] text-black/55">{campaignReason(reason)}</p>)}</div>
        : <div className="rounded-xl bg-black/[0.04] px-3 py-2.5 text-black/45"><dt className={labelClass}>Est. profit</dt><dd className="mt-2 flex items-center gap-1.5 text-xs"><LockSimple weight="light" size={13} aria-hidden="true" />Admins only</dd></div>}
    </dl>
    <div className={`grid gap-3 ${compact ? '' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]'}`}>
      <CampaignFunnelPanel metrics={row} />
      <Panel eyebrow="Trend" title="Daily performance"><CampaignTrendChart daily={report.daily} className={compact ? 'h-44 w-full' : 'h-56 w-full'} /></Panel>
    </div>
    <div className={`grid gap-3 ${compact ? '' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]'}`}>
      <Panel eyebrow="Outcomes" title="What happened to the orders"><OutcomeBar metrics={row} legend /></Panel>
      <Panel eyebrow="Recent" title="Orders from this link"><CampaignOrdersList orders={row.recent_orders} hasMore={row.has_more} /></Panel>
    </div>
    {showFinancials && row.courier_fee_coverage && <p className="text-[11px] text-black/55">Courier fees recorded for {row.courier_fee_coverage.recorded_orders} of {row.courier_fee_coverage.total_orders} orders.{row.cogs_coverage && ` Product cost known for ${row.cogs_coverage.complete_orders} of ${row.cogs_coverage.total_orders} delivered orders.`} Missing amounts are not counted as zero.</p>}
  </div>;
}
