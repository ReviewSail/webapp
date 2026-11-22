import { describe, expect, it } from 'vitest';
import { bookingStatusIssue, blockedBookingReferences, importStatusIssue } from './bookingStatus';
import { detectMapping, mapRow, validateRow } from './csvImport';
import { detectPlatform } from './csvFingerprints';

describe('booking status safety', () => {
  it.each(['Confirmed', ' OK ', 'accepted', 'booked', 'completed', 'Checked-in', 'checked_out'])(
    'accepts supported positive status %s', value => expect(bookingStatusIssue(value)).toBeNull());
  it.each(['Canceled', 'Cancelled', 'cancelled_by_guest', 'No-show', 'no_show', 'Pending', 'uncancelled', 'not confirmed', 'confirmed?', 'Stornierung', ''])(
    'does not treat %s as confirmed', value => expect(bookingStatusIssue(value)).not.toBeNull());
  it('distinguishes no column from a mapped blank status', () => {
    expect(bookingStatusIssue(null)).toBeNull(); expect(bookingStatusIssue(undefined)).toBeNull();
    const record = { Name: 'Test', Email: 'guest@example.invalid', Checkout: '2026-09-13', Status: '' };
    const mapping = { fullName: 'Name', email: 'Email', checkoutDate: 'Checkout' };
    expect(mapRow(record, mapping, 'YMD', 2).reservationStatus).toBeNull();
    const row = mapRow(record, { ...mapping, reservationStatus: 'Status' }, 'YMD', 2);
    expect(row.reservationStatus).toBe(''); expect(validateRow(row).status).toBe('error');
  });
  it('maps exact status headers without confusing payment status', () => {
    expect(detectMapping(['Booking status']).reservationStatus.header).toBe('Booking status');
    expect(detectMapping(['Payment status']).reservationStatus.header).toBeNull();
    expect(detectPlatform(['Book number', 'Guest name', 'Check-in', 'Check-out', 'Status'])?.mapping.reservationStatus).toBe('Status');
  });
  it('blocks contradictory references only within their source namespace', () => {
    const row = { source: 'booking_com', externalReference: 'B1', reservationStatus: 'Cancelled' };
    const blocked = blockedBookingReferences([row]);
    expect(importStatusIssue({ ...row, reservationStatus: 'Confirmed' }, blocked)).toMatch(/Conflicting/);
    expect(importStatusIssue({ ...row, source: 'airbnb', reservationStatus: 'Confirmed' }, blocked)).toBeNull();
  });
});
