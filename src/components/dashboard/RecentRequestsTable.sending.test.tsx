import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RecentRequestsTable } from './RecentRequestsTable';
import { ToastProvider } from '../ui/Toast';

const resend = vi.hoisted(() => vi.fn());
vi.mock('../../context/ReviewSailContext', () => ({
  useReviewSail: () => ({ messageEvents: [], triggerSingleResend: resend }),
  canResendRequest: () => true,
}));

beforeEach(() => { resend.mockReset(); });
const showTable = () => render(
  <ToastProvider>
    <RecentRequestsTable recentRequests={[{ id: 'request-a', orderId: 'stay-a', status: 'pending' }]}
      orders={[{ id: 'stay-a', customerId: 'guest-a', locationId: 'loc-a', status: 'completed', checkoutDate: '2026-09-01' }]}
      customers={[{ id: 'guest-a', firstName: 'Synthetic', lastName: 'Guest', email: 'guest@example.invalid' }]}
      totalLogs={0} />
  </ToastProvider>,
);

describe('resend notifications', () => {
  it('shows a useful error instead of silently failing', async () => {
    resend.mockResolvedValue({ success: false, error: 'Nothing was sent: this account needs an active plan.' });
    showTable();
    fireEvent.click(screen.getByTitle('Resend invite'));
    expect(await screen.findByRole('alert')).toHaveTextContent('active plan');
    expect(screen.getByTitle('Resend invite')).not.toBeDisabled();
  });
  it('shows provider acceptance without claiming delivery', async () => {
    resend.mockResolvedValue({ success: true, message: 'Accepted by the provider. Delivery is not yet confirmed.' });
    showTable();
    fireEvent.click(screen.getByTitle('Resend invite'));
    expect(await screen.findByRole('status')).toHaveTextContent('Delivery is not yet confirmed');
  });
  it('makes a partial-channel result visible', async () => {
    resend.mockResolvedValue({ success: true, partial: true, message: 'Email accepted. SMS: provider rejected.' });
    showTable();
    fireEvent.click(screen.getByTitle('Resend invite'));
    expect(await screen.findByRole('status')).toHaveTextContent('SMS: provider rejected');
  });
});
