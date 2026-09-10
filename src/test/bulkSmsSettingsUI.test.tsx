import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Settings from '../pages/Settings';
import { BrowserRouter } from 'react-router-dom';
import { apiFetch } from '../lib/api';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

const settingsResponse = {
  settings: {
    bulksms_enabled: 'true',
    bulksms_confirmation_enabled: 'true',
    bulksms_dispatch_enabled: 'true',
  },
};

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(settingsResponse),
  })
}));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: '123' }, session: {} })
}));
vi.mock('../hooks/useUserRole', () => ({
  useUserRole: () => ({ loading: false, isAdmin: true, role: 'admin' })
}));

describe('Bulk SMS Settings UI', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockClear();
  });

  it('renders Bulk SMS BD configuration section', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Settings />
        </BrowserRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText('Bulk SMS BD Integration')).toBeInTheDocument();
    expect(screen.getByLabelText(/Enable Bulk SMS BD/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/SMS API Key/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Sender ID/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Bulk SMS Settings/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Hello {customer_name}, your order {order_id} for ৳{price} has been confirmed. We will contact you before dispatch.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Your order {order_id} has been dispatched via {courier_name}. Tracking code: {tracking_code}. Thank you for shopping with us.')).toBeInTheDocument();
  });

  it('saves independent confirmation and dispatch toggle values', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Settings />
        </BrowserRouter>
      </QueryClientProvider>
    );

    const confirmationSwitch = await screen.findByRole('switch', { name: 'Enable Order Confirmation SMS' });
    const dispatchSwitch = screen.getByRole('switch', { name: 'Enable Order Dispatch SMS' });
    expect(confirmationSwitch).toBeChecked();
    expect(dispatchSwitch).toBeChecked();

    fireEvent.click(confirmationSwitch);
    fireEvent.click(screen.getByRole('button', { name: /Save Bulk SMS Settings/i }));

    await waitFor(() => {
      const saveCall = vi.mocked(apiFetch).mock.calls.find(([, options]) => options?.method === 'POST');
      expect(saveCall).toBeDefined();
      expect(JSON.parse(String(saveCall?.[1]?.body))).toMatchObject({
        settings: {
          bulksms_confirmation_enabled: 'false',
          bulksms_dispatch_enabled: 'true',
        },
      });
    });
  });
});
