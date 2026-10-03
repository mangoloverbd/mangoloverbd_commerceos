import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, PencilSimple, Plus } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { DateRangePicker } from '@/components/DateRangePicker';
import { CampaignLinkDialog } from '@/components/campaign-links/CampaignLinkDialog';
import { CampaignReportNotes, CampaignSummary } from '@/components/campaign-links/CampaignReportView';
import { useCampaignDates, useCampaignLinks, useSaveCampaignLink } from '@/hooks/useCampaignLinks';
import { campaignMoney, campaignRate, campaignUrl, type CampaignLink, type CampaignRow } from '@/lib/campaignLinks';

type SortKey = 'name' | 'clicks' | 'captured_checkouts' | 'orders' | 'delivered_revenue' | 'estimated_delivered_profit';
export default function CampaignLinks() {
  const dates = useCampaignDates();
  const [includeArchived, setIncludeArchived] = useState(false);
  const result = useCampaignLinks(dates.query, undefined, includeArchived);
  const save = useSaveCampaignLink();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignLink>();
  const [copyError, setCopyError] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: 'clicks', descending: true });
  const financial = result.role === 'admin' && !!result.data && Object.prototype.hasOwnProperty.call(result.data.totals, 'estimated_delivered_profit');
  const rows = useMemo(() => [...(result.data?.rows || [])].sort((a, b) => {
    const left = a[sort.key]; const right = b[sort.key];
    if (left == null) return right == null ? 0 : 1; if (right == null) return -1;
    const difference = typeof left === 'string' ? left.localeCompare(String(right)) : Number(left) - Number(right);
    return sort.descending ? -difference : difference;
  }), [result.data, sort]);
  const column = (label: string, key: SortKey) => <th scope="col" className="py-3 pr-5 font-medium" aria-sort={sort.key === key ? sort.descending ? 'descending' : 'ascending' : 'none'}><button type="button" className="min-h-8 text-left focus-visible:ring-2 focus-visible:ring-black" onClick={() => setSort(previous => ({ key, descending: previous.key === key ? !previous.descending : key !== 'name' }))}>{label}{sort.key === key ? sort.descending ? ' ↓' : ' ↑' : ''}</button></th>;
  const copy = async (row: CampaignRow) => { setCopyError(''); try { await navigator.clipboard.writeText(campaignUrl(row.slug)); toast.success('Link copied'); } catch { setCopyError('Could not copy the link. Copy the URL from the detail page.'); } };
  return <div className="mx-auto w-full max-w-[1600px] bg-[#FAFAF8] px-4 py-8 font-sans sm:px-8 [&_h1]:font-sans">
    <header className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-[8px] font-medium uppercase tracking-[0.3em]">Marketing</p><h1 className="mt-2 text-3xl font-light tracking-tight">Campaign links</h1><p className="mt-2 max-w-xl text-sm text-black/60">See which posts bring customers, orders, and delivered revenue.</p></div><Button onClick={() => { setEditing(undefined); setDialogOpen(true); }}><Plus weight="light" aria-hidden="true" className="mr-2" size={16} />New link</Button></header>
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3"><DateRangePicker value={dates.dateRange} onChange={dates.setRange} /><label className="flex min-h-10 cursor-pointer items-center gap-2 text-xs"><input type="checkbox" checked={includeArchived} onChange={event => setIncludeArchived(event.target.checked)} />Include archived links</label></div>
    <p className="mt-3 text-xs text-black/60">Reports use click date (Dhaka). Orders and current outcomes belong to the clicks in the selected period.</p>
    {!result.data && !result.isError && <p role="status" className="py-16 text-center text-sm text-black/60">Loading campaign links…</p>}
    {result.isError && <div role="alert" className="py-10"><p className="text-sm">{result.error.message}</p><Button className="mt-3" variant="outline" onClick={() => result.refetch()}>Retry</Button></div>}
    {result.data && !result.isError && <>
      <CampaignSummary metrics={result.data.totals} showFinancials={financial} />
      {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-xs"><caption className="sr-only">Campaign link performance for the selected clicks</caption><thead className="border-b border-black/10"><tr>{column('Link', 'name')}<th scope="col" className="pr-5 font-medium">Channel</th>{column('Clicks', 'clicks')}{column('Captured checkouts', 'captured_checkouts')}{column('Orders', 'orders')}{column('Delivered revenue', 'delivered_revenue')}{financial && column('Est. delivered profit', 'estimated_delivered_profit')}<th scope="col" className="font-medium">Actions</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-black/[0.06]"><td className="max-w-xs py-5 pr-5"><Link to={`/campaign-links/${row.id}?${dates.query}`} className="font-medium underline-offset-4 hover:underline">{row.name}</Link><p className="mt-1 truncate text-[11px] text-black/60">/go/{row.slug}{row.archived_at ? ' · Archived' : ''}</p></td><td className="pr-5 capitalize text-black/60">{row.channel}</td><td className="pr-5 tabular-nums">{row.clicks}</td><td className="pr-5 tabular-nums">{row.captured_checkouts}</td><td className="pr-5 tabular-nums">{row.orders}<span className="mt-1 block text-[11px] text-black/60">{campaignRate(row.click_to_order)} of clicks</span></td><td className="pr-5 tabular-nums">{campaignMoney(row.delivered_revenue)}{row.delivered_revenue == null && <span className="block text-[11px] text-black/60">Amount incomplete</span>}</td>{financial && <td className="pr-5 tabular-nums">{campaignMoney(row.estimated_delivered_profit)}</td>}<td><div className="flex items-center gap-1"><Button variant="ghost" size="icon" aria-label={`Copy ${row.name} link`} onClick={() => copy(row)}><Copy weight="light" size={16} /></Button><Button variant="ghost" size="icon" aria-label={`Edit ${row.name}`} onClick={() => { setEditing(row); setDialogOpen(true); }}><PencilSimple weight="light" size={16} /></Button><Button variant="ghost" disabled={save.isPending} onClick={() => save.mutate({ id: row.id, input: { archived: !row.archived_at } })}>{row.archived_at ? 'Restore' : 'Archive'}</Button></div></td></tr>)}</tbody></table></div>
        : <div className="py-16 text-center"><h2 className="text-lg font-light">{includeArchived ? 'No campaign links yet' : 'No campaign links yet'}</h2><p className="mt-2 text-sm text-black/60">Create a link for your next post or placement to start tracking.</p></div>}
      <section className="my-8 bg-black/[0.025] p-5"><h2 className="text-sm font-medium">{result.data.unattributed.label}</h2><p className="mt-2 text-xs text-black/60">{result.data.unattributed.orders} orders · {campaignMoney(result.data.unattributed.order_value)} merchandise value. Order-created date basis; excluded from campaign totals and conversion rates.</p></section>
      <CampaignReportNotes report={result.data} showFinancials={financial} />
    </>}
    {save.isError && <p role="alert" className="mt-4 text-sm text-red-700">{save.error.message}</p>}
    {copyError && <p role="alert" className="mt-4 text-sm text-red-700">{copyError}</p>}
    <CampaignLinkDialog open={dialogOpen} onOpenChange={setDialogOpen} link={editing} />
  </div>;
}
