import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { EChart } from '@/components/business-report/EChart';
import { CHART } from '@/components/business-report/chartTheme';
import { escapeHtml } from '@/lib/businessReportCharts';
import { campaignMoney, campaignRate, campaignReason, type CampaignMetrics, type CampaignReport } from '@/lib/campaignLinks';

const labelClass = 'text-[8px] font-medium uppercase tracking-[0.3em] text-black';
export function CampaignSummary({ metrics, showFinancials }: { metrics: CampaignMetrics; showFinancials: boolean }) {
  const money = (label: string, value: number | null | undefined, reasons: string[] = []) => <div key={label}>
    <dt className={labelClass}>{label}</dt><dd className="mt-2 text-2xl font-light tabular-nums">{campaignMoney(value)}</dd>
    {value == null && reasons.map(reason => <p key={reason} className="mt-1 text-xs text-black/60">{campaignReason(reason)}</p>)}
  </div>;
  return <dl className="grid grid-cols-2 gap-x-6 gap-y-6 py-7 sm:grid-cols-3 xl:grid-cols-7">
    <div><dt className={labelClass}>Clicks</dt><dd className="mt-2 text-2xl font-light tabular-nums">{metrics.clicks.toLocaleString('en-BD')}</dd><p className="mt-1 text-xs text-black/60">Human clicks only</p></div>
    <div><dt className={labelClass}>Estimated visitor-days</dt><dd className="mt-2 text-2xl font-light tabular-nums">{metrics.estimated_visitor_days.toLocaleString('en-BD')}</dd><p className="mt-1 text-xs text-black/60">Daily browser hints, not people</p></div>
    <div><dt className={labelClass}>Captured checkouts</dt><dd className="mt-2 text-2xl font-light tabular-nums">{metrics.captured_checkouts.toLocaleString('en-BD')}</dd><p className="mt-1 text-xs text-black/60">Orders and unconverted drafts</p></div>
    <div><dt className={labelClass}>Orders</dt><dd className="mt-2 text-2xl font-light tabular-nums">{metrics.orders.toLocaleString('en-BD')}</dd><p className="mt-1 text-xs text-black/60">From selected clicks</p></div>
    {money('Order value', metrics.order_value, metrics.order_value_incomplete_reasons)}
    {money('Delivered revenue', metrics.delivered_revenue, metrics.revenue_incomplete_reasons)}
    {showFinancials && Object.prototype.hasOwnProperty.call(metrics, 'estimated_delivered_profit') && money('Estimated delivered profit', metrics.estimated_delivered_profit, metrics.profit_incomplete_reasons)}
  </dl>;
}
export function CampaignReportNotes({ report, showFinancials }: { report: CampaignReport; showFinancials: boolean }) {
  return <div className="space-y-2 text-xs leading-relaxed text-black/60">
    <p>Updated {new Date(report.meta.as_of).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })} (Dhaka). Recent results are provisional; outcomes may change as customers order and deliveries finish.</p>
    <p>Estimated visitor-days count anonymous daily browser hints, not people. One visitor across different days can count more than once.</p>
    {showFinancials && report.meta.profit_basis && <p>{report.meta.profit_basis}</p>}
  </div>;
}
export function CampaignDailyChart({ daily }: { daily: CampaignReport['daily'] }) {
  const reduceMotion = useReducedMotion();
  const option = useMemo(() => ({
    color: [CHART.ink, CHART.ink3], animation: !reduceMotion,
    grid: { top: 45, bottom: 35, left: 40, right: 20 },
    tooltip: { trigger: 'axis', backgroundColor: CHART.bg, borderColor: CHART.rule, textStyle: { color: CHART.ink },
      formatter: (items: Array<{ name: string; seriesName: string; value: number }>) => items.length ? `${escapeHtml(items[0].name)}<br>${items.map(item => `${escapeHtml(item.seriesName)}: ${Number(item.value).toLocaleString('en-BD')}`).join('<br>')}` : '' },
    xAxis: { type: 'category', data: daily.map(day => day.day), axisLine: { lineStyle: { color: CHART.rule } }, axisLabel: { color: CHART.ink3, fontFamily: CHART.font } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: CHART.rule } } },
    series: [{ name: 'Clicks', type: 'line', symbol: daily.length === 1 ? 'circle' : 'none', symbolSize: 7, data: daily.map(day => day.clicks) },
      { name: 'Orders from these clicks', type: 'line', symbol: daily.length === 1 ? 'circle' : 'none', symbolSize: 7, lineStyle: { type: 'dashed' }, data: daily.map(day => day.orders) }],
  }), [daily, reduceMotion]);
  return <section className="min-w-0 py-6"><h2 className="text-sm font-medium">Daily clicks and their orders</h2><p className="mt-1 text-xs text-black/60">Orders are plotted on the click's Dhaka day, not the day they were placed.</p>
    <div className="mt-3 flex flex-wrap gap-5 text-xs text-black/60"><span className="inline-flex items-center gap-2"><span aria-hidden="true" className="w-5 border-t border-black" />Clicks</span><span className="inline-flex items-center gap-2"><span aria-hidden="true" className="w-5 border-t border-dashed border-black/50" />Orders from these clicks</span></div>
    <EChart option={option} ariaLabel="Clicks and orders from these clicks by Dhaka click day" className="h-64 w-full" animate={!reduceMotion} />
    <details className="text-xs"><summary className="cursor-pointer py-2">View daily numbers</summary><table className="w-full text-left"><caption className="sr-only">Daily campaign data</caption><thead><tr><th>Click day</th><th>Clicks</th><th>Orders from these clicks</th></tr></thead><tbody>{daily.map(day => <tr key={day.day}><th scope="row" className="py-1 font-normal">{day.day}</th><td>{day.clicks}</td><td>{day.orders}</td></tr>)}</tbody></table></details>
  </section>;
}
export function CampaignFunnel({ metrics }: { metrics: CampaignMetrics }) {
  const stages = [['Clicks', metrics.clicks], ['Captured checkouts', metrics.captured_checkouts], ['Orders', metrics.orders], ['Delivered', metrics.delivered]] as const;
  const max = Math.max(1, ...stages.map(([, count]) => count));
  return <section className="py-6"><h2 className="text-sm font-medium">From click to delivery</h2><ol className="mt-4 grid gap-3">{stages.map(([label, count]) => <li key={label} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3 text-xs"><span>{label}</span><span className="h-1.5 bg-black/5" aria-hidden="true"><span className="block h-full bg-black/50" style={{ width: `${count / max * 100}%` }} /></span><span className="text-right tabular-nums">{count}</span></li>)}</ol>
    <p className="mt-3 text-xs text-black/60">A click can generate more than one order. Counts are not forced into a decreasing funnel.</p>
    <dl className="mt-5 flex flex-wrap gap-6 text-xs"><div><dt>Click to order</dt><dd className="mt-1 text-lg font-light">{campaignRate(metrics.click_to_order)}</dd></div><div><dt>Order to delivered</dt><dd className="mt-1 text-lg font-light">{campaignRate(metrics.order_to_delivered)}</dd></div><div><dt>Loss rate</dt><dd className="mt-1 text-lg font-light">{campaignRate(metrics.loss_rate)}</dd></div></dl>
  </section>;
}
