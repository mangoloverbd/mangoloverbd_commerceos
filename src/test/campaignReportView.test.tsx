import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { campaignReportFixture } from './helpers/campaignFixtures';
const captured = vi.hoisted(() => ({ option: null as null | { series: Array<{ symbol: string; data: number[] }> } }));
vi.mock('@/components/business-report/EChart', () => ({ EChart: ({ option }: { option: typeof captured.option }) => { captured.option = option; return <div />; } }));
import { CampaignDailyChart, CampaignSummary } from '@/components/campaign-links/CampaignReportView';
afterEach(cleanup);
describe('campaign metric and chart presentation', () => {
  it('shows the visitor-day count, not only its explanation', () => {
    const report = campaignReportFixture(); render(<CampaignSummary metrics={report.totals} showFinancials={false} />);
    expect(screen.getByText('Estimated visitor-days')).toBeInTheDocument(); expect(screen.getByText('80')).toBeInTheDocument();
  });
  it('shows a visible point for a single click-day rather than an empty line chart', () => {
    render(<CampaignDailyChart daily={campaignReportFixture().daily} />);
    expect(captured.option?.series[0].symbol).toBe('circle'); expect(captured.option?.series[1].symbol).toBe('circle');
  });
});
