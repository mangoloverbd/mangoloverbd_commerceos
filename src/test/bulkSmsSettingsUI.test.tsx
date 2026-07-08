import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Settings from '../pages/Settings';
import { BrowserRouter } from 'react-router-dom';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ settings: { bulksms_enabled: 'true' } })
  })
}));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: '123' }, session: {} })
}));
vi.mock('../hooks/useUserRole', () => ({
  useUserRole: () => ({ loading: false, isAdmin: true, role: 'admin' })
}));

describe('Bulk SMS Settings UI', () => {
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
});
