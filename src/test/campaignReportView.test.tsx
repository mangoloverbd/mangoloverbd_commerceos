import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { campaignReportFixture } from './helpers/campaignFixtures';
const captured = vi.hoisted(() => ({ options: [] as Array<{ series?: Array<{ type: string; data: Array<{ value: number | null; itemStyle: { color: string } }> }> }> }));
vi.mock('@/components/business-report/EChart', () => ({ EChart: ({ option, ariaLabel }: { option: (typeof captured.options)[number]; ariaLabel: string }) => { captured.options.push(option); return <div role="img" aria-label={ariaLabel} />; } }));
import { CampaignTiles, CampaignTrendChart, OutcomeBar } from '@/components/campaign-links/CampaignReportView';
afterEach(() => { cleanup(); captured.options = []; });
describe('campaign metric and chart presentation', () => {
  it('locks the profit tile for team members instead of showing a value', () => {
    const report = campaignReportFixture();
    render(<CampaignTiles metrics={report.totals} daily={report.daily} showFinancials={false} showLockedProfit />);
    expect(screen.getByText('Visible to admins')).toBeInTheDocument();
    expect(screen.queryByText('৳2,500')).not.toBeInTheDocument();
  });
  it('shows a change only when the previous period has a value', () => {
    const report = campaignReportFixture();
    const previous = { ...report.totals, clicks: 0, orders: 20 };
    render(<CampaignTiles metrics={report.totals} previous={previous} daily={report.daily} showFinancials={false} showLockedProfit={false} />);
    expect(screen.getByText('−50%')).toBeInTheDocument();
    expect(screen.queryByText(/infinity/i)).not.toBeInTheDocument();
  });
  it('draws a visible bar for a single click-day and no best-day label', () => {
    render(<CampaignTrendChart daily={campaignReportFixture().daily} />);
    const series = captured.options.at(-1)?.series?.[0];
    expect(series?.type).toBe('bar'); expect(series?.data[0].value).toBe(100);
    expect((series as { markPoint?: unknown }).markPoint).toBeUndefined();
  });
  it('summarises outcomes as delivered share and lost orders', () => {
    render(<OutcomeBar metrics={campaignReportFixture().totals} legend />);
    expect(screen.getByText('50% delivered')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /5 delivered, 1 confirmed, 2 pending, 1 cancelled, 1 returned/ })).toBeInTheDocument();
  });
});
