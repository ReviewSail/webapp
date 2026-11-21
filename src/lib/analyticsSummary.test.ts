import { describe, expect, it } from 'vitest';
import { analyticsSummary, type AnalyticsRange } from './analyticsSummary';
import type { GuestFeedback, Order, ReviewRequest } from '../context/ReviewSailContext';

const now = new Date('2026-09-18T12:00:00Z');
const stay = (patch: Partial<Order> = {}): Order => ({ id: 'stay', customerId: 'guest', locationId: 'home', checkoutDate: '2026-09-17', status: 'completed', ...patch });
const request = (patch: Partial<ReviewRequest> = {}): ReviewRequest => ({ id: 'request', orderId: 'stay', status: 'sent', sentAt: '2026-09-18T10:00:00Z', origin: 'email', ...patch });
const feedback = (patch: Partial<GuestFeedback> = {}): GuestFeedback => ({
  id: 'feedback', requestId: 'request', locationId: 'home', kind: 'rating', starRating: 5,
  createdAt: '2026-09-18T11:00:00Z', feedbackText: null, guestName: null,
  guestEmail: null, managerResponse: null, isRead: false, ...patch,
});
const run = (patch: Partial<Parameters<typeof analyticsSummary>[0]> = {}) => analyticsSummary({
  locationId: 'home', timezone: 'UTC', orders: [stay()], requests: [request()], feedbacks: [feedback()], range: '30d', now, ...patch,
});

describe('Analytics reporting over loaded records', () => {
  it.each<AnalyticsRange>(['30d','90d','all'])('never counts unsent or QR requests in %s', range => {
    const result = run({ range, requests: [request(), request({ id: 'pending', status: 'pending', sentAt: undefined }), request({ id: 'qr', origin: 'qr' })] });
    expect(result.sent.map(row => row.id)).toEqual(['request']);
    expect(result.chartData.reduce((sum, row) => sum + row.requested, 0)).toBe(1);
  });
  it.each<ReviewRequest['status']>(['private_feedback','already_reviewed','expired','opted_out'])('retains a historical send after status becomes %s', status => {
    expect(run({ requests: [request({ status })] }).sent).toHaveLength(1);
  });
  it('excludes follow-up messages from rated counts and the average, not the activity feed', () => {
    const result = run({ feedbacks: [feedback(), feedback({ id: 'low', kind: 'complaint', starRating: 1 }), feedback({ id: 'follow', kind: 'recovery', starRating: null })] });
    expect(result.rated).toHaveLength(2); expect(result.received).toHaveLength(3);
    expect(result.averageRating).toBe(3); expect(result.lowRatings).toBe(1);
    expect(result.chartData.reduce((sum, row) => sum + row.completed, 0)).toBe(2);
  });
  it('applies the same range to ratings, low ratings and chart', () => {
    const feedbacks = [feedback(), feedback({ id: 'old', createdAt: '2026-07-01T12:00:00Z', starRating: 1, kind: 'complaint' })];
    expect(run({ feedbacks }).averageRating).toBe(5);
    expect(run({ feedbacks }).lowRatings).toBe(0);
    const ninety = run({ feedbacks, range: '90d' });
    expect(ninety.averageRating).toBe(3); expect(ninety.lowRatings).toBe(1);
    expect(ninety.chartData).toHaveLength(90);
  });
  it('does not use request send date/status to date guest feedback', () => {
    const result = run({ requests: [request({ sentAt: '2026-07-01T12:00:00Z' })], feedbacks: [feedback({ kind: 'rating', starRating: 2 })] });
    expect(result.sent).toHaveLength(0); expect(result.lowRatings).toBe(1);
  });
  it('rejects invalid/future/missing timestamps even for all time', () => {
    const result = run({ range: 'all', requests: [request({ sentAt: 'invalid' }), request({ sentAt: undefined }), request({ sentAt: '2027-01-01T12:00:00Z' })],
      feedbacks: [feedback({ createdAt: 'invalid' }), feedback({ createdAt: '' }), feedback({ createdAt: '2027-01-01T12:00:00Z' })] });
    expect(result.sent).toHaveLength(0); expect(result.rated).toHaveLength(0);
    expect(result.averageRating).toBeNull(); expect(result.chartData).toEqual([]);
  });
  it('uses adjacent non-overlapping 30 calendar-day periods', () => {
    const result = run({ requests: [
      request({ id: 'current', sentAt: '2026-08-20T00:00:00Z' }),
      request({ id: 'previous-end', sentAt: '2026-08-19T23:59:59Z' }),
      request({ id: 'previous-start', sentAt: '2026-07-21T00:00:00Z' }),
      request({ id: 'outside', sentAt: '2026-07-20T23:59:59Z' }),
    ] });
    expect(result.sent.map(row => row.id)).toEqual(['current']);
    expect(result.sentTrend).toBe(-50); expect(result.chartData).toHaveLength(30);
    expect(result.chartData[0].requested).toBe(1);
  });
  it.each([
    ['2026-03-30T12:00:00Z','2026-03-01T04:59:59Z','2026-03-01T05:00:00Z'],
    ['2026-11-30T12:00:00Z','2026-11-01T03:59:59Z','2026-11-01T04:00:00Z'],
  ])('handles the DST reporting boundary at %s', (at, outside, inside) => {
    const result = run({ now: new Date(at), timezone: 'America/New_York', requests: [request({ id: 'outside', sentAt: outside }), request({ id: 'inside', sentAt: inside })], feedbacks: [] });
    expect(result.sent.map(row => row.id)).toEqual(['inside']); expect(result.chartData[0].requested).toBe(1);
  });
  it('uses the property date rather than UTC or the viewer date', () => {
    const result = run({ now: new Date('2026-09-18T00:30:00Z'), timezone: 'America/Los_Angeles', requests: [request({ sentAt: '2026-08-19T07:00:00Z' })], feedbacks: [] });
    expect(result.sent).toHaveLength(1); expect(result.chartData[0].label).toBe('Aug 19');
  });
  it('excludes other properties and marked test stays but retains unlinked QR feedback', () => {
    const result = run({ orders: [stay(), stay({ id: 'test', source: 'reviewsail_test' }), stay({ id: 'foreign', locationId: 'other' })],
      requests: [request(), request({ id: 'test', orderId: 'test' }), request({ id: 'foreign', orderId: 'foreign' })],
      feedbacks: [feedback(), feedback({ id: 'test', requestId: 'test' }), feedback({ id: 'foreign', locationId: 'other' }), feedback({ id: 'qr', requestId: null })] });
    expect(result.sent).toHaveLength(1); expect(result.rated.map(row => row.id)).toEqual(['feedback','qr']);
  });
  it('shows a QR-only property with no invitations', () => {
    const result = run({ orders: [], requests: [], feedbacks: [feedback({ requestId: null })] });
    expect(result.hasData).toBe(true); expect(result.sent).toHaveLength(0); expect(result.rated).toHaveLength(1);
  });
  it('uses Monday weekly buckets for all time and no invented previous-period trend', () => {
    const result = run({ range: 'all', feedbacks: [feedback({ createdAt: '2026-09-13T12:00:00Z' }), feedback({ id: 'monday', createdAt: '2026-09-14T00:00:00Z' })] });
    expect(result.chartData.map(row => row.label)).toEqual(['Sep 7, 2026','Sep 14, 2026']);
    expect(result.ratedTrend).toBeNull(); expect(result.sentTrend).toBeNull();
  });
  it('falls back for malformed timezone and ignores non-ratings', () => {
    const result = run({ timezone: 'Not/AZone', feedbacks: [feedback({ starRating: 0 }), feedback({ starRating: 6 }), feedback({ starRating: 2.5 }), feedback({ kind: 'recovery', starRating: 5 })] });
    expect(result.timezone).toBe('UTC'); expect(result.averageRating).toBeNull(); expect(result.lowRatings).toBe(0);
  });
});
