import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, PencilSimple } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { DateRangePicker } from '@/components/DateRangePicker';
import { CampaignLinkDialog } from '@/components/campaign-links/CampaignLinkDialog';
import { CampaignDailyChart, CampaignFunnel, CampaignReportNotes, CampaignSummary } from '@/components/campaign-links/CampaignReportView';
import { useCampaignDates, useCampaignLinks, useSaveCampaignLink } from '@/hooks/useCampaignLinks';
import { campaignMoney, campaignReason, campaignUrl } from '@/lib/campaignLinks';

export default function CampaignLinkDetail() {
  const { id } = useParams(); const dates = useCampaignDates();
  const result = useCampaignLinks(dates.query, id); const save = useSaveCampaignLink();
  const [editing, setEditing] = useState(false);
  const [copyError, setCopyError] = useState('');
  const row = result.data?.rows[0];
  const financial = result.role === 'admin' && !!row && Object.prototype.hasOwnProperty.call(row, 'estimated_delivered_profit');
  const copy = async () => { if (!row) return; setCopyError(''); try { await navigator.clipboard.writeText(campaignUrl(row.slug)); toast.success('Link copied'); } catch { setCopyError('Could not copy. Select the URL above.'); } };
  return <div className="mx-auto w-full max-w-[1600px] bg-[#FAFAF8] px-4 py-8 font-sans sm:px-8 [&_h1]:font-sans">
    <Link to={`/campaign-links?${dates.query}`} className="inline-flex min-h-10 items-center gap-2 text-xs text-black/60 hover:text-black"><ArrowLeft aria-hidden="true" weight="light" size={16} />All campaign links</Link>
    {!result.data && !result.isError && <p role="status" className="py-16 text-center text-sm">Loading campaign link…</p>}
    {result.isError && <div role="alert" className="py-10"><p>{result.error.message}</p><Button variant="outline" className="mt-3" onClick={() => result.refetch()}>Retry</Button></div>}
    {result.data && row && !result.isError && <>
      <header className="mt-4 flex flex-wrap items-start justify-between gap-5"><div className="min-w-0"><p className="text-[8px] font-medium uppercase tracking-[0.3em]">{row.channel}{row.archived_at ? ' · Archived' : ''}</p><h1 className="mt-2 break-words text-3xl font-light tracking-tight">{row.name}</h1><a href={campaignUrl(row.slug)} target="_blank" rel="noreferrer" className="mt-2 block break-all text-xs text-black/60 underline underline-offset-4">{campaignUrl(row.slug)}</a></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={copy}><Copy aria-hidden="true" weight="light" size={16} className="mr-2" />Copy link</Button><Button variant="outline" onClick={() => setEditing(true)}><PencilSimple aria-hidden="true" weight="light" size={16} className="mr-2" />Edit link</Button><Button variant="outline" disabled={save.isPending} onClick={() => save.mutate({ id: row.id, input: { archived: !row.archived_at } })}>{row.archived_at ? 'Restore link' : 'Archive link'}</Button></div></header>
      <div className="mt-6 grid gap-2 text-xs text-black/60"><p>Destination: {row.destination_path}</p>{row.creator_name && <p>Creator: {row.creator_name}</p>}{row.post_url && <a href={row.post_url} target="_blank" rel="noreferrer" className="underline underline-offset-4">View original post</a>}{row.notes && <p className="whitespace-pre-wrap">{row.notes}</p>}{row.archived_at && <p>Archived links still redirect and record clicks.</p>}</div>
      <div className="mt-6"><DateRangePicker value={dates.dateRange} onChange={dates.setRange} /></div><p className="mt-3 text-xs text-black/60">Reports use click date (Dhaka). This period includes later orders attributed to these clicks.</p>
      <CampaignSummary metrics={row} showFinancials={financial} />
      <div className="grid gap-x-10 lg:grid-cols-2"><CampaignFunnel metrics={row} /><CampaignDailyChart daily={result.data.daily} /></div>
      <section className="py-6"><h2 className="text-sm font-medium">Current order outcomes</h2><dl className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-5">{(['pending', 'confirmed', 'delivered', 'cancelled', 'returned'] as const).map(outcome => <div key={outcome}><dt className="text-xs capitalize text-black/60">{outcome}</dt><dd className="mt-1 text-2xl font-light tabular-nums">{row[outcome]}</dd></div>)}</dl></section>
      {financial && row.courier_fee_coverage && <p className="py-2 text-xs text-black/60">Recorded courier fee coverage: {row.courier_fee_coverage.recorded_orders} of {row.courier_fee_coverage.total_orders} orders. Missing fees are not recorded zeroes.{row.cogs_coverage && ` Delivered cost coverage: ${row.cogs_coverage.complete_orders} of ${row.cogs_coverage.total_orders} delivered orders.`}</p>}
      <section className="py-6"><h2 className="text-sm font-medium">Recent attributed orders</h2>{row.recent_orders?.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><caption className="sr-only">Newest attributed orders and current outcomes</caption><thead><tr><th className="py-3 font-medium">Order</th><th className="font-medium">Placed</th><th className="font-medium">Outcome</th><th className="font-medium">Order value</th><th className="font-medium">Delivered revenue</th></tr></thead><tbody>{row.recent_orders.map(order => <tr key={order.id} className="border-t border-black/[0.06]"><td className="py-4"><Link className="underline underline-offset-4" to={`/orders/${order.id}`}>#{order.order_number || order.id.slice(0, 8)}</Link></td><td>{new Date(order.created_at).toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka' })}</td><td className="capitalize">{order.delivery_kind === 'partial' ? 'Partial delivery' : order.outcome}</td><td>{campaignMoney(order.order_value)}</td><td>{campaignMoney(order.delivered_revenue)}{order.amount_incomplete_reason && <p className="max-w-48 pt-1 text-black/60">{campaignReason(order.amount_incomplete_reason)}</p>}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-black/60">No orders from these clicks yet.</p>}{row.has_more && <p className="mt-3 text-xs text-black/60">Showing the newest 50 orders. Totals include all attributed orders.</p>}</section>
      <CampaignReportNotes report={result.data} showFinancials={financial} />
      <CampaignLinkDialog open={editing} onOpenChange={setEditing} link={row} />
    </>}
    {save.isError && <p role="alert" className="mt-4 text-sm text-red-700">{save.error.message}</p>}
    {copyError && <p role="alert" className="mt-4 text-sm text-red-700">{copyError}</p>}
  </div>;
}
