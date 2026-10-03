import { describe, expect, it } from 'vitest';
import { normalizeCampaignSlug, slugFromName, campaignMoney, campaignRate } from '@/lib/campaignLinks';
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
});
