import { describe, it, expect } from 'vitest';
import {
  detectMapping,
  autoDetectMapping,
  detectDateFormat,
  parseImportDate,
  mapRow,
  validateRow,
  dedupeKey,
  groupIssues,
  buildTemplateCsv,
  normalizeSource,
  isProxyEmail,
  toIsoDate,
  type ValidatedRow,
} from './csvImport';
import { detectPlatform } from './csvFingerprints';

describe('detectMapping', () => {
  it('matches exact aliases with high confidence', () => {
    const d = detectMapping(['First Name', 'Last Name', 'Email', 'Phone', 'Check-out Date', 'Check-in Date']);
    expect(d.firstName).toEqual({ header: 'First Name', confidence: 'matched' });
    expect(d.checkoutDate).toEqual({ header: 'Check-out Date', confidence: 'matched' });
    expect(d.checkinDate).toEqual({ header: 'Check-in Date', confidence: 'matched' });
  });

  it('matches the synonyms in the brief', () => {
    const d = detectMapping(['Departure Date', 'Arrival', 'Email Address', 'Mobile']);
    expect(d.checkoutDate.header).toBe('Departure Date');
    expect(d.checkinDate.header).toBe('Arrival');
    expect(d.email.header).toBe('Email Address');
    expect(d.phone.header).toBe('Mobile');
  });

  it('falls back to a fuzzy guess flagged for review', () => {
    const d = detectMapping(['Guest Email Address (primary)', 'Contact Number - mobile']);
    expect(d.email.header).toBe('Guest Email Address (primary)');
    expect(d.email.confidence).toBe('review');
    expect(d.phone.header).toBe('Contact Number - mobile');
  });

  it('reports fields with no plausible column as not found', () => {
    const d = detectMapping(['Reference', 'Total', 'Currency']);
    expect(d.checkoutDate).toEqual({ header: null, confidence: 'none' });
    expect(d.email).toEqual({ header: null, confidence: 'none' });
  });

  it('routes a single name column to Full name, not First name', () => {
    const d = detectMapping(['Guest name', 'Checkout']);
    expect(d.fullName.header).toBe('Guest name');
    expect(d.firstName.header).toBeNull();
  });

  it('gives a column to the field that matches it best, not the first to ask', () => {
    // "Guest Email Address" must not be claimed by a name field just because
    // names are listed earlier in IMPORT_FIELDS.
    const d = detectMapping(['Guest Email Address (primary)', 'Departure']);
    expect(d.email.header).toBe('Guest Email Address (primary)');
    expect(d.fullName.header).toBeNull();
  });

  it('never maps one column to two fields', () => {
    const d = detectMapping(['Name', 'Email', 'Checkout']);
    const used = Object.values(d).map(f => f.header).filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
  });

  it('gives an exact match priority over another field\'s fuzzy guess', () => {
    // "Last Name" contains "name", which firstName also lists as an alias.
    const d = detectMapping(['Last Name', 'First Name']);
    expect(d.lastName.header).toBe('Last Name');
    expect(d.firstName.header).toBe('First Name');
  });

  it('exposes a plain mapping through autoDetectMapping', () => {
    expect(autoDetectMapping(['First Name', 'Checkout'])).toEqual({
      firstName: 'First Name',
      checkoutDate: 'Checkout',
    });
  });
});

describe('detectPlatform', () => {
  it('recognises an Airbnb reservations export', () => {
    const result = detectPlatform([
      'Confirmation code', 'Status', 'Guest name', 'Contact', '# of adults',
      'Start date', 'End date', 'Listing', 'Earnings',
    ]);
    expect(result?.key).toBe('airbnb');
    expect(result?.source).toBe('airbnb');
    expect(result?.mapping.checkoutDate).toBe('End date');
    expect(result?.mapping.checkinDate).toBe('Start date');
  });

  it('recognises Airbnb even with no email column at all', () => {
    // The common real-world case: Airbnb hides guest addresses.
    const result = detectPlatform([
      'Confirmation code', 'Status', 'Guest name', 'Contact', 'Start date', 'End date', 'Listing',
    ]);
    expect(result?.key).toBe('airbnb');
    expect(result?.mapping.email).toBeUndefined();
    expect(result?.mapping.phone).toBe('Contact');
  });

  it('recognises a Booking.com extranet export', () => {
    const result = detectPlatform([
      'Book number', 'Booked by', 'Guest name', 'Check-in', 'Check-out',
      'Status', 'Room nights', 'Price', 'Commission',
    ]);
    expect(result?.key).toBe('booking_com');
    expect(result?.source).toBe('booking_com');
    expect(result?.mapping.checkoutDate).toBe('Check-out');
  });

  it('recognises the verified Hospitable snake_case export', () => {
    const result = detectPlatform([
      'uuid', 'checkin_date', 'checkout_date', 'platform', 'listing_name',
      'guest_first_name', 'guest_last_name', 'guest_email', 'guest_phone',
    ]);
    expect(result?.key).toBe('hospitable');
    expect(result?.mapping.firstName).toBe('guest_first_name');
    expect(result?.mapping.email).toBe('guest_email');
    expect(result?.mapping.source).toBe('platform');
  });

  it('does not claim a generic spreadsheet', () => {
    expect(detectPlatform(['Name', 'Email', 'Notes', 'Amount'])).toBeNull();
    expect(detectPlatform(['A', 'B', 'C'])).toBeNull();
  });

  it('refuses a match it cannot find a check-out date in', () => {
    // Signature-adjacent but useless: nothing to schedule an invite against.
    expect(detectPlatform(['Confirmation code', 'Status', 'Guest name', 'Listing'])).toBeNull();
  });
});

describe('detectDateFormat', () => {
  it('flags a column that reads both ways as ambiguous', () => {
    expect(detectDateFormat(['03/04/2026', '05/06/2026'])).toEqual({ format: 'DMY', ambiguous: true });
  });

  it('pins day-first when a component exceeds 12', () => {
    expect(detectDateFormat(['25/12/2026', '03/04/2026'])).toEqual({ format: 'DMY', ambiguous: false });
  });

  it('pins month-first when the second component exceeds 12', () => {
    expect(detectDateFormat(['12/25/2026', '04/03/2026'])).toEqual({ format: 'MDY', ambiguous: false });
  });

  it('recognises ISO without ambiguity', () => {
    expect(detectDateFormat(['2026-04-03', '2026-12-25'])).toEqual({ format: 'YMD', ambiguous: false });
  });

  it('flags a file that mixes conventions', () => {
    expect(detectDateFormat(['25/12/2026', '12/25/2026']).ambiguous).toBe(true);
  });
});

describe('parseImportDate', () => {
  it('reads the same string differently per convention', () => {
    expect(toIsoDate(parseImportDate('03/04/2026', 'DMY')!)).toBe('2026-04-03');
    expect(toIsoDate(parseImportDate('03/04/2026', 'MDY')!)).toBe('2026-03-04');
  });

  it('accepts ISO regardless of the selected convention', () => {
    expect(toIsoDate(parseImportDate('2026-04-03', 'MDY')!)).toBe('2026-04-03');
  });

  it('returns null for unreadable values', () => {
    expect(parseImportDate('not a date', 'DMY')).toBeNull();
    expect(parseImportDate('', 'DMY')).toBeNull();
  });
});

describe('validateRow', () => {
  const today = new Date('2026-08-01T00:00:00');
  const base = {
    lineNumber: 2,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: null,
    checkoutDate: '2026-07-30',
    checkinDate: null,
    source: null,
    raw: {},
  };

  it('accepts a healthy row', () => {
    expect(validateRow(base, today).status).toBe('ok');
  });

  it('rejects a row with no way to reach the guest', () => {
    const row = validateRow({ ...base, email: null, phone: null }, today);
    expect(row.status).toBe('error');
  });

  it('rejects a malformed email', () => {
    expect(validateRow({ ...base, email: 'ada@' }, today).status).toBe('error');
  });

  it('warns rather than fails on a booking-platform relay address', () => {
    const row = validateRow({ ...base, email: 'abc123@guest.airbnb.com' }, today);
    expect(row.status).toBe('warning');
    expect(row.issues.some(i => i.message.includes('Relay address'))).toBe(true);
  });

  it('rejects check-in after check-out', () => {
    const row = validateRow({ ...base, checkinDate: '2026-07-31' }, today);
    expect(row.status).toBe('error');
  });

  it('warns on a stay that checked out beyond the send window', () => {
    const row = validateRow({ ...base, checkoutDate: '2026-06-01' }, today);
    expect(row.status).toBe('warning');
  });

  it('treats an upcoming stay as healthy, with an explanatory note', () => {
    const row = validateRow({ ...base, checkoutDate: '2026-09-01' }, today);
    expect(row.status).toBe('ok');
    expect(row.issues.some(i => i.level === 'info')).toBe(true);
  });
});

describe('dedupeKey', () => {
  it('keys on contact and check-out date', () => {
    expect(dedupeKey({ email: 'A@Example.com ', phone: null, checkoutDate: '2026-07-30' }))
      .toBe('a@example.com|2026-07-30');
  });

  it('normalises phone punctuation', () => {
    expect(dedupeKey({ email: null, phone: '+44 7700 900123', checkoutDate: '2026-07-30' }))
      .toBe('447700900123|2026-07-30');
  });

  it('falls back to the name when a row has no contact at all', () => {
    // Airbnb exports routinely omit both; without this these rows have no
    // identity and re-importing the file duplicates every guest.
    const key = dedupeKey({
      firstName: 'Ada', lastName: 'Lovelace', email: null, phone: null, checkoutDate: '2026-07-30',
    });
    expect(key).toBe('name:ada lovelace|2026-07-30');
  });

  it('gives up when there is neither contact nor name', () => {
    expect(dedupeKey({ email: null, phone: null, checkoutDate: '2026-07-30' })).toBeNull();
  });

  it('gives up without a check-out date', () => {
    expect(dedupeKey({ email: 'a@b.com', phone: null, checkoutDate: null })).toBeNull();
  });
});

describe('groupIssues', () => {
  const row = (lineNumber: number, message: string, level: 'error' | 'warning' = 'error'): ValidatedRow => ({
    lineNumber,
    firstName: 'X', lastName: 'Y', email: null, phone: null,
    checkoutDate: null, checkinDate: null, source: null, raw: {},
    issues: [{ level, message }],
    status: level,
  });

  it('collapses the same issue with different interpolated values', () => {
    const groups = groupIssues([
      row(2, 'Invalid email address "bob@"'),
      row(3, 'Invalid email address "x"'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
    expect(groups[0].lineNumbers).toEqual([2, 3]);
  });

  it('collapses messages differing only by a number', () => {
    const groups = groupIssues([
      row(2, 'Checked out 20 days ago — will expire without being sent', 'warning'),
      row(3, 'Checked out 45 days ago — will expire without being sent', 'warning'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
  });

  it('keeps genuinely different issues apart, errors first', () => {
    const groups = groupIssues([
      row(2, 'Late checkout', 'warning'),
      row(3, 'Missing guest name'),
      row(4, 'Missing guest name'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].level).toBe('error');
    expect(groups[0].count).toBe(2);
    expect(groups[1].level).toBe('warning');
  });
});

describe('normalizeSource', () => {
  it('recognises the platforms by substring', () => {
    expect(normalizeSource('Airbnb')).toBe('airbnb');
    expect(normalizeSource('airbnb.com')).toBe('airbnb');
    expect(normalizeSource('Booking.com')).toBe('booking_com');
    expect(normalizeSource('Direct booking')).toBe('direct');
  });

  it('buckets anything unrecognised as other rather than dropping it', () => {
    expect(normalizeSource('Expedia')).toBe('other');
  });

  it('returns null for an empty value', () => {
    expect(normalizeSource('')).toBeNull();
    expect(normalizeSource(null)).toBeNull();
  });
});

describe('isProxyEmail', () => {
  it('detects platform relay addresses', () => {
    expect(isProxyEmail('abc@guest.airbnb.com')).toBe(true);
    expect(isProxyEmail('x@guest.booking.com')).toBe(true);
  });

  it('leaves real addresses alone', () => {
    expect(isProxyEmail('ada@example.com')).toBe(false);
    expect(isProxyEmail(null)).toBe(false);
    // Must not match on a substring of an unrelated domain.
    expect(isProxyEmail('a@notairbnb.com')).toBe(false);
  });
});

describe('mapRow', () => {
  it('applies the mapping and normalises the source column', () => {
    const row = mapRow(
      { 'Given name': 'Ada', 'Departure': '2026-07-30', 'Channel': 'Airbnb' },
      { firstName: 'Given name', checkoutDate: 'Departure', source: 'Channel' },
      'YMD',
      2,
    );
    expect(row.firstName).toBe('Ada');
    expect(row.checkoutDate).toBe('2026-07-30');
    expect(row.source).toBe('airbnb');
  });

  it('splits a combined name column', () => {
    const row = mapRow(
      { 'Guest name': 'Maria Fernandez', 'End date': '2026-07-30' },
      { fullName: 'Guest name', checkoutDate: 'End date' },
      'YMD',
      2,
    );
    expect(row.firstName).toBe('Maria');
    expect(row.lastName).toBe('Fernandez');
  });

  it('keeps every part of a multi-word surname together', () => {
    const row = mapRow(
      { N: 'Ana Maria Costa Silva' }, { fullName: 'N' }, 'YMD', 2,
    );
    expect(row.firstName).toBe('Ana');
    expect(row.lastName).toBe('Maria Costa Silva');
  });

  it('handles a mononym without inventing a surname', () => {
    const row = mapRow({ N: 'Madonna' }, { fullName: 'N' }, 'YMD', 2);
    expect(row.firstName).toBe('Madonna');
    expect(row.lastName).toBe('');
  });

  it('lets explicit columns win over the combined one', () => {
    const row = mapRow(
      { N: 'Maria Fernandez', F: 'Marie', L: 'Ferrand' },
      { fullName: 'N', firstName: 'F', lastName: 'L' },
      'YMD',
      2,
    );
    expect(row.firstName).toBe('Marie');
    expect(row.lastName).toBe('Ferrand');
  });

  it('leaves unmapped fields empty rather than guessing', () => {
    const row = mapRow({ 'A': '1' }, {}, 'DMY', 2);
    expect(row.email).toBeNull();
    expect(row.checkoutDate).toBeNull();
  });
});

describe('buildTemplateCsv', () => {
  const csv = buildTemplateCsv(new Date('2026-08-01T00:00:00'));
  // Papa.unparse emits CRLF, which is what the CSV spec calls for.
  const lines = csv.trim().split(/\r?\n/);

  it('has the documented header row', () => {
    expect(lines[0]).toBe(
      'First Name,Last Name,Email,Phone,Check-in Date,Check-out Date,Reservation Source',
    );
  });

  it('ships two example rows', () => {
    expect(lines).toHaveLength(3);
  });

  it('uses ISO dates so the import never hits the ambiguity prompt', () => {
    expect(detectDateFormat([lines[1].split(',')[5], lines[2].split(',')[5]]).ambiguous).toBe(false);
  });

  it('round-trips through the importer cleanly', () => {
    const headers = lines[0].split(',');
    const detection = detectMapping(headers);
    expect(detection.firstName.confidence).toBe('matched');
    expect(detection.checkoutDate.confidence).toBe('matched');
    expect(detection.email.confidence).toBe('matched');
  });
});
