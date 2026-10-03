import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { campaignJson, campaignReportFixture } from './helpers/campaignFixtures';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'staff-1' }, loading: false }) }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ role: 'team_member', loading: false }) }));
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/components/business-report/EChart', () => ({ EChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} /> }));
import { apiFetch } from '@/lib/api';
import CampaignLinkDetail from '@/pages/CampaignLinkDetail';
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/campaign-links/link-1?from=2026-10-03&to=2026-10-03']}><Routes><Route path="/campaign-links/:id" element={<CampaignLinkDetail />} /></Routes></MemoryRouter></QueryClientProvider>);
}
describe('campaign detail', () => {
  beforeEach(() => { vi.mocked(apiFetch).mockReset(); }); afterEach(cleanup);
  it('shows click-day chart, honest funnel and partial-delivery orders without financial UI', async () => {
    vi.mocked(apiFetch).mockResolvedValue(campaignJson(campaignReportFixture())); setup();
    expect(await screen.findByRole('heading', { name: 'Himsagar reel' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /clicks by dhaka click day/i })).toBeInTheDocument();
    expect(screen.getByText('Partial delivery')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '#1024' })).toHaveAttribute('href', '/orders/order-1');
    expect(screen.getByText('Admins only')).toBeInTheDocument();
    expect(screen.queryByText(/courier fees recorded/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /all campaign links/i })).toHaveAttribute('href', '/campaign-links?from=2026-10-03&to=2026-10-03');
    expect(screen.getByText(/outcomes may change/i)).toBeInTheDocument();
  });
  it('switches the daily chart between clicks, orders and revenue', async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(campaignJson(campaignReportFixture())); setup();
    await user.click(await screen.findByRole('button', { name: 'Orders' }));
    expect(screen.getByRole('img', { name: /orders from these clicks by dhaka click day/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revenue' }));
    expect(screen.getByRole('img', { name: /delivered revenue by dhaka click day/i })).toBeInTheDocument();
  });
  it('lets a team member archive and restore a shared link', async () => {
    const user = userEvent.setup(); const report = campaignReportFixture();
    vi.mocked(apiFetch).mockImplementation(async (_path, options) => {
      if (options?.method === 'PATCH') report.rows[0].archived_at = JSON.parse(String(options.body)).archived ? '2026-10-03T06:00:00Z' : null;
      return campaignJson(report);
    });
    setup(); await user.click(await screen.findByRole('button', { name: 'Archive link' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restore link' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Restore link' }));
    expect(await screen.findByRole('button', { name: 'Archive link' })).toBeEnabled();
  });
});
