import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, PencilSimple } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { DateRangePicker } from '@/components/DateRangePicker';
import { CampaignLinkDialog } from '@/components/campaign-links/CampaignLinkDialog';
import { CampaignLinkInsights, CampaignUpdatedNote, ChannelChip } from '@/components/campaign-links/CampaignReportView';
import { useCampaignDates, useCampaignLinks, useSaveCampaignLink } from '@/hooks/useCampaignLinks';
import { campaignUrl, hasFinancials } from '@/lib/campaignLinks';

export default function CampaignLinkDetail() {
  const { id } = useParams(); const dates = useCampaignDates();
  const result = useCampaignLinks(dates.query, id); const save = useSaveCampaignLink();
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const row = result.data?.rows[0];
  const financial = result.role === 'admin' && hasFinancials(row);
  const copy = async () => {
    if (!row) return; setCopyError('');
    try { await navigator.clipboard.writeText(campaignUrl(row.slug)); setCopied(true); toast.success('Link copied'); window.setTimeout(() => setCopied(false), 1200); }
    catch { setCopyError('Could not copy. Select the link text instead.'); }
  };
  return <div className="min-h-full space-y-4 bg-[#FAFAF8] p-1 lg:p-2">
    <Link to={`/campaign-links?${dates.query}`} className="inline-flex min-h-8 items-center gap-1.5 text-xs text-black/60 hover:text-black"><ArrowLeft aria-hidden="true" weight="light" size={15} />All campaign links</Link>
    {!result.data && !result.isError && <p role="status" className="py-24 text-center text-sm font-medium text-black/60">Loading campaign link…</p>}
    {result.isError && <div role="alert" className="flex flex-col items-center gap-3 py-20 text-center"><p className="text-sm font-medium text-black/60">{result.error.message}</p><Button variant="outline" size="sm" onClick={() => result.refetch()}>Retry</Button></div>}
    {result.data && row && !result.isError && <>
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5"><ChannelChip channel={row.channel} extra={row.creator_name || undefined} />
            {row.archived_at && <span className="inline-flex h-5 items-center rounded-md bg-black/[0.07] px-1.5 text-[11px] font-medium text-black/60">Archived · still redirects</span>}</div>
          <h1 className="mt-1.5 break-words font-sf-display text-[22px] font-bold tracking-tight text-black">{row.name}</h1>
          <div className="mt-2 flex max-w-xl items-center gap-2 rounded-xl border border-black/[0.09] bg-white py-1.5 pl-3 pr-1.5">
            <a href={campaignUrl(row.slug)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-mono text-xs text-black/70 hover:underline">{campaignUrl(row.slug)}</a>
            <button type="button" aria-label="Copy link" onClick={copy} className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-[background-color,color,transform] duration-150 ease-out hover:bg-black/[0.05] active:scale-[0.96] ${copied ? 'text-[#2F7A55]' : 'text-black/55'}`}>{copied ? <Check weight="bold" size={14} /> : <Copy weight="light" size={15} />}</button>
          </div>
          <p className="mt-1.5 text-[11px] text-black/50">Opens <span className="font-mono">{row.destination_path}</span>{row.post_url && <> · <a href={row.post_url} target="_blank" rel="noreferrer" className="underline underline-offset-2">View original post</a></>}</p>
          {row.notes && <p className="mt-1 max-w-xl whitespace-pre-wrap text-xs text-black/60">{row.notes}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={dates.dateRange} onChange={dates.setRange} />
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}><PencilSimple aria-hidden="true" weight="light" size={15} className="mr-1.5" />Edit link</Button>
          <Button variant="outline" size="sm" disabled={save.isPending} onClick={() => save.mutate({ id: row.id, input: { archived: !row.archived_at } })}>{row.archived_at ? 'Restore link' : 'Archive link'}</Button>
        </div>
      </header>
      <CampaignLinkInsights row={row} report={result.data} showFinancials={financial} />
      <CampaignUpdatedNote report={result.data} showFinancials={financial} />
      <CampaignLinkDialog open={editing} onOpenChange={setEditing} link={row} />
    </>}
    {save.isError && <p role="alert" className="text-sm text-[#B4473A]">{save.error.message}</p>}
    {copyError && <p role="alert" className="text-sm text-[#B4473A]">{copyError}</p>}
  </div>;
}
