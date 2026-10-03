import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Copy, X } from '@phosphor-icons/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { useCampaignIdentity, useSaveCampaignLink } from '@/hooks/useCampaignLinks';
import { CAMPAIGN_CHANNELS, CAMPAIGN_ORIGIN, campaignChannelLabel, campaignUrl, channelColor, cleanCampaignSlugInput, normalizeCampaignSlug, slugFromName, type CampaignLink, type CampaignInput } from '@/lib/campaignLinks';

type ProductDestination = { id: string; name: string; slug: string | null; published: boolean };
const blank: CampaignInput = { name: '', slug: '', channel: 'facebook', destination_path: '/', creator_name: '', post_url: '', notes: '' };
const host = CAMPAIGN_ORIGIN.replace(/^https?:\/\/(www\.)?/, '');
// Quick, decisive ease-out on the way in; a shorter exit so closing never feels slow.
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export function CampaignLinkDialog({ open, onOpenChange, link }: { open: boolean; onOpenChange: (open: boolean) => void; link?: CampaignLink }) {
  const prefix = useId();
  const reduceMotion = useReducedMotion();
  const identity = useCampaignIdentity();
  const save = useSaveCampaignLink();
  const [values, setValues] = useState<CampaignInput>(blank);
  const [slugEdited, setSlugEdited] = useState(false);
  const [pastedUrl, setPastedUrl] = useState(false);
  const [customDestination, setCustomDestination] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setValues(link ? { name: link.name, slug: link.slug, channel: link.channel, destination_path: link.destination_path,
        creator_name: link.creator_name || '', post_url: link.post_url || '', notes: link.notes || '' } : { ...blank });
      setSlugEdited(!!link); setPastedUrl(false); setErrors({}); save.reset();
      setCustomDestination(false);
    }
  // Reset when the dialog opens for a different link, not on mutation state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, link?.id]);
  const products = useQuery({ queryKey: ['campaign-destinations', identity.userId, identity.role], enabled: open && identity.ready,
    queryFn: async ({ signal }) => {
      const response = await apiFetch('/api/products', { signal });
      if (!response.ok) throw new Error('Published products could not be loaded. You can enter a custom path.');
      const data = await response.json();
      return (data.products ?? []) as ProductDestination[];
    }, staleTime: 60_000 });
  const published = products.data?.filter(product => product.published && product.slug) ?? [];
  const knownDestination = values.destination_path === '/' || published.some(product => `/product/${product.slug}` === values.destination_path);
  const showCustom = customDestination || !knownDestination;
  const field = (key: keyof CampaignInput, value: string) => setValues(previous => ({ ...previous, [key]: value }));
  const validSlug = normalizeCampaignSlug(values.slug);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    const slug = normalizeCampaignSlug(values.slug);
    if (!values.name.trim()) next.name = 'Enter a name for this link.';
    if (!slug) next.slug = 'Use 3–60 lowercase letters, numbers and single hyphens, like bori-campaign-1.';
    if (!values.destination_path.startsWith('/') || values.destination_path.startsWith('//') || /^\/go(?:\/|[?#]|$)/i.test(values.destination_path)) {
      next.destination_path = 'Enter a storefront path such as /product/himsagar, not an external URL or /go link.'; setCustomDestination(true);
    }
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) { window.setTimeout(() => document.getElementById(`${prefix}-${first}`)?.focus(), 0); return; }
    try {
      await save.mutateAsync({ id: link?.id, input: { ...values, name: values.name.trim(), slug: slug!,
        creator_name: values.creator_name?.trim() || null, post_url: values.post_url?.trim() || null, notes: values.notes?.trim() || null } });
      onOpenChange(false);
    } catch { /* Mutation error is displayed below; keep entered values. */ }
  };
  const copyPreview = async () => {
    if (!validSlug) return;
    try { await navigator.clipboard.writeText(campaignUrl(validSlug)); setCopied(true); window.setTimeout(() => setCopied(false), 1200); } catch { /* The link stays selectable in the preview. */ }
  };
  const attrs = (key: string) => ({ id: `${prefix}-${key}`, 'aria-invalid': !!errors[key], 'aria-describedby': errors[key] ? `${prefix}-${key}-error` : `${prefix}-${key}-note` });
  const errorText = (key: string) => errors[key] && <p id={`${prefix}-${key}-error`} className="text-xs text-[#B4473A]">{errors[key]}</p>;
  const hasDetails = !!(link?.creator_name || link?.post_url || link?.notes);
  return <DialogPrimitive.Root open={open} onOpenChange={next => { if (!save.isPending) onOpenChange(next); }}>
    <AnimatePresence>{open && <DialogPrimitive.Portal forceMount>
      <DialogPrimitive.Overlay asChild forceMount>
        <motion.div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
          initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.2, ease: EASE_OUT } }} exit={{ opacity: 0, transition: { duration: 0.15, ease: 'easeIn' } }} />
      </DialogPrimitive.Overlay>
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
        <DialogPrimitive.Content asChild forceMount>
          <motion.div className="pointer-events-auto relative grid max-h-[90dvh] w-full max-w-[560px] gap-4 overflow-y-auto overscroll-contain rounded-[20px] bg-[#FAFAF8] p-6 shadow-[0_30px_80px_-30px_rgba(11,11,10,0.5)] outline-none"
            style={{ transformOrigin: 'center' }}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
            animate={reduceMotion ? { opacity: 1, transition: { duration: 0.15 } } : { opacity: 1, scale: 1, y: 0, transition: { duration: 0.26, ease: EASE_OUT } }}
            exit={reduceMotion ? { opacity: 0, transition: { duration: 0.1 } } : { opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.16, ease: 'easeIn' } }}>
      <DialogPrimitive.Close disabled={save.isPending} aria-label="Close" className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-black/55 transition-[background-color,color,transform] duration-150 ease-out hover:bg-black/[0.05] hover:text-black active:scale-[0.94] disabled:opacity-40"><X weight="light" size={18} /></DialogPrimitive.Close>
      <div className="flex flex-col gap-1.5 pr-8"><p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Marketing</p>
        <DialogPrimitive.Title className="font-sf-display text-[19px] font-semibold tracking-tight">{link ? 'Edit campaign link' : 'New campaign link'}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="text-xs text-black/60">One link for each post, ad or creator.</DialogPrimitive.Description></div>
      <form noValidate onSubmit={submit} className="grid gap-4">
        <div className="grid gap-1.5"><Label htmlFor={`${prefix}-name`}>Name</Label><Input {...attrs('name')} maxLength={120} placeholder="e.g. Bori campaign 1" value={values.name} onChange={event => {
          const name = event.target.value; setValues(previous => ({ ...previous, name, ...(!slugEdited ? { slug: slugFromName(name) || '' } : {}) }));
        }} />{errorText('name')}</div>

        <div className="grid gap-1.5"><Label htmlFor={`${prefix}-slug`}>Link</Label>
          <div className={`flex items-center overflow-hidden rounded-md border bg-white focus-within:ring-2 focus-within:ring-black ${errors.slug ? 'border-[#B4473A]' : 'border-input'}`}>
            <span aria-hidden="true" className="whitespace-nowrap pl-3 font-mono text-xs text-black/45">{host}/go/</span>
            <input {...attrs('slug')} maxLength={200} spellCheck={false} autoComplete="off" placeholder="bori-campaign-1" value={values.slug}
              onChange={event => { const cleaned = cleanCampaignSlugInput(event.target.value); field('slug', cleaned.slug); setPastedUrl(cleaned.fromUrl); setSlugEdited(true); }}
              className="h-10 min-w-0 flex-1 bg-transparent pr-3 font-mono text-xs outline-none" />
          </div>
          {errorText('slug') || <p id={`${prefix}-slug-note`} className={`text-xs ${pastedUrl ? 'text-[#2F7A55]' : 'text-black/50'}`}>{pastedUrl ? 'Full link pasted. Kept only the part after /go/.' : link ? 'The link ending can’t change after its first click.' : 'Filled from the name. You can paste a full link too.'}</p>}
        </div>

        <div className="grid gap-1.5"><span id={`${prefix}-channel-label`} className="text-sm font-medium leading-none">Channel</span>
          <div role="group" aria-labelledby={`${prefix}-channel-label`} className="flex flex-wrap gap-1.5">
            {CAMPAIGN_CHANNELS.map(channel => <button key={channel} type="button" aria-pressed={values.channel === channel} onClick={() => field('channel', channel)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-[9px] border px-2.5 text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97] ${values.channel === channel ? 'border-black bg-black text-white' : 'border-black/[0.09] bg-white text-black/65 hover:border-black/20'}`}>
              <i aria-hidden="true" className="block h-1.5 w-1.5 rounded-full" style={{ background: channelColor(channel) }} />{campaignChannelLabel(channel)}</button>)}
          </div>
        </div>

        <div className="grid gap-1.5"><Label htmlFor={`${prefix}-destination-choice`}>Opens</Label>
          {showCustom && <><Label htmlFor={`${prefix}-destination_path`} className="sr-only">Destination path</Label>
            <Input {...attrs('destination_path')} maxLength={200} placeholder="/step/katimon-mango" value={values.destination_path} onChange={event => field('destination_path', event.target.value)} className="font-mono text-xs" />
            {errorText('destination_path') || <p id={`${prefix}-destination_path-note`} className="text-xs text-black/50">A storefront path, for example a /step/ landing page.</p>}</>}
          <Select value={showCustom ? 'custom' : values.destination_path} onValueChange={next => {
            setCustomDestination(next === 'custom'); if (next !== 'custom') field('destination_path', next);
          }}>
            <SelectTrigger id={`${prefix}-destination-choice`} aria-label="Opens" className="h-10 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top" align="start" sideOffset={6} avoidCollisions={false} position="popper" className="max-h-[280px]">
              <SelectItem value="/">Homepage</SelectItem>{published.map(product => <SelectItem key={product.id} value={`/product/${product.slug}`}>{product.name}</SelectItem>)}<SelectItem value="custom">Landing page or custom path…</SelectItem>
            </SelectContent>
          </Select>
          {products.isError && <p className="text-xs text-black/55">Products could not be loaded. Enter a path above.</p>}
        </div>

        <details open={hasDetails} className="group text-sm">
          <summary className="cursor-pointer list-none text-xs text-black/60 hover:text-black"><span className="group-open:hidden">+ </span><span className="hidden group-open:inline">− </span>Creator, post and notes (optional)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor={`${prefix}-creator`}>Creator</Label><Input id={`${prefix}-creator`} maxLength={120} placeholder="e.g. Rafi" value={values.creator_name || ''} onChange={event => field('creator_name', event.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor={`${prefix}-post`}>Post or ad URL</Label><Input id={`${prefix}-post`} type="url" maxLength={2048} placeholder="https://facebook.com/…" value={values.post_url || ''} onChange={event => field('post_url', event.target.value)} /></div>
            <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor={`${prefix}-notes`}>Notes</Label><Textarea id={`${prefix}-notes`} maxLength={2000} rows={2} value={values.notes || ''} onChange={event => field('notes', event.target.value)} /></div>
          </div>
        </details>

        <div className="flex items-center justify-between gap-3 rounded-xl bg-[#19382D] px-4 py-3 text-[#FFFAF0]">
          <div className="min-w-0"><p className="text-[8px] font-medium uppercase tracking-[0.3em] text-[#F5C456]">Your link</p>
            <p className="mt-1 break-all font-mono text-xs">{campaignUrl(validSlug || 'your-link')}</p></div>
          <button type="button" aria-label="Copy your link" disabled={!validSlug} onClick={copyPreview}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#FFFAF0] transition-[background-color,transform] duration-150 ease-out hover:bg-white/10 active:scale-[0.96] disabled:opacity-40">
            {copied ? <Check weight="bold" size={15} /> : <Copy weight="light" size={16} />}</button>
        </div>

        {save.isError && <p role="alert" className="text-sm text-[#B4473A]">{save.error.message}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={save.isPending} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={save.isPending} className="active:scale-[0.97]">{save.isPending ? 'Saving…' : link ? 'Save changes' : 'Create link'}</Button></div>
      </form>
          </motion.div>
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>}</AnimatePresence>
  </DialogPrimitive.Root>;
}
