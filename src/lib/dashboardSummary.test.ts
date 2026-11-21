import { describe, expect, it } from 'vitest';
import { formatInviteTime } from './timezones';
import { dashboardSummary } from './dashboardSummary';
import type { GuestFeedback, MessageEvent, Order, ReviewRequest } from '../context/ReviewSailContext';
const now = new Date('2026-09-17T02:00:00Z'); // Still September 16 in New York.
const order: Order = { id: 'stay', locationId: 'a', customerId: 'guest', status: 'completed', checkoutDate: '2026-09-01' };
const request: ReviewRequest = { id: 'invite', orderId: 'stay', status: 'sent', origin: 'email', sentAt: '2026-09-01T14:00:00Z' };
const feedback: GuestFeedback = { id: 'feedback', locationId: 'a', requestId: 'invite', kind: 'complaint', starRating: 2, feedbackText: 'Help', guestName: null, guestEmail: null, managerResponse: null, isRead: false, createdAt: '2026-09-01T00:00:00Z' };
const event = (createdAt: string, requestId = 'invite'): MessageEvent => ({ id: createdAt, requestId, eventType: 'clicked', createdAt });
const base = { locationId: 'a', timezone: 'America/New_York', orders: [order], requests: [request], events: [], feedbacks: [], customers: [{ id: 'guest', firstName: 'Test', lastName: 'Guest', email: null }], enableEmail: true, enableSms: false, now };

describe('property dashboard metrics', () => {
  it('handles invalid legacy timezone values and malformed timestamps safely', () => {
    expect(dashboardSummary({ ...base, timezone: 'Invalid/Zone' }).sent).toBe(1);
    expect(formatInviteTime('not-a-date', 'Invalid/Zone')).toBe('—');
    expect(formatInviteTime('2026-09-01T14:00:00Z', 'Invalid/Zone')).toContain('Sep 1');
  });
  it('includes the whole first property day and excludes earlier or future sends', () => {
    const sent = ['2026-08-18T03:59:59Z', '2026-08-18T04:00:00Z', '2026-09-17T01:59:59Z', '2026-09-17T02:00:01Z'];
    expect(dashboardSummary({ ...base, requests: sent.map((sentAt, i) => ({ ...request, id: String(i), sentAt })) }).sent).toBe(2);
  });
  it('keeps sent invites after opt-out and feedback transitions, excluding QR rows', () => {
    expect(dashboardSummary({ ...base, requests: [{ ...request, status: 'opted_out' }, { ...request, id: 'qr', origin: 'qr' }] }).sent).toBe(1);
  });
  it('counts an invite only on its first recorded click', () => {
    expect(dashboardSummary({ ...base, events: [event('2026-09-01T10:00:00Z'), event('2026-09-02T10:00:00Z')] }).clicked).toBe(1);
    expect(dashboardSummary({ ...base, events: [event('2026-09-01T10:00:00Z'), event('2026-08-01T10:00:00Z')] }).clicked).toBe(0);
  });
  it('does not substitute undated clicked status for timestamped activity', () => {
    expect(dashboardSummary({ ...base, requests: [{ ...request, status: 'clicked', sentAt: undefined }] })).toMatchObject({ sent: 0, clicked: 0 });
  });
  it('scopes metrics and attention to the selected property, including QR feedback', () => {
    const result = dashboardSummary({ ...base, orders: [order, { ...order, id: 'other', locationId: 'b' }], requests: [request, { ...request, id: 'other', orderId: 'other' }], events: [event('2026-09-01T10:00:00Z', 'other')], feedbacks: [feedback, { ...feedback, id: 'qr', requestId: null, kind: 'rating', starRating: 5 }, { ...feedback, id: 'other', locationId: 'b' }] });
    expect(result).toMatchObject({ sent: 1, clicked: 0, feedback: 2, unread: 1 });
  });
  it('does not treat notes as read or read as resolved', () => {
    expect(dashboardSummary({ ...base, feedbacks: [{ ...feedback, managerResponse: 'Internal note' }, { ...feedback, id: 'read', isRead: true }] }).unread).toBe(1);
  });
  it('excludes cancelled stays from the queue and checks only enabled contact channels', () => {
    const result = dashboardSummary({ ...base, orders: [order, { ...order, id: 'cancelled', status: 'cancelled' }], requests: [{ ...request, status: 'pending' }, { ...request, id: 'cancelled', orderId: 'cancelled', status: 'pending' }], customers: [{ ...base.customers[0], phone: '+15555550123' }] });
    expect(result).toMatchObject({ queued: 1, missingContact: 1 });
    expect(dashboardSummary({ ...base, requests: [{ ...request, status: 'pending' }], enableSms: true, customers: [{ ...base.customers[0], phone: '+15555550123' }] }).missingContact).toBe(0);
  });
  it('caps recent activity at five and sorts without mutating requests', () => {
    const requests = Array.from({ length: 8 }, (_, i) => ({ ...request, id: String(i), sentAt: `2026-09-0${i + 1}T10:00:00Z` }));
    expect(dashboardSummary({ ...base, requests, events: [event('2026-09-16T10:00:00Z', '0')] }).latest.map(row => row.id)).toEqual(['0', '7', '6', '5', '4']);
    expect(requests[0].id).toBe('0');
  });
});
