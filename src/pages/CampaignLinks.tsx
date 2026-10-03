import { useMemo, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowSquareOut, Check, Copy, DotsThree, MagnifyingGlass, PencilSimple, Plus, Star, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/sonner';
import { DateRangePicker } from '@/components/DateRangePicker';
import { CampaignLinkDialog } from '@/components/campaign-links/CampaignLinkDialog';
import {
  CampaignChannelMix, CampaignFunnelPanel, CampaignLinkInsights, CampaignTiles, CampaignTrendChart, CampaignUpdatedNote,
  ChannelChip, Hint, OutcomeBar, Panel, labelClass,
} from '@/components/campaign-links/CampaignReportView';
import { useCampaignDates, useCampaignLinks, useSaveCampaignLink } from '@/hooks/useCampaignLinks';
import { campaignMoney, campaignRate, campaignUrl, hasFinancials, previousCampaignRange, type CampaignLink, type CampaignRow } from '@/lib/campaignLinks';

type SortKey = 'clicks' | 'orders' | 'delivered_revenue' | 'estimated_delivered_profit';
type Status = 'active' | 'archived' | 'all';
const STATUSES: Array<[Status, string]> = [['active', 'Active'], ['archived', 'Archived'], ['all', 'All']];

function CopyButton({ row, onError }: { row: CampaignRow; onError: (message: string) => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async (event: MouseEvent) => {
    event.stopPropagation(); onError('');
    try {
      await navigator.clipboard.writeText(campaignUrl(row.slug));
      setCopied(true); toast.success('Link copied'); window.setTimeout(() => setCopied(false), 1200);
    } catch { onError('Could not copy the link. Open the link and copy it from the detail page.'); }
  };
  return <button type="button" aria-label={`Copy ${row.name} link`} onClick={copy}
    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-[background-color,color,transform] duration-150 ease-out hover:bg-black/[0.05] active:scale-[0.96] ${copied ? 'text-[#2F7A55]' : 'text-black/55 hover:text-black'}`}>
    {copied ? <Check weight="bold" size={15} aria-hidden="true" /> : <Copy weight="light" size={16} aria-hidden="true" />}
  </button>;
}

function LinkSheet({ row, query, onClose, onEdit }: { row: CampaignRow | undefined; query: string; onClose: () => void; onEdit: (row: CampaignRow) => void }) {
  const detail = useCampaignLinks(query, row?.id, false, !!row);
  const current = detail.data?.rows[0] ?? row;
  const showFinancials = detail.role === 'admin' && hasFinancials(detail.data?.rows[0]);
  return <DialogPrimitive.Root open={!!row} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col bg-[#FAFAF8] shadow-[-18px_0_50px_-20px_rgba(11,11,10,0.35)] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right">
        {current && <>
          <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
            <div className="min-w-0"><ChannelChip channel={current.channel} extra={current.creator_name || undefined} />
              <DialogPrimitive.Title className="mt-1.5 break-words font-sf-display text-[19px] font-semibold tracking-tight">{current.name}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 font-mono text-[11px] text-black/50">/go/{current.slug} → {current.destination_path}</DialogPrimitive.Description></div>
            <DialogPrimitive.Close className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-black/55 hover:bg-black/[0.05] hover:text-black" aria-label="Close"><X weight="light" size={18} /></DialogPrimitive.Close>
          </div>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 pb-8">
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm"><Link to={`/campaign-links/${current.id}?${query}`}><ArrowSquareOut weight="light" size={15} className="mr-1.5" aria-hidden="true" />Open full page</Link></Button>
              <Button variant="outline" size="sm" onClick={() => onEdit(current)}><PencilSimple weight="light" size={15} className="mr-1.5" aria-hidden="true" />Edit link</Button>
            </div>
            {detail.isError && <div role="alert" className="text-xs">{detail.error.message} <button type="button" className="underline" onClick={() => detail.refetch()}>Retry</button></div>}
            {!detail.data && !detail.isError && <p role="status" className="py-10 text-center text-xs text-black/55">Loading link details…</p>}
            {detail.data?.rows[0] && <CampaignLinkInsights row={detail.data.rows[0]} report={detail.data} showFinancials={showFinancials} compact />}
          </div>
        </>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

export default function CampaignLinks() {
  const reduceMotion = useReducedMotion();
  const dates = useCampaignDates();
  const [status, setStatus] = useState<Status>('active');
  const [search, setSearch] = useState('');
  const result = useCampaignLinks(dates.query, undefined, status !== 'active');
  const previousQuery = useMemo(() => new URLSearchParams(previousCampaignRange(dates.from, dates.to)).toString(), [dates.from, dates.to]);
  const previous = useCampaignLinks(previousQuery);
  const save = useSaveCampaignLink();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignLink>();
  const [selected, setSelected] = useState<CampaignRow>();
  const [copyError, setCopyError] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: 'clicks', descending: true });
  const report = result.data;
  const financial = result.role === 'admin' && hasFinancials(report?.totals);
  const allRows = useMemo(() => report?.rows ?? [], [report]);
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows
      .filter(row => status === 'all' || (status === 'archived' ? !!row.archived_at : !row.archived_at))
      .filter(row => !term || `${row.name} ${row.slug} ${row.creator_name ?? ''}`.toLowerCase().includes(term))
      .sort((a, b) => {
        const left = a[sort.key]; const right = b[sort.key];
        if (left == null) return right == null ? 0 : 1; if (right == null) return -1;
        return sort.descending ? Number(right) - Number(left) : Number(left) - Number(right);
      });
  }, [allRows, status, search, sort]);
  const topEarner = useMemo(() => {
    const earning = allRows.filter(row => !row.archived_at && (row.delivered_revenue ?? 0) > 0);
    return earning.length > 1 ? earning.reduce((best, row) => (row.delivered_revenue! > best.delivered_revenue! ? row : best)).id : undefined;
  }, [allRows]);
  const edit = (link: CampaignLink) => { setEditing(link); setDialogOpen(true); };
  const header = (label: string, key: SortKey) => <th scope="col" className="px-3 py-1 text-right" aria-sort={sort.key === key ? sort.descending ? 'descending' : 'ascending' : 'none'}>
    <button type="button" className={`${labelClass} whitespace-nowrap`} onClick={() => setSort(previous => ({ key, descending: previous.key === key ? !previous.descending : true }))}>{label}{sort.key === key ? sort.descending ? ' ↓' : ' ↑' : ''}</button>
  </th>;
  const share = report ? report.totals.orders + report.unattributed.orders : 0;

  return <div className="min-h-full space-y-4 bg-[#FAFAF8] p-1 lg:p-2">
    <motion.header initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-sf-display text-[22px] font-bold tracking-tight text-black">Campaign Links</h1>
        <p className="mt-1 text-[13px] text-black/60">Which posts and ads bring delivered orders.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker value={dates.dateRange} onChange={dates.setRange} />
        <Button className="active:scale-[0.97]" onClick={() => { setEditing(undefined); setDialogOpen(true); }}><Plus weight="light" aria-hidden="true" className="mr-1.5" size={16} />New link</Button>
      </div>
    </motion.header>

    {!report && !result.isError && <p role="status" className="py-24 text-center text-sm font-medium text-black/60">Loading campaign links…</p>}
    {result.isError && <div role="alert" className="flex flex-col items-center gap-3 py-20 text-center"><p className="text-sm font-medium text-black/60">{result.error.message}</p><Button variant="outline" size="sm" onClick={() => result.refetch()}>Retry</Button></div>}

    {report && !result.isError && <>
      <CampaignTiles metrics={report.totals} previous={previous.data?.totals} daily={report.daily} showFinancials={financial} showLockedProfit={result.role !== 'admin'} />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
        <CampaignFunnelPanel metrics={report.totals} />
        <Panel eyebrow="Trend" title="Daily performance" hint="Orders and revenue are shown on the day of the click that brought them, not the day the order was placed.">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_190px]">
            <CampaignTrendChart daily={report.daily} />
            <CampaignChannelMix rows={allRows.filter(row => !row.archived_at)} />
          </div>
        </Panel>
      </div>

      <Panel eyebrow="Links" title="All campaign links" aside={<div className="flex flex-1 flex-wrap items-center justify-end gap-2">
        <label className="flex h-9 min-w-0 flex-[0_1_260px] items-center gap-2 rounded-[10px] border border-black/[0.09] bg-white px-2.5">
          <MagnifyingGlass weight="light" size={15} aria-hidden="true" className="shrink-0 text-black/40" />
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or /go/ link" aria-label="Search links" className="w-full min-w-0 bg-transparent text-[13px] outline-none" />
        </label>
        <div role="group" aria-label="Link status" className="inline-flex rounded-[10px] bg-black/[0.05] p-[3px]">
          {STATUSES.map(([key, label]) => <button key={key} type="button" aria-pressed={status === key} onClick={() => setStatus(key)}
            className={`rounded-lg px-2.5 py-1 text-xs transition-[background-color,color] duration-150 ease-out ${status === key ? 'bg-white text-black shadow-[0_1px_2px_rgba(11,11,10,0.08)]' : 'text-black/60 hover:text-black'}`}>{label}</button>)}
        </div>
      </div>}>
        {allRows.length === 0 ? <div className="flex flex-col items-center gap-2 py-12 text-center">
          <h3 className="text-[15px] font-medium">No campaign links yet</h3>
          <p className="max-w-sm text-xs text-black/60">Create one link for each post, ad or creator, like mangolover.com.bd/go/himsagar-reel.</p>
          <Button size="sm" className="mt-2" onClick={() => { setEditing(undefined); setDialogOpen(true); }}><Plus weight="light" size={15} className="mr-1.5" aria-hidden="true" />New link</Button>
        </div> : rows.length === 0 ? <p className="py-10 text-center text-xs text-black/55">No links match this search or filter.</p> : <div className="relative -mx-1.5 overflow-x-auto">
          <table className="w-full min-w-[880px] border-separate border-spacing-y-1 text-[13px]">
            <caption className="sr-only">Campaign link performance for clicks in the selected dates</caption>
            <thead><tr>
              <th scope="col" className={`${labelClass} px-3 py-1 text-left`}>Link</th>
              {header('Clicks', 'clicks')}{header('Orders', 'orders')}
              <th scope="col" className={`${labelClass} px-3 py-1 text-left`}>Outcomes</th>
              {header('Delivered ৳', 'delivered_revenue')}
              {financial && header('Est. profit ৳', 'estimated_delivered_profit')}
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>{rows.map(row => {
              const highReturns = row.orders >= 10 && (row.loss_rate ?? 0) >= 0.25;
              return <tr key={row.id} onClick={() => setSelected(row)} className={`cursor-pointer bg-white transition-shadow duration-150 ease-out hover:shadow-[0_0_0_1px_rgba(11,11,10,0.09),0_6px_18px_-10px_rgba(11,11,10,0.25)] ${row.archived_at ? 'opacity-60' : ''}`}>
                <td className="rounded-l-xl px-3 py-2.5">
                  <div className="flex max-w-[320px] flex-col gap-1">
                    <Link to={`/campaign-links/${row.id}?${dates.query}`} onClick={event => event.stopPropagation()} className="font-medium underline-offset-4 hover:underline">{row.name}</Link>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <ChannelChip channel={row.channel} extra={row.creator_name || undefined} />
                      <span className="font-mono text-[11px] text-black/45">/go/{row.slug}</span>
                      {row.id === topEarner && <span className="inline-flex h-5 items-center gap-1 rounded-md bg-[#F28C28]/15 px-1.5 text-[11px] font-medium text-[#9A4A06]"><Star weight="fill" size={10} aria-hidden="true" />Top earner</span>}
                      {highReturns && <span className="inline-flex h-5 items-center rounded-md bg-[#D9483B]/10 px-1.5 text-[11px] font-medium text-[#B4473A]">High returns {campaignRate(row.loss_rate)}</span>}
                      {row.archived_at && <span className="inline-flex h-5 items-center rounded-md bg-black/[0.07] px-1.5 text-[11px] font-medium text-black/60">Archived</span>}
                    </span>
                  </div>
                </td>
                <td className="px-3 text-right tabular-nums">{row.clicks.toLocaleString('en-BD')}</td>
                <td className="px-3 text-right tabular-nums">{row.orders.toLocaleString('en-BD')}<span className="block text-[11px] text-black/45">{row.clicks ? `${campaignRate(row.click_to_order)} of clicks` : '—'}</span></td>
                <td className="px-3"><OutcomeBar metrics={row} /></td>
                <td className="px-3 text-right font-medium tabular-nums">{campaignMoney(row.delivered_revenue)}{row.delivered_revenue == null && <span className="block text-[11px] font-normal text-black/50">Amount incomplete</span>}</td>
                {financial && <td className="px-3 text-right tabular-nums">{campaignMoney(row.estimated_delivered_profit)}
                  {row.estimated_delivered_profit != null && row.delivered_revenue ? <span className="block text-[11px] text-black/45">{campaignRate(row.estimated_delivered_profit / row.delivered_revenue)} margin</span> : null}</td>}
                <td className="rounded-r-xl px-2 text-right">
                  <div className="flex items-center justify-end gap-0.5" onClick={event => event.stopPropagation()}>
                    <CopyButton row={row} onError={setCopyError} />
                    <button type="button" aria-label={`Edit ${row.name}`} onClick={() => edit(row)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-black/55 transition-[background-color,color,transform] duration-150 ease-out hover:bg-black/[0.05] hover:text-black active:scale-[0.96]"><PencilSimple weight="light" size={16} aria-hidden="true" /></button>
                    <DropdownMenu>
                      <DropdownMenuTrigger aria-label={`More actions for ${row.name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-black/55 hover:bg-black/[0.05] hover:text-black"><DotsThree weight="bold" size={16} aria-hidden="true" /></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild><Link to={`/campaign-links/${row.id}?${dates.query}`}>Open full page</Link></DropdownMenuItem>
                        <DropdownMenuItem disabled={save.isPending} onSelect={() => save.mutate({ id: row.id, input: { archived: !row.archived_at } })}>{row.archived_at ? 'Restore link' : 'Archive link'}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      </Panel>

      <section aria-labelledby="campaign-unattributed" className="grid items-center gap-4 rounded-2xl border border-dashed border-black/[0.12] px-4 py-3.5 sm:px-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div>
          <p className={labelClass}>For comparison</p>
          <h2 id="campaign-unattributed" className="mt-1 font-sf-display text-[15px] font-semibold">Website orders without a campaign link
            <Hint label="About website orders without a campaign link">Counted by the date the order was placed, so they are not added to the campaign totals above.</Hint></h2>
          <p className="mt-0.5 text-xs tabular-nums text-black/60">{report.unattributed.orders.toLocaleString('en-BD')} orders · {campaignMoney(report.unattributed.order_value)} order value</p>
        </div>
        {share > 0 && <div className="flex flex-col gap-1.5 text-[11px] tabular-nums text-black/60">
          <div className="flex justify-between gap-3"><span>Website orders from campaign links</span><span>{campaignRate(report.totals.orders / share)}</span></div>
          <div role="img" aria-label={`${campaignRate(report.totals.orders / share)} of website orders came through campaign links`} className="flex h-2.5 gap-[2px] overflow-hidden rounded-[5px]">
            <i className="block h-full bg-black" style={{ width: `${report.totals.orders / share * 100}%` }} /><i className="block h-full flex-1 bg-black/[0.08]" />
          </div>
          <div className="flex justify-between gap-3"><span>{report.totals.orders.toLocaleString('en-BD')} via links</span><span>{report.unattributed.orders.toLocaleString('en-BD')} without</span></div>
        </div>}
      </section>
      <CampaignUpdatedNote report={report} showFinancials={financial} />
    </>}

    {save.isError && <p role="alert" className="text-sm text-[#B4473A]">{save.error.message}</p>}
    {copyError && <p role="alert" className="text-sm text-[#B4473A]">{copyError}</p>}
    <LinkSheet row={selected} query={dates.query} onClose={() => setSelected(undefined)} onEdit={row => { setSelected(undefined); edit(row); }} />
    <CampaignLinkDialog open={dialogOpen} onOpenChange={setDialogOpen} link={editing} />
  </div>;
}
