import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import { ToastProvider } from '../components/ui/Toast';
const fixture = vi.hoisted(() => ({ state: {} as any, role: 'admin' }));
vi.mock('../context/ReviewSailContext', () => ({ useReviewSail: () => fixture.state }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ role: fixture.role }) }));
vi.mock('../components/dashboard/RecentRequestsTable', () => ({ RecentRequestsTable: () => <div>Recent invites fixture</div> }));
const show = () => render(<MemoryRouter><ToastProvider><Dashboard /></ToastProvider></MemoryRouter>);
beforeEach(() => {
  fixture.role = 'admin'; localStorage.clear();
  fixture.state = { activeLocationId: 'a', locations: [{ id: 'a', name: 'Main Location', timezone: 'UTC', googlePlaceUrl: '', onboardingComplete: false, preferredSendHour: 10, enableEmail: true, enableSms: false }], reviewRequests: [], orders: [], customers: [], feedbacks: [], messageEvents: [], subscriptionStatus: 'inactive', loading: false, dashboardLoading: false, dashboardError: false };
});
describe('overview account states', () => {
  it('refreshes the reporting window across midnight without a reload', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T23:59:30Z'));
    fixture.state.locations[0].onboardingComplete = true;
    fixture.state.orders = [{ id: 'stay', locationId: 'a', customerId: 'guest', status: 'completed' }];
    fixture.state.reviewRequests = [{ id: 'invite', orderId: 'stay', status: 'sent', sentAt: '2026-08-19T12:00:00Z' }];
    const view = show();
    try {
      expect(screen.getByText('Invites sent').nextElementSibling).toHaveTextContent('1');
      act(() => { vi.advanceTimersByTime(60_000); });
      expect(screen.getByText('Invites sent').nextElementSibling).toHaveTextContent('0');
    } finally { view.unmount(); vi.useRealTimers(); }
  });
  it('focuses first use on setup without empty reporting or checkout prompts', () => {
    show(); expect(screen.getByRole('heading', { name: 'Welcome to ReviewSail' })).toBeVisible();
    expect(screen.getByLabelText('Property name')).toBeVisible();
    expect(screen.queryByText('Guest engagement')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set up Premium Pro' })).not.toBeInTheDocument();
  });
  it('shows one first-guest action once setup is complete', () => {
    fixture.state.locations[0].onboardingComplete = true;
    fixture.state.locations[0].googlePlaceUrl = 'https://g.page/r/example/review'; show();
    expect(screen.getByRole('button', { name: 'Add your first guests' })).toBeVisible();
    expect(screen.queryByText('Guest engagement')).not.toBeInTheDocument();
  });
  it('keeps unread guest feedback visible during unfinished setup', () => {
    fixture.state.feedbacks = [{ id: 'f', locationId: 'a', kind: 'recovery', isRead: false, createdAt: new Date().toISOString() }]; show();
    expect(screen.getByText('1 unread guest message')).toBeVisible();
    expect(screen.getByLabelText('Property name')).toBeVisible();
  });
  it('does not turn unloaded feedback into a reassuring zero', () => {
    fixture.state.dashboardLoading = true; show();
    expect(screen.getByRole('status')).toHaveTextContent('Loading your overview');
    expect(screen.queryByText('No unread guest messages')).not.toBeInTheDocument();
  });
  it('offers retry when a required query fails', () => {
    fixture.state.dashboardError = true; show();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(screen.queryByLabelText('Property name')).not.toBeInTheDocument();
  });
  it('keeps admin billing actions out of staff views', () => {
    fixture.role = 'staff'; fixture.state.locations[0].onboardingComplete = true; show();
    expect(screen.queryByRole('button', { name: 'Set up Premium Pro' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Update review link' })).not.toBeInTheDocument();
    expect(screen.getByText('Ask your administrator')).toBeVisible();
  });
});
