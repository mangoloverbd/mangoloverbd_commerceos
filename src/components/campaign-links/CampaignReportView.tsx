import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDown, Info, LockSimple } from '@phosphor-icons/react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EChart } from '@/components/business-report/EChart';
import { CHART } from '@/components/business-report/chartTheme';
import { escapeHtml } from '@/lib/businessReportCharts';
import type { EChartsCoreOption } from '@/lib/echarts';
import { CAMPAIGN_CHANNEL_SLOTS, campaignChannelLabel, campaignMoney, channelColor, campaignRate, campaignReason, type CampaignMetrics, type CampaignOrder, type CampaignReport, type CampaignRow } from '@/lib/campaignLinks';

export const labelClass = 'text-[8px] font-medium uppercase tracking-[0.3em] text-black';
const ease = [0.23, 1, 0.32, 1] as const;
const count = (value: number) => value.toLocaleString('en-BD');

// One colour per metric, kept the same in every chart on the page.
type Tone = { solid: string; tint: string; soft: string; ink: string };
const METRIC_TONES = {
  clicks: { solid: '#3B82F6', tint: '#BFDBFE', soft: '#EFF6FF', ink: '#1D4ED8' },
  checkouts: { solid: '#6366F1', tint: '#C7D2FE', soft: '#EEF2FF', ink: '#4338CA' },
  orders: { solid: '#8B5CF6', tint: '#DDD6FE', soft: '#F5F3FF', ink: '#6D28D9' },
  delivered: { solid: '#06B6D4', tint: '#A5F3FC', soft: '#ECFEFF', ink: '#0E7490' },
  revenue: { solid: '#F59E0B', tint: '#FDE68A', soft: '#FFFBEB', ink: '#B45309' },
  profit: { solid: '#10B981', tint: '#A7F3D0', soft: '#ECFDF5', ink: '#047857' },
  loss: { solid: '#F43F5E', tint: '#FECDD3', soft: '#FFF1F2', ink: '#BE123C' },
} satisfies Record<string, Tone>;
const ORDERS_LINE = '#7C3AED';

export function ChannelChip({ channel, extra }: { channel: string; extra?: string }) {
  return <span className="inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-md border border-black/[0.08] bg-white px-1.5 text-[11px] font-medium text-black/70">
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
  return <section aria-labelledby={headingId} className={`flex min-w-0 flex-col gap-3 rounded-2xl border border-black/[0.08] bg-white px-4 py-4 sm:px-5 ${className}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className={labelClass}>{eyebrow}</p><h2 id={headingId} className="mt-1 font-sf-display text-[15px] font-semibold text-black">{title}{hint && <Hint label={`About ${title.toLowerCase()}`}>{hint}</Hint>}</h2></div>
      {aside}
    </div>
    {children}
  </section>;
}

// A row of rounded "pill" bars; the last value is drawn in the solid colour.
export function PillBars({ values, solid, tint, className = 'h-[34px] w-[72px]' }: { values: number[]; solid: string; tint: string; className?: string }) {
  const max = Math.max(0, ...values);
  return <div aria-hidden="true" className={`flex shrink-0 items-end gap-[2px] ${className}`}>
    {values.map((value, index) => <i key={index} className="block min-w-0 flex-1 rounded-full"
      style={{ height: `${max > 0 ? Math.max(10, value / max * 100) : 10}%`, background: index === values.length - 1 ? solid : tint }} />)}
  </div>;
}

type Delta = { text: string; tone: 'good' | 'bad' | 'neutral' };
function percentDelta(current: number | null | undefined, previous: number | null | undefined): Delta | null {
  if (current == null || previous == null || previous <= 0) return null;
  const rounded = Math.round((current - previous) / previous * 1000) / 10;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return { text: `${sign}${Math.abs(rounded).toLocaleString('en-BD')}%`, tone: rounded > 0 ? 'good' : rounded < 0 ? 'bad' : 'neutral' };
}
const TONE_CLASS: Record<Delta['tone'], string> = { good: 'bg-[#D1FAE5] text-[#047857]', bad: 'bg-[#FFE4E6] text-[#BE123C]', neutral: 'bg-black/[0.05] text-black/55' };

type TileSpec = { key: string; label: string; value: string; description: string; reasons?: string[]; delta: Delta | null; spark: number[]; peak?: string; tone: Tone; locked?: boolean };
function Tile({ tile, index, reduceMotion }: { tile: TileSpec; index: number; reduceMotion: boolean | null }) {
  const span = index < 3 ? 'sm:col-span-2' : index === 4 ? 'col-span-2 sm:col-span-3' : 'sm:col-span-3';
  return <motion.div
    initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
    transition={{ delay: reduceMotion ? 0 : index * 0.04, duration: 0.35, ease }}
    style={{ background: `linear-gradient(180deg, ${tile.tone.soft} 0%, #FFFFFF 55%)` }}
    className={`flex min-h-[124px] flex-col gap-2 rounded-2xl border border-black/[0.08] px-4 pb-2.5 pt-3.5 xl:col-span-1 ${span}`}>
    <div className="flex items-center justify-between gap-2">
      <p className={`${labelClass} inline-flex items-center gap-1.5`}><i aria-hidden="true" className="block h-2 w-2 rounded-[3px]" style={{ background: tile.tone.solid }} />{tile.label}</p>
      {tile.delta && <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums ${TONE_CLASS[tile.delta.tone]}`} title="Compared with the previous period of the same length">{tile.delta.text}</span>}
    </div>
    {tile.locked
      ? <p className="mt-1 flex items-center gap-1.5 text-[13px] text-black/45"><LockSimple weight="light" size={14} aria-hidden="true" />Visible to admins</p>
      : <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl font-light tabular-nums tracking-[-0.04em] text-black">{tile.value}</p>
          <p className="mt-0.5 text-[11px] text-black/60">{tile.description}</p>
        </div>
        {tile.spark.length > 1 && <PillBars values={tile.spark} solid={tile.tone.solid} tint={tile.tone.tint} />}
      </div>}
    {tile.locked && <p className="text-[11px] text-black/60">{tile.description}</p>}
    {tile.reasons?.map(reason => <p key={reason} className="text-[11px] text-black/60">{campaignReason(reason)}</p>)}
    {!tile.locked && tile.peak && <p className="mt-auto flex justify-between border-t border-black/[0.06] pt-2 font-mono text-[10px] text-black/45">
      <span>{tile.spark.length}d</span><span style={{ color: tile.tone.ink }}>Peak {tile.peak}</span>
    </p>}
  </motion.div>;
}

export function CampaignTiles({ metrics, previous, daily, showFinancials, showLockedProfit }: {
  metrics: CampaignMetrics; previous?: CampaignMetrics; daily: CampaignReport['daily']; showFinancials: boolean; showLockedProfit: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const tiles = useMemo<TileSpec[]>(() => {
    const spark = (pick: (day: CampaignReport['daily'][number]) => number | null | undefined) => daily.map(day => pick(day) ?? 0);
    const peak = (values: number[], money = false) => values.length > 1 && Math.max(...values) > 0 ? (money ? campaignMoney(Math.max(...values)) : count(Math.max(...values))) : undefined;
    const clicks = spark(day => day.clicks); const orders = spark(day => day.orders); const delivered = spark(day => day.delivered);
    const revenue = spark(day => day.delivered_revenue);
    const list: TileSpec[] = [
      { key: 'clicks', label: 'Clicks', value: count(metrics.clicks), description: 'Bot previews excluded', delta: percentDelta(metrics.clicks, previous?.clicks), spark: clicks, peak: peak(clicks), tone: METRIC_TONES.clicks },
      { key: 'orders', label: 'Orders', value: count(metrics.orders), description: `${campaignRate(metrics.click_to_order)} of clicks`, delta: percentDelta(metrics.orders, previous?.orders), spark: orders, peak: peak(orders), tone: METRIC_TONES.orders },
      { key: 'delivered', label: 'Delivered', value: count(metrics.delivered), description: `${campaignRate(metrics.order_to_delivered)} of orders`, delta: percentDelta(metrics.delivered, previous?.delivered), spark: delivered, peak: peak(delivered), tone: METRIC_TONES.delivered },
      { key: 'revenue', label: 'Delivered revenue', value: campaignMoney(metrics.delivered_revenue), description: 'Delivered order value',
        reasons: metrics.delivered_revenue == null ? metrics.revenue_incomplete_reasons : undefined, delta: percentDelta(metrics.delivered_revenue, previous?.delivered_revenue), spark: revenue, peak: peak(revenue, true), tone: METRIC_TONES.revenue },
    ];
    if (showFinancials) {
      const profit = spark(day => day.estimated_delivered_profit);
      list.push({ key: 'profit', label: 'Est. profit', value: campaignMoney(metrics.estimated_delivered_profit), description: 'After product cost and courier',
        reasons: metrics.estimated_delivered_profit == null ? metrics.profit_incomplete_reasons : undefined,
        delta: percentDelta(metrics.estimated_delivered_profit, previous?.estimated_delivered_profit), spark: profit, peak: peak(profit, true), tone: METRIC_TONES.profit });
    } else if (showLockedProfit) list.push({ key: 'profit', label: 'Est. profit', value: '', description: 'Costs and profit are hidden for team members.', delta: null, spark: [], tone: METRIC_TONES.profit, locked: true });
    return list;
  }, [metrics, previous, daily, showFinancials, showLockedProfit]);
  return <section aria-label="Totals for the selected dates" className="grid grid-cols-2 gap-3 sm:grid-cols-6 xl:grid-cols-5">
    {tiles.map((tile, index) => <Tile key={tile.key} tile={tile} index={index} reduceMotion={reduceMotion} />)}
  </section>;
}

// Half-circle gauge for a 0–1 rate.
function Gauge({ label, rate, tone, note }: { label: string; rate: number | null; tone: Tone; note?: string }) {
  const filled = rate == null ? 0 : Math.max(0, Math.min(100, rate * 100));
  // dt comes first for valid <dl> markup; CSS order puts it under the number.
  return <div className="flex flex-col items-center text-center">
    <dt className="order-3 text-[11px] text-black/60">{label}{note && <span className="block font-mono text-[10px] text-black/40">{note}</span>}</dt>
    <svg width="92" height="52" viewBox="0 0 100 56" fill="none" aria-hidden="true" className="order-1">
      <path d="M10 50 A40 40 0 0 1 90 50" stroke={tone.tint} strokeOpacity={0.45} strokeWidth="9" strokeLinecap="round" pathLength={100} />
      {filled > 0 && <path d="M10 50 A40 40 0 0 1 90 50" stroke={tone.solid} strokeWidth="9" strokeLinecap="round" pathLength={100} strokeDasharray={`${filled} 100`} />}
    </svg>
    <dd className="order-2 -mt-3 text-lg font-light tabular-nums tracking-[-0.03em] text-black">{campaignRate(rate)}</dd>
  </div>;
}

export function CampaignFunnelPanel({ metrics }: { metrics: CampaignMetrics }) {
  const reduceMotion = useReducedMotion();
  const stages = [
    ['Clicks', metrics.clicks, METRIC_TONES.clicks], ['Captured checkouts', metrics.captured_checkouts, METRIC_TONES.checkouts],
    ['Orders', metrics.orders, METRIC_TONES.orders], ['Delivered', metrics.delivered, METRIC_TONES.profit],
  ] as const;
  const max = Math.max(1, ...stages.map(([, value]) => value));
  const lost = metrics.cancelled + metrics.returned;
  return <Panel eyebrow="Funnel" title="From click to delivery" hint="Follows clicks made in the selected dates (Dhaka). One click can lead to more than one order, and outcomes keep updating as couriers report back.">
    <ol className="flex flex-col items-center gap-1.5 rounded-xl bg-[#F3F2EF] px-3 py-4">
      {stages.map(([label, value, tone], index) => {
        const next = stages[index + 1];
        // A square-root scale keeps small stages visible next to thousands of clicks; the floor leaves room for the label.
        const width = Math.max(46, Math.sqrt(value / max) * 100);
        return <li key={label} className="flex w-full flex-col items-center gap-1.5">
          <motion.div style={{ width: `${width}%`, background: value > 0 ? tone.solid : 'rgba(11,11,10,0.08)' }}
            initial={reduceMotion ? false : { scaleX: 0.6, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }} transition={{ delay: reduceMotion ? 0 : index * 0.07, duration: 0.5, ease }}
            className={`flex h-9 items-center justify-between gap-2 rounded-full px-4 text-[13px] font-medium ${value > 0 ? 'text-white' : 'text-black/55'}`}>
            <span className="truncate">{label}</span><span className="font-mono tabular-nums">{count(value)}</span>
          </motion.div>
          {next && value > 0 && <p className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums text-black/45"><ArrowDown weight="light" size={11} aria-hidden="true" />{campaignRate(next[1] / value)} continue</p>}
        </li>;
      })}
    </ol>
    <dl className="grid grid-cols-3 gap-2 pt-1">
      <Gauge label="Click → order" rate={metrics.click_to_order} tone={METRIC_TONES.orders} />
      <Gauge label="Order → delivered" rate={metrics.order_to_delivered} tone={METRIC_TONES.profit} />
      <Gauge label="Cancelled + returned" rate={metrics.loss_rate} tone={METRIC_TONES.loss} note={`${count(lost)} order${lost === 1 ? '' : 's'}`} />
    </dl>
  </Panel>;
}

const TREND_METRICS = {
  clicks: { label: 'Clicks', pick: (day: CampaignReport['daily'][number]) => day.clicks, money: false, tone: METRIC_TONES.clicks },
  orders: { label: 'Orders from these clicks', pick: (day: CampaignReport['daily'][number]) => day.orders, money: false, tone: METRIC_TONES.orders },
  revenue: { label: 'Delivered revenue', pick: (day: CampaignReport['daily'][number]) => day.delivered_revenue, money: true, tone: METRIC_TONES.revenue },
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
  // With clicks selected, orders ride along as a line on their own axis.
  const showOrders = metric === 'clicks' && daily.length > 1 && daily.some(day => day.orders > 0);
  const format = (value: number | null, money = spec.money) => value == null ? '—' : money ? campaignMoney(value) : count(value);
  const option = useMemo<EChartsCoreOption>(() => ({
    animation: !reduceMotion, animationDuration: 450, animationEasing: 'cubicOut',
    grid: { top: 18, bottom: 26, left: 48, right: showOrders ? 34 : 6 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(11,11,10,0.04)' } }, backgroundColor: CHART.bg, borderColor: CHART.rule, textStyle: { color: CHART.ink, fontSize: 12 },
      formatter: (items: Array<{ name: string; value: number | null; seriesIndex: number }>) => items.length ? `${escapeHtml(items[0].name)}${items.map(item => `<br><b>${escapeHtml(format(item.value, item.seriesIndex === 0 && spec.money))}</b> ${escapeHtml(item.seriesIndex === 0 ? spec.label.toLowerCase() : 'orders')}`).join('')}` : '' },
    xAxis: { type: 'category', data: daily.map(day => shortDay(day.day)), axisLine: { lineStyle: { color: CHART.rule } }, axisTick: { show: false }, axisLabel: { color: CHART.ink3, fontSize: 10, hideOverlap: true } },
    yAxis: [
      { type: 'value', minInterval: spec.money ? 0 : 1, splitLine: { lineStyle: { color: CHART.rule, type: 'dashed' } },
        axisLabel: { color: CHART.ink3, fontSize: 10, formatter: (value: number) => spec.money ? `৳${value >= 1000 ? `${Math.round(value / 1000)}k` : value}` : count(value) } },
      ...(showOrders ? [{ type: 'value', minInterval: 1, position: 'right', splitLine: { show: false }, axisLabel: { color: ORDERS_LINE, fontSize: 10 } }] : []),
    ],
    series: [
      { type: 'bar', barMaxWidth: 26, barWidth: '58%',
        data: values.map((value, index) => ({ value, itemStyle: { color: index === peak || values.length === 1 ? spec.tone.solid : spec.tone.tint, borderRadius: 999 } })) },
      ...(showOrders ? [{ type: 'line', yAxisIndex: 1, smooth: 0.35, symbol: 'circle', symbolSize: 6, data: daily.map(day => day.orders),
        lineStyle: { width: 2.5, color: ORDERS_LINE }, itemStyle: { color: '#FFFFFF', borderColor: ORDERS_LINE, borderWidth: 2 } }] : []),
    ],
  }), [daily, values, peak, spec, reduceMotion, showOrders]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div role="group" aria-label="Chart metric" className="inline-flex rounded-full bg-black/[0.05] p-[3px]">
        {(Object.keys(TREND_METRICS) as TrendKey[]).map(key => <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key)}
          style={metric === key ? { background: TREND_METRICS[key].tone.solid } : undefined}
          className={`rounded-full px-3 py-1 text-xs transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] ${metric === key ? 'text-white' : 'text-black/60 hover:text-black'}`}>
          {key === 'orders' ? 'Orders' : TREND_METRICS[key].label.replace('Delivered revenue', 'Revenue')}</button>)}
      </div>
      {showOrders && <p aria-hidden="true" className="flex items-center gap-3 font-mono text-[10px] text-black/50">
        <span className="inline-flex items-center gap-1.5"><i className="block h-3 w-1.5 rounded-full" style={{ background: spec.tone.solid }} />Clicks</span>
        <span className="inline-flex items-center gap-1.5"><i className="block h-[2.5px] w-3.5 rounded-full" style={{ background: ORDERS_LINE }} />Orders</span>
      </p>}
    </div>
    <div className="flex min-h-0 flex-1 rounded-xl bg-[#F3F2EF] px-2 pt-1">
      <EChart option={option} ariaLabel={`${spec.label} by Dhaka click day`} className={className} animate={!reduceMotion} />
    </div>
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
    series: [{ type: 'pie', radius: ['68%', '92%'], padAngle: 4, itemStyle: { borderRadius: 999 }, labelLine: { show: false }, emphasis: { scale: false },
      label: { show: true, position: 'center', formatter: () => `{a|${campaignMoney(total)}}\n{b|delivered}`, rich: { a: { fontSize: 14, fontWeight: 500, color: CHART.ink }, b: { fontSize: 10, color: CHART.ink3, padding: [3, 0, 0, 0] } } },
      data: slices.map(slice => ({ name: slice.label, value: slice.value, itemStyle: { color: slice.color } })) }],
  }), [slices, total, reduceMotion]);
  return total > 0
    ? <div className="flex flex-1 flex-wrap items-center justify-center gap-5 rounded-xl bg-[#F3F2EF] p-4">
      <EChart option={option} ariaLabel={`Delivered revenue by channel: ${slices.map(slice => `${slice.label} ${Math.round(slice.value / total * 100)}%`).join(', ')}`} className="h-[168px] w-[168px] shrink-0" animate={!reduceMotion} />
      <ul className="flex min-w-[140px] flex-1 flex-col gap-2.5 text-xs">{slices.map(slice => <li key={slice.key} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2">
        <i aria-hidden="true" className="block h-2.5 w-2.5 rounded-[3px]" style={{ background: slice.color }} /><span>{slice.label}</span><span className="font-mono tabular-nums text-black/70">{campaignRate(slice.value / total)}</span>
      </li>)}</ul>
    </div>
    : <p className="flex flex-1 items-center justify-center rounded-xl bg-[#F3F2EF] py-10 text-center text-xs text-black/50">No delivered revenue yet.</p>;
}

// Bangladesh's week starts on Saturday; the report indexes Sunday as 0.
const HEAT_DAYS = [[6, 'Sat'], [0, 'Sun'], [1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri']] as const;
const HEAT_SHADES = ['#E3F5EA', '#A9E5C2', '#5FCF8E', '#22A861', '#0F7A43'];
const slotLabel = (slot: number) => { const hour = slot * 2; return `${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`; };
const slotRange = (slot: number) => { const fmt = (hour: number) => `${hour % 12 || 12} ${hour % 24 < 12 ? 'AM' : 'PM'}`; return `${fmt(slot * 2)}–${fmt(slot * 2 + 2)}`; };

export function CampaignClickHeatmap({ heatmap }: { heatmap: number[][] | undefined }) {
  const grid = useMemo(() => HEAT_DAYS.map(([index, day]) => ({ day,
    // Two-hour slots keep the grid readable on a laptop.
    slots: Array.from({ length: 12 }, (_, slot) => (heatmap?.[index]?.[slot * 2] ?? 0) + (heatmap?.[index]?.[slot * 2 + 1] ?? 0)) })), [heatmap]);
  const max = Math.max(0, ...grid.flatMap(row => row.slots));
  const best = useMemo(() => {
    let top = { day: '', slot: -1, value: 0 };
    for (const row of grid) row.slots.forEach((value, slot) => { if (value > top.value) top = { day: row.day, slot, value }; });
    return top.slot >= 0 ? `${top.day}, ${slotRange(top.slot)}` : null;
  }, [grid]);
  const shade = (value: number) => HEAT_SHADES[value <= 0 || max === 0 ? 0 : Math.max(1, Math.ceil(value / max * 4))];
  return <Panel eyebrow="Timing" title="When people click" hint="Clicks in the selected dates by Dhaka weekday and two-hour slot."
    aside={best && <p className="text-xs text-black/60">Busiest: <b className="rounded-full bg-[#D1FAE5] px-2 py-0.5 font-semibold text-[#047857]">{best}</b></p>}>
    {max === 0 ? <p className="rounded-xl bg-[#F3F2EF] py-10 text-center text-xs text-black/50">No clicks in these dates yet.</p> : <>
      <div className="overflow-x-auto rounded-xl bg-[#F3F2EF] p-4">
        <div role="img" aria-label={`Clicks by weekday and two-hour slot. Busiest: ${best}.`} className="flex min-w-[480px] flex-col gap-[5px]">
          <div aria-hidden="true" className="grid grid-cols-[32px_repeat(12,minmax(0,1fr))] gap-[5px] font-mono text-[10px] text-black/45">
            <span />{Array.from({ length: 12 }, (_, slot) => <span key={slot} className="text-center">{slotLabel(slot)}</span>)}
          </div>
          {grid.map(row => <div key={row.day} aria-hidden="true" className="grid grid-cols-[32px_repeat(12,minmax(0,1fr))] items-center gap-[5px]">
            <span className="font-mono text-[10px] text-black/45">{row.day}</span>
            {row.slots.map((value, slot) => <i key={slot} title={`${row.day} ${slotRange(slot)}: ${count(value)} clicks`} className="block aspect-[1.6] rounded-[5px]" style={{ background: shade(value) }} />)}
          </div>)}
        </div>
      </div>
      <p aria-hidden="true" className="flex items-center justify-end gap-1 font-mono text-[10px] text-black/45">Less{HEAT_SHADES.map(color => <i key={color} className="block h-[11px] w-[11px] rounded-[3px]" style={{ background: color }} />)}More</p>
    </>}
  </Panel>;
}

const OUTCOME_PARTS = [
  ['delivered', 'Delivered', '#10B981'], ['confirmed', 'Confirmed', '#93C5FD'], ['pending', 'Pending', '#FBBF24'],
  ['cancelled', 'Cancelled', '#F43F5E'], ['returned', 'Returned', '#BE123C'],
] as const;
export function OutcomeBar({ metrics, legend = false }: { metrics: CampaignMetrics; legend?: boolean }) {
  const total = OUTCOME_PARTS.reduce((sum, [key]) => sum + metrics[key], 0);
  if (!total) return <span className="text-[11px] text-black/50">No orders yet</span>;
  return <div className="flex min-w-[150px] flex-col gap-1.5">
    <div role="img" aria-label={OUTCOME_PARTS.map(([key, label]) => `${metrics[key]} ${label.toLowerCase()}`).join(', ')} className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-black/[0.04]">
      {OUTCOME_PARTS.map(([key, , color]) => metrics[key] > 0 && <i key={key} className="block h-full" style={{ width: `${metrics[key] / total * 100}%`, background: color }} />)}
    </div>
    <span className="text-[11px] tabular-nums text-black/60"><b className="font-medium text-[#047857]">{campaignRate(metrics.delivered / total)} delivered</b> · {metrics.cancelled + metrics.returned} lost</span>
    {legend && <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">{OUTCOME_PARTS.map(([key, label, color]) => <li key={key} className="inline-flex items-center gap-1.5">
      <i aria-hidden="true" className="block h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />{label}<span className="tabular-nums text-black/60">{metrics[key]}</span>
    </li>)}</ul>}
  </div>;
}

const ORDER_STATUS: Record<string, [string, string]> = {
  delivered: ['Delivered', '#10B981'], confirmed: ['Confirmed', '#93C5FD'], pending: ['Pending', '#FBBF24'],
  cancelled: ['Cancelled', '#F43F5E'], returned: ['Returned', '#BE123C'],
};
export function CampaignOrdersList({ orders, hasMore }: { orders: CampaignOrder[] | undefined; hasMore?: boolean }) {
  if (!orders?.length) return <p className="text-xs text-black/55">No orders from these clicks yet.</p>;
  return <>
    <ul className="flex flex-col">{orders.map(order => {
      const [label, color] = order.delivery_kind === 'partial' ? ['Partial delivery', '#10B981'] : ORDER_STATUS[order.outcome] ?? [order.outcome, 'rgba(11,11,10,0.35)'];
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
      {kpis.map(([label, value]) => <div key={label} className="rounded-xl border border-black/[0.08] bg-white px-3 py-2.5"><dt className={labelClass}>{label}</dt><dd className="mt-1 text-xl font-light tabular-nums tracking-[-0.03em]">{value}</dd></div>)}
      {showFinancials
        ? <div className="rounded-xl border border-black/[0.08] bg-white px-3 py-2.5"><dt className={labelClass}>Est. profit</dt><dd className="mt-1 text-xl font-light tabular-nums tracking-[-0.03em]">{campaignMoney(row.estimated_delivered_profit)}</dd>
          {row.estimated_delivered_profit == null && row.profit_incomplete_reasons?.map(reason => <p key={reason} className="mt-1 text-[11px] text-black/55">{campaignReason(reason)}</p>)}</div>
        : <div className="rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-black/45"><dt className={labelClass}>Est. profit</dt><dd className="mt-2 flex items-center gap-1.5 text-xs"><LockSimple weight="light" size={13} aria-hidden="true" />Admins only</dd></div>}
    </dl>
    <div className={`grid gap-3 ${compact ? '' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]'}`}>
      <CampaignFunnelPanel metrics={row} />
      <Panel eyebrow="Trend" title="Daily performance"><CampaignTrendChart daily={report.daily} className={compact ? 'h-44 w-full' : 'h-full min-h-[224px] w-full'} /></Panel>
    </div>
    <div className={`grid gap-3 ${compact ? '' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]'}`}>
      <Panel eyebrow="Outcomes" title="What happened to the orders"><OutcomeBar metrics={row} legend /></Panel>
      <Panel eyebrow="Recent" title="Orders from this link"><CampaignOrdersList orders={row.recent_orders} hasMore={row.has_more} /></Panel>
    </div>
    {showFinancials && row.courier_fee_coverage && <p className="text-[11px] text-black/55">Courier fees recorded for {row.courier_fee_coverage.recorded_orders} of {row.courier_fee_coverage.total_orders} orders.{row.cogs_coverage && ` Product cost known for ${row.cogs_coverage.complete_orders} of ${row.cogs_coverage.total_orders} delivered orders.`} Missing amounts are not counted as zero.</p>}
  </div>;
}
