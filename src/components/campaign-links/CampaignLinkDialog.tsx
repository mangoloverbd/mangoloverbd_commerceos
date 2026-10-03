import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { useCampaignIdentity, useSaveCampaignLink } from '@/hooks/useCampaignLinks';
import { CAMPAIGN_CHANNELS, campaignUrl, normalizeCampaignSlug, slugFromName, type CampaignLink, type CampaignInput } from '@/lib/campaignLinks';

type ProductDestination = { id: string; name: string; slug: string | null; published: boolean };
const blank: CampaignInput = { name: '', slug: '', channel: 'facebook', destination_path: '/', creator_name: '', post_url: '', notes: '' };
export function CampaignLinkDialog({ open, onOpenChange, link }: { open: boolean; onOpenChange: (open: boolean) => void; link?: CampaignLink }) {
  const prefix = useId();
  const identity = useCampaignIdentity();
  const save = useSaveCampaignLink();
  const [values, setValues] = useState<CampaignInput>(blank);
  const [slugEdited, setSlugEdited] = useState(false);
  const [customDestination, setCustomDestination] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setValues(link ? { name: link.name, slug: link.slug, channel: link.channel, destination_path: link.destination_path,
        creator_name: link.creator_name || '', post_url: link.post_url || '', notes: link.notes || '' } : { ...blank });
      setSlugEdited(!!link); setErrors({}); save.reset();
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
  const field = (key: keyof CampaignInput, value: string) => setValues(previous => ({ ...previous, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    const slug = normalizeCampaignSlug(values.slug);
    if (!values.name.trim()) next.name = 'Enter a name for this link.';
    if (!slug) next.slug = 'Enter a slug using 3–60 lowercase letters, numbers, and single hyphens.';
    if (!values.destination_path.startsWith('/') || values.destination_path.startsWith('//') || /^\/go(?:\/|[?#]|$)/i.test(values.destination_path)) next.destination_path = 'Enter a storefront path such as /product/himsagar, not an external URL or /go link.';
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) { document.getElementById(`${prefix}-${first}`)?.focus(); return; }
    try {
      await save.mutateAsync({ id: link?.id, input: { ...values, name: values.name.trim(), slug: slug!,
        creator_name: values.creator_name?.trim() || null, post_url: values.post_url?.trim() || null, notes: values.notes?.trim() || null } });
      onOpenChange(false);
    } catch { /* Mutation error is displayed below; keep entered values. */ }
  };
  const attrs = (key: string) => ({ id: `${prefix}-${key}`, 'aria-invalid': !!errors[key], 'aria-describedby': errors[key] ? `${prefix}-${key}-error` : undefined });
  const errorText = (key: string) => errors[key] && <p id={`${prefix}-${key}-error`} className="text-xs text-red-700">{errors[key]}</p>;
  return <Dialog open={open} onOpenChange={next => { if (!save.isPending) onOpenChange(next); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto overscroll-contain bg-[#FAFAF8] sm:max-w-xl">
      <DialogHeader><DialogTitle>{link ? 'Edit campaign link' : 'New campaign link'}</DialogTitle><DialogDescription>One link for each post, creator, or placement. Everyone in your workspace can manage it.</DialogDescription></DialogHeader>
      <form noValidate onSubmit={submit} className="grid gap-4">
        <div className="grid gap-1.5"><Label htmlFor={`${prefix}-name`}>Name</Label><Input {...attrs('name')} maxLength={120} value={values.name} onChange={event => {
          const name = event.target.value; setValues(previous => ({ ...previous, name, ...(!slugEdited ? { slug: slugFromName(name) || '' } : {}) }));
        }} />{errorText('name')}</div>
        <div className="grid gap-1.5"><Label htmlFor={`${prefix}-slug`}>Slug</Label><Input {...attrs('slug')} maxLength={60} value={values.slug} onChange={event => { field('slug', event.target.value); setSlugEdited(true); }} />{errorText('slug')}
          <p className="break-all text-xs text-black/60">{campaignUrl(normalizeCampaignSlug(values.slug) || 'your-slug')}</p>
          {link && <p className="text-xs text-black/60">The slug cannot change after the first recorded click.</p>}
        </div>
        <div className="grid gap-1.5"><Label htmlFor={`${prefix}-channel`}>Channel</Label><select id={`${prefix}-channel`} className="h-10 rounded-md border bg-transparent px-3 text-sm" value={values.channel} onChange={event => field('channel', event.target.value)}>{CAMPAIGN_CHANNELS.map(channel => <option key={channel} value={channel}>{channel[0].toUpperCase() + channel.slice(1)}</option>)}</select></div>
        <div className="grid gap-1.5"><Label htmlFor={`${prefix}-destination-choice`}>Choose destination</Label><select id={`${prefix}-destination-choice`} className="h-10 rounded-md border bg-transparent px-3 text-sm" value={!customDestination && (values.destination_path === '/' || products.data?.some(product => product.published && product.slug && `/product/${product.slug}` === values.destination_path)) ? values.destination_path : 'custom'} onChange={event => { setCustomDestination(event.target.value === 'custom'); if (event.target.value !== 'custom') field('destination_path', event.target.value); }}>
          <option value="/">Home</option>{products.data?.filter(product => product.published && product.slug).map(product => <option key={product.id} value={`/product/${product.slug}`}>{product.name}</option>)}<option value="custom">Custom path</option>
        </select>{products.isError && <p className="text-xs text-black/60">Published products could not be loaded. Enter a custom path below.</p>}
        <Label htmlFor={`${prefix}-destination_path`}>Destination path</Label><Input {...attrs('destination_path')} maxLength={200} value={values.destination_path} onChange={event => field('destination_path', event.target.value)} />{errorText('destination_path')}<p className="text-xs text-black/60">Use an existing product or landing page path. Missing UTM tags are added automatically.</p></div>
        <div className="grid gap-1.5"><Label htmlFor={`${prefix}-creator`}>Creator name (optional)</Label><Input id={`${prefix}-creator`} maxLength={120} value={values.creator_name || ''} onChange={event => field('creator_name', event.target.value)} /></div>
        <div className="grid gap-1.5"><Label htmlFor={`${prefix}-post`}>Post URL (optional)</Label><Input id={`${prefix}-post`} type="url" maxLength={2048} value={values.post_url || ''} onChange={event => field('post_url', event.target.value)} /></div>
        <div className="grid gap-1.5"><Label htmlFor={`${prefix}-notes`}>Notes (optional)</Label><Textarea id={`${prefix}-notes`} maxLength={2000} value={values.notes || ''} onChange={event => field('notes', event.target.value)} /></div>
        {save.isError && <p role="alert" className="text-sm text-red-700">{save.error.message}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={save.isPending} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : link ? 'Save changes' : 'Create link'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
