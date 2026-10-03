import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { campaignJson, campaignReportFixture } from './helpers/campaignFixtures';

const identity = vi.hoisted(() => ({ role: 'team_member', user: 'staff-1' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: identity.user }, loading: false }) }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ role: identity.role, isAdmin: identity.role === 'admin', loading: false }) }));
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/components/business-report/EChart', () => ({ EChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} /> }));
import { apiFetch } from '@/lib/api';
import CampaignLinks from '@/pages/CampaignLinks';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={['/campaign-links?from=2026-10-03&to=2026-10-03']}><CampaignLinks /></MemoryRouter></QueryClientProvider>;
  return { client, tree, ...render(tree()) };
}
describe('campaign list', () => {
  beforeEach(() => { identity.role = 'team_member'; identity.user = 'staff-1'; vi.mocked(apiFetch).mockReset(); });
  afterEach(cleanup);
  it('shows team-visible metrics and shared controls without financial UI', async () => {
    vi.mocked(apiFetch).mockImplementation(async () => campaignJson(campaignReportFixture()));
    setup();
    expect(await screen.findByRole('link', { name: 'Himsagar reel' })).toHaveAttribute('href', '/campaign-links/link-1?from=2026-10-03&to=2026-10-03');
    expect(screen.getByText('Captured checkouts')).toBeInTheDocument();
    expect(screen.getByText('Visible to admins')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New link' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Edit Himsagar reel' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /est\. profit/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/courier fees recorded/i)).not.toBeInTheDocument();
  });
  it('shows unknown admin money as a dash with its reason, not zero', async () => {
    identity.role = 'admin';
    const report = campaignReportFixture(true);
    report.totals.estimated_delivered_profit = null;
    report.totals.profit_incomplete_reasons = ['partial_delivery_quantities_unknown'];
    vi.mocked(apiFetch).mockImplementation(async () => campaignJson(report));
    setup();
    expect(await screen.findByRole('button', { name: /est\. profit/i })).toBeInTheDocument();
    expect(screen.getByText(/partial-delivery quantities are unknown/i)).toBeInTheDocument();
    expect(screen.queryByText('Visible to admins')).not.toBeInTheDocument();
  });
  it('compares totals with the previous period of the same length', async () => {
    vi.mocked(apiFetch).mockImplementation(async path => {
      const report = campaignReportFixture();
      if (String(path).includes('from=2026-10-02&to=2026-10-02')) report.totals.clicks = 50;
      return campaignJson(report);
    });
    setup();
    expect(await screen.findByText('+100%')).toBeInTheDocument();
  });
  it('copies the public campaign URL', async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockImplementation(async () => campaignJson(campaignReportFixture()));
    setup();
    await user.click(await screen.findByRole('button', { name: 'Copy Himsagar reel link' }));
    expect(await navigator.clipboard.readText()).toBe('https://www.mangolover.com.bd/go/himsagar-reel');
  });
  it('keeps a failed copy message visible with a recoverable detail link', async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockImplementation(async () => campaignJson(campaignReportFixture()));
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
    setup(); await user.click(await screen.findByRole('button', { name: 'Copy Himsagar reel link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not copy');
    expect(screen.getByRole('link', { name: 'Himsagar reel' })).toBeInTheDocument();
  });
  it('opens a link’s details in a side panel when its row is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockImplementation(async () => campaignJson(campaignReportFixture()));
    setup();
    await user.click(await screen.findByText('/go/himsagar-reel'));
    const panel = await screen.findByRole('dialog', { name: 'Himsagar reel' });
    expect(await within(panel).findByText('Orders from this link')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Open full page' })).toHaveAttribute('href', '/campaign-links/link-1?from=2026-10-03&to=2026-10-03');
    expect(within(panel).getByText('Admins only')).toBeInTheDocument();
  });
  it('filters links by search and status', async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockImplementation(async () => campaignJson(campaignReportFixture()));
    setup();
    await screen.findByRole('link', { name: 'Himsagar reel' });
    await user.type(screen.getByRole('searchbox', { name: 'Search links' }), 'katimon');
    expect(screen.getByText('No links match this search or filter.')).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Search links' }));
    await user.click(screen.getByRole('button', { name: 'Archived' }));
    expect(await screen.findByText('No links match this search or filter.')).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.some(([path]) => String(path).includes('include_archived=true'))).toBe(true));
  });
  it('distinguishes loading, failed requests with retry, and no links', async () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    const view = setup();
    expect(screen.getByRole('status')).toHaveTextContent('Loading campaign links');
    view.unmount();
    vi.mocked(apiFetch).mockImplementation(async () => campaignJson({ error: 'Report unavailable' }, 503));
    const failed = setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('Report unavailable');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    failed.unmount();
    const report = campaignReportFixture(); report.rows = [];
    vi.mocked(apiFetch).mockImplementation(async () => campaignJson(report));
    setup();
    expect(await screen.findByText('No campaign links yet')).toBeInTheDocument();
  });
  it('does not reuse admin financial values during a team transition and clears old cache', async () => {
    identity.role = 'admin';
    vi.mocked(apiFetch).mockImplementation(async () => campaignJson(campaignReportFixture(true)));
    const view = setup();
    await screen.findByRole('button', { name: /est\. profit/i });
    identity.role = 'team_member';
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    view.rerender(view.tree());
    expect(screen.queryByRole('button', { name: /est\. profit/i })).not.toBeInTheDocument();
    expect(screen.queryByText('৳2,500')).not.toBeInTheDocument();
    await waitFor(() => expect(view.client.getQueryCache().getAll().some(q => q.queryKey[0] === 'campaign-links' && q.queryKey[2] === 'admin')).toBe(false));
  });
});
