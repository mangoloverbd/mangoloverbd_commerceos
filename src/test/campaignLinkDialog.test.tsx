import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { campaignJson, campaignReportFixture } from './helpers/campaignFixtures';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'staff-1' }, loading: false }) }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ role: 'team_member', loading: false }) }));
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
import { apiFetch } from '@/lib/api';
import { CampaignLinkDialog } from '@/components/campaign-links/CampaignLinkDialog';

function setup(link?: ReturnType<typeof campaignReportFixture>['rows'][number]) {
  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><CampaignLinkDialog open onOpenChange={onOpenChange} link={link} /></QueryClientProvider>);
  return { client, onOpenChange };
}
describe('campaign link form', () => {
  it('lets staff select custom destination mode before typing the path', async () => {
    vi.mocked(apiFetch).mockResolvedValue(campaignJson({ products: [] }));
    const user = userEvent.setup(); setup();
    await user.selectOptions(screen.getByLabelText('Opens'), 'custom');
    expect(screen.getByLabelText('Opens')).toHaveValue('custom');
    expect(screen.getByLabelText('Destination path')).toBeInTheDocument();
  });
  beforeEach(() => { vi.mocked(apiFetch).mockReset(); }); afterEach(cleanup);
  it('suggests an ASCII slug and previews the public URL', async () => {
    vi.mocked(apiFetch).mockResolvedValue(campaignJson({ products: [] }));
    const user = userEvent.setup(); setup();
    await user.type(screen.getByLabelText('Name'), 'Himsagar Reel');
    expect(screen.getByLabelText('Link')).toHaveValue('himsagar-reel');
    expect(screen.getByText('https://www.mangolover.com.bd/go/himsagar-reel')).toBeInTheDocument();
  });
  it('requires a manual slug for a Bangla-only name', async () => {
    vi.mocked(apiFetch).mockResolvedValue(campaignJson({ products: [] }));
    const user = userEvent.setup(); setup();
    await user.type(screen.getByLabelText('Name'), 'আম');
    await user.click(screen.getByRole('button', { name: 'Create link' }));
    expect(await screen.findByText(/use 3–60 lowercase letters/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Link')).toHaveAttribute('aria-invalid', 'true');
  });
  it('keeps only the link ending when staff paste a full campaign URL', async () => {
    vi.mocked(apiFetch).mockResolvedValue(campaignJson({ products: [] }));
    const user = userEvent.setup(); setup();
    await user.click(screen.getByLabelText('Link'));
    await user.paste('https://www.mangolover.com.bd/go/bori-campaign-1');
    expect(screen.getByLabelText('Link')).toHaveValue('bori-campaign-1');
    expect(screen.getByText(/kept only the part after \/go\//i)).toBeInTheDocument();
    expect(screen.getByText('https://www.mangolover.com.bd/go/bori-campaign-1')).toBeInTheDocument();
  });
  it('picks the channel with pressed buttons', async () => {
    vi.mocked(apiFetch).mockResolvedValue(campaignJson({ products: [] }));
    const user = userEvent.setup(); setup();
    expect(screen.getByRole('button', { name: 'Facebook' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Instagram' }));
    expect(screen.getByRole('button', { name: 'Instagram' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Facebook' })).toHaveAttribute('aria-pressed', 'false');
  });
  it('lets team members save another member’s link and invalidates both views', async () => {
    const user = userEvent.setup(); const link = campaignReportFixture().rows[0];
    let saved: unknown;
    vi.mocked(apiFetch).mockImplementation(async (path, options) => {
      if (String(path).includes('/api/products')) return campaignJson({ products: [] });
      saved = JSON.parse(String(options?.body)); return campaignJson({ ...link, name: 'Updated reel' });
    });
    const { client, onOpenChange } = setup(link);
    client.setQueryData(['campaign-links', 'staff-1', 'team_member', 'list'], {});
    client.setQueryData(['campaign-links', 'staff-1', 'team_member', 'detail', link.id], {});
    await user.clear(screen.getByLabelText('Name')); await user.type(screen.getByLabelText('Name'), 'Updated reel');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(saved).toMatchObject({ name: 'Updated reel' });
    expect(saved).not.toHaveProperty('created_by');
    expect(client.getQueryState(['campaign-links', 'staff-1', 'team_member', 'list'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['campaign-links', 'staff-1', 'team_member', 'detail', link.id])?.isInvalidated).toBe(true);
  });
  it('reports a slug lock conflict and refreshes stale metrics', async () => {
    vi.mocked(apiFetch).mockImplementation(async path => String(path).includes('/api/products') ? campaignJson({ products: [] }) : campaignJson({ error: 'Slug is locked after its first click' }, 409));
    const user = userEvent.setup(); setup(campaignReportFixture().rows[0]);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Slug is locked after its first click');
  });
});
