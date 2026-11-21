import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Analytics from './Analytics';
const fixture = vi.hoisted(() => ({ state: {} as any }));
vi.mock('../context/ReviewSailContext', () => ({ useReviewSail: () => fixture.state }));
// Assert the exact series supplied to the chart, without depending on jsdom layout.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  LineChart: ({ data }: any) => <output data-testid="chart">{JSON.stringify(data)}</output>,
  Line: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null,
  Tooltip: () => null, Legend: () => null,
}));
const show = () => render(<MemoryRouter><Analytics /></MemoryRouter>);
const metric = (label: string) => screen.getByText(label, { exact: true }).nextElementSibling;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-18T12:00:00Z'));
  fixture.state = {
    activeLocationId: 'home', locations: [{ id: 'home', timezone: 'UTC' }],
    orders: [{ id: 'stay', locationId: 'home', customerId: 'guest', status: 'completed' }],
    reviewRequests: [{ id: 'request', orderId: 'stay', status: 'pending' }],
    customers: [{ id: 'guest', firstName: 'Test', lastName: 'Guest' }],
    feedbacks: [
      { id: 'current', locationId: 'home', requestId: null, kind: 'rating', starRating: 5, guestName: 'QR Guest', createdAt: '2026-09-18T10:00:00Z' },
      { id: 'old', locationId: 'home', requestId: null, kind: 'complaint', starRating: 1, guestName: 'Older Guest', createdAt: '2026-07-01T12:00:00Z' },
      { id: 'follow', locationId: 'home', requestId: null, kind: 'recovery', starRating: null, guestName: 'Follow Up Guest', createdAt: '2026-09-18T11:00:00Z' },
    ], loading: false, dashboardLoading: false, dashboardError: false, refreshData: vi.fn().mockResolvedValue(undefined),
  };
});
afterEach(() => vi.useRealTimers());
describe('Analytics truthful reporting', () => {
  it('changes counts, average, activity and chart together with the date selector', () => {
    show();
    expect(metric('Invites sent')).toHaveTextContent('0');
    expect(metric('Rated responses')).toHaveTextContent('1');
    expect(metric('Average Rating')).toHaveTextContent('5.0');
    expect(screen.queryByText('Older Guest')).not.toBeInTheDocument();
    expect(screen.getByText('Follow-up message received')).toBeVisible();
    expect(screen.queryByText('Review completed')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Last 90 days' }));
    expect(metric('Rated responses')).toHaveTextContent('2');
    expect(metric('Average Rating')).toHaveTextContent('3.0');
    expect(metric('Low ratings (1–3)')).toHaveTextContent('1');
    expect(screen.getByText('Older Guest')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Last 90 days' })).toHaveAttribute('aria-pressed','true');
    const chart = JSON.parse(screen.getByTestId('chart').textContent!);
    expect(chart.reduce((sum: number, row: any) => sum + row.completed, 0)).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
    expect(metric('Invites sent')).toHaveTextContent('0');
    expect(screen.getByText(/not confirmed Google reviews/)).toBeVisible();
    expect(screen.getByText(/Large histories may be incomplete/)).toBeVisible();
  });
  it('shows QR-only feedback instead of hiding it behind the empty state', () => {
    fixture.state.orders = []; fixture.state.reviewRequests = []; show();
    expect(screen.getByText('QR Guest')).toBeVisible();
    expect(screen.queryByText('No analytics data yet')).not.toBeInTheDocument();
  });
  it('keeps a follow-up-only property visible without inventing a zero-star rating', () => {
    fixture.state.reviewRequests = []; fixture.state.feedbacks = [fixture.state.feedbacks[2]]; show();
    expect(metric('Rated responses')).toHaveTextContent('0');
    expect(metric('Average Rating')).toHaveTextContent('—');
    expect(screen.getByText('Follow-up message received')).toBeVisible();
  });
  it('recalculates when the active property changes', () => {
    const view = show(); fixture.state.activeLocationId = 'other';
    view.rerender(<MemoryRouter><Analytics /></MemoryRouter>);
    expect(screen.getByText('No analytics data yet')).toBeVisible();
    expect(screen.queryByText('QR Guest')).not.toBeInTheDocument();
  });
  it('rolls the window forward while the page stays open, without fetching', () => {
    vi.setSystemTime(new Date('2026-09-18T23:59:30Z'));
    fixture.state.feedbacks = [{ ...fixture.state.feedbacks[0], createdAt: '2026-08-20T12:00:00Z' }];
    const view = show(); expect(metric('Rated responses')).toHaveTextContent('1');
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(metric('Rated responses')).toHaveTextContent('0');
    expect(fixture.state.refreshData).not.toHaveBeenCalled();
    view.unmount(); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not render misleading zero metrics while loading', () => {
    fixture.state.dashboardLoading = true; show();
    expect(screen.getByRole('status')).toHaveTextContent('Loading analytics');
    expect(screen.queryByText('Invites sent')).not.toBeInTheDocument();
  });
  it('offers retry instead of showing partial totals as successful', () => {
    fixture.state.dashboardError = true; show();
    expect(screen.getByRole('alert')).toHaveTextContent('Totals are unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(fixture.state.refreshData).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Invites sent')).not.toBeInTheDocument();
  });
});
