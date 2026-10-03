import { CHART } from '@/components/business-report/chartTheme';

export const CAMPAIGN_ORIGIN = 'https://www.mangolover.com.bd';
export const CAMPAIGN_CHANNELS = ['facebook', 'instagram', 'tiktok', 'youtube', 'whatsapp', 'influencer', 'print', 'sms', 'other'] as const;
export type CampaignChannel = typeof CAMPAIGN_CHANNELS[number];
export type CampaignLink = {
  id: string; name: string; slug: string; channel: string; destination_path: string;
  creator_name?: string | null; post_url?: string | null; notes?: string | null;
  created_by?: string | null; created_at?: string; archived_at?: string | null;
};
export type CampaignMetrics = {
  clicks: number; estimated_visitor_days: number; captured_checkouts: number; orders: number;
  converted_clicks: number; pending: number; confirmed: number; delivered: number; cancelled: number; returned: number;
  order_value: number | null; delivered_revenue: number | null;
  click_to_order: number | null; order_to_delivered: number | null; loss_rate: number | null;
  revenue_complete?: boolean; revenue_incomplete_reasons?: string[]; order_value_incomplete_reasons?: string[];
  delivered_cogs?: number | null; courier_fees?: number | null; estimated_delivered_profit?: number | null;
  cogs_incomplete_reasons?: string[]; profit_incomplete_reasons?: string[];
  cogs_coverage?: { set: number; total: number; complete_orders: number; total_orders: number };
  courier_fee_coverage?: { recorded_orders: number; total_orders: number };
};
export type CampaignOrder = {
  id: string; order_number?: string | number; created_at: string; outcome: string;
  delivery_kind: string | null; order_value: number | null; delivered_revenue: number | null;
  amount_incomplete_reason?: string | null;
};
export type CampaignRow = CampaignLink & CampaignMetrics & { recent_orders?: CampaignOrder[]; has_more?: boolean };
export type CampaignReport = {
  rows: CampaignRow[]; totals: CampaignMetrics; link?: CampaignLink;
  unattributed: CampaignMetrics & { label: string; date_basis: string };
  daily: Array<CampaignMetrics & { day: string }>;
  meta: { range: { from: string; to: string }; date_basis: 'click'; as_of: string;
    attribution_window_days: number; provisional?: boolean; order_series_label?: string; profit_basis?: string };
};
export type CampaignInput = {
  name: string; slug: string; channel: string; destination_path: string;
  creator_name: string | null; post_url: string | null; notes: string | null;
};
export function normalizeCampaignSlug(value: string): string | undefined {
  const slug = value.trim().toLowerCase();
  return slug.length >= 3 && slug.length <= 60 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? slug : undefined;
}
export function slugFromName(name: string): string | undefined {
  return normalizeCampaignSlug(name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, ''));
}
export const campaignUrl = (slug: string) => `${CAMPAIGN_ORIGIN}/go/${slug}`;
// Staff often paste the whole public link; keep only the part after /go/.
export function cleanCampaignSlugInput(value: string): { slug: string; fromUrl: boolean } {
  const match = value.match(/\/go\/([^/?#\s]*)/i);
  return { slug: (match ? match[1] : value).trim().toLowerCase(), fromUrl: !!match };
}
export const CAMPAIGN_CHANNEL_LABELS: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', whatsapp: 'WhatsApp',
  influencer: 'Influencer', print: 'Print / QR', sms: 'SMS', other: 'Other',
};
export const campaignChannelLabel = (channel: string) => CAMPAIGN_CHANNEL_LABELS[channel] || channel;
// Channel colours reuse the Business Report categorical slots; the last slot is "other".
export const CAMPAIGN_CHANNEL_SLOTS = ['facebook', 'whatsapp', 'instagram', 'influencer'] as const;
export function channelColor(channel: string) {
  const slot = (CAMPAIGN_CHANNEL_SLOTS as readonly string[]).indexOf(channel);
  return CHART.categorical[slot === -1 ? CHART.categorical.length - 1 : slot];
}
export const hasFinancials = (metrics: CampaignMetrics | undefined) => !!metrics && Object.prototype.hasOwnProperty.call(metrics, 'estimated_delivered_profit');
// The equal-length period that ends the day before `from`, for "vs previous period" changes.
export function previousCampaignRange(from: string, to: string): { from: string; to: string } {
  const day = 86_400_000;
  const start = Date.parse(`${from}T00:00:00Z`); const end = Date.parse(`${to}T00:00:00Z`);
  const length = Math.max(0, Math.round((end - start) / day));
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(start - (length + 1) * day), to: iso(start - day) };
}
export const campaignMoney = (amount: number | null | undefined) => amount == null ? '—' : `৳${amount.toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
export const campaignRate = (rate: number | null) => rate == null ? '—' : `${(rate * 100).toLocaleString('en-BD', { maximumFractionDigits: 1 })}%`;
const REASONS: Record<string, string> = {
  partial_delivery_amount_unknown: 'Partial-delivery merchandise amount is unknown.',
  partial_delivery_quantities_unknown: 'Partial-delivery quantities are unknown.',
  order_price_missing: 'An order is missing its merchandise value.',
  missing_product_cost: 'Some products do not have a matched current cost.',
  missing_order_items: 'Some delivered orders have no usable item details.',
  invalid_order_item_quantity: 'Some order item quantities are invalid.',
  invalid_cost_amount: 'A product cost could not be calculated.',
};
export const campaignReason = (reason: string) => REASONS[reason] || 'Amount unavailable because source data is incomplete.';
export function dhakaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (key: string) => parts.find(p => p.type === key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
