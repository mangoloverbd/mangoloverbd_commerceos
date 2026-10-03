import { describe, expect, it } from 'vitest';
import { normalizeCampaignSlug, slugFromName, campaignMoney, campaignRate, cleanCampaignSlugInput, previousCampaignRange } from '@/lib/campaignLinks';
import { normalizeCampaignSlug as backendSlug, slugFromName as backendSuggestion } from '../../server/campaignLinks.js';
describe('campaign frontend form helpers', () => {
  it.each(['Himsagar Reel', 'আম', '  Facebook / Launch  ', 'Crème Brûlée', 'a', 'x'.repeat(90)])('matches backend suggestions for %s', name => {
    expect(slugFromName(name)).toBe(backendSuggestion(name));
  });
  it.each(['ab', 'foo--bar', ' foo-bar ', 'Foo-Bar', 'আম', 'go/out', 'x'.repeat(61)])('matches backend slug normalization for %s', slug => {
    expect(normalizeCampaignSlug(slug)).toBe(backendSlug(slug));
  });
  it('keeps missing amounts and zero-denominator rates distinct from recorded zero', () => {
    expect(campaignMoney(null)).toBe('—'); expect(campaignMoney(undefined)).toBe('—');
    expect(campaignMoney(0)).toBe('৳0'); expect(campaignRate(null)).toBe('—'); expect(campaignRate(0)).toBe('0%');
  });
  it.each([
    ['https://www.mangolover.com.bd/go/bori-campaign-1', 'bori-campaign-1', true],
    ['www.mangolover.com.bd/go/Himsagar-Reel?utm_source=fb', 'himsagar-reel', true],
    ['  Katimon-Ad ', 'katimon-ad', false],
  ])('cleans pasted link input %s', (input, slug, fromUrl) => {
    expect(cleanCampaignSlugInput(input)).toEqual({ slug, fromUrl });
  });
  it('finds the previous period of the same length, across month ends', () => {
    expect(previousCampaignRange('2026-10-03', '2026-10-03')).toEqual({ from: '2026-10-02', to: '2026-10-02' });
    expect(previousCampaignRange('2026-10-01', '2026-10-07')).toEqual({ from: '2026-09-24', to: '2026-09-30' });
    expect(previousCampaignRange('2026-03-01', '2026-03-31')).toEqual({ from: '2026-01-29', to: '2026-02-28' });
  });
});
