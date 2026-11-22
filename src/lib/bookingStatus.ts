// Explicit import vocabulary, not a claim about every OTA's export format.
// Keep the positive allow-list in sync with import_guest_batch SQL.
const ALLOWED = new Set(['confirmed', 'ok', 'booked', 'accepted', 'completed', 'checkedin', 'checkedout']);
const INELIGIBLE = new Set(['canceled', 'cancelled', 'cancelledbyguest', 'canceledbyguest',
  'cancelledbyhotel', 'canceledbyhotel', 'noshow']);

export function bookingStatusIssue(raw: string | null | undefined): string | null {
  // No column: owner must verify eligibility manually. A mapped but blank cell
  // is different: it is not evidence of a confirmed booking.
  if (raw == null) return null;
  const value = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (ALLOWED.has(value)) return null;
  return INELIGIBLE.has(value)
    ? 'Canceled booking or no-show — not eligible for a new invitation. Previously imported stays are not canceled by this upload.'
    : 'Unrecognized or blank booking status — verify the reservation before importing; do not assume it is confirmed.';
}

type StatusRow = { source?: string | null; externalReference?: string | null; reservationStatus?: string | null };
export function bookingReferenceKey(row: StatusRow): string | null {
  return row.externalReference?.trim()
    ? JSON.stringify([row.source || 'direct', row.externalReference.trim()]) : null;
}

export function blockedBookingReferences(rows: StatusRow[]): Set<string> {
  return new Set(rows.filter(row => bookingStatusIssue(row.reservationStatus))
    .map(bookingReferenceKey).filter((key): key is string => key !== null));
}

export function importStatusIssue(row: StatusRow, blocked: Set<string>): string | null {
  const ownIssue = bookingStatusIssue(row.reservationStatus);
  if (ownIssue) return ownIssue;
  const key = bookingReferenceKey(row);
  return key && blocked.has(key)
    ? 'Conflicting booking statuses for this reference in the file — review all matching rows before importing.'
    : null;
}
