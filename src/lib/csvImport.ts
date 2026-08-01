import Papa from 'papaparse';
import { parse as parseDateFns, isValid, format as formatDate } from 'date-fns';

/**
 * Pure CSV import logic — no React, no Supabase. The wizard renders these
 * results; the context persists them.
 */

export type ImportFieldKey =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'checkoutDate'
  | 'checkinDate'
  | 'source';

export type ColumnMapping = Partial<Record<ImportFieldKey, string>>;

export const IMPORT_FIELDS: Array<{
  key: ImportFieldKey;
  label: string;
  required: boolean;
  hint?: string;
}> = [
  { key: 'firstName', label: 'First name', required: false, hint: 'Or map a single full-name column' },
  { key: 'lastName', label: 'Last name', required: false },
  // Airbnb and Booking.com both export one "Guest name" column rather than a
  // split pair, so requiring first *and* last would lock those files out.
  { key: 'fullName', label: 'Full name', required: false, hint: 'Use if your file has one name column' },
  { key: 'email', label: 'Email', required: false, hint: 'Email or phone required' },
  { key: 'phone', label: 'Phone', required: false, hint: 'Email or phone required' },
  { key: 'checkoutDate', label: 'Check-out date', required: true },
  { key: 'checkinDate', label: 'Check-in date', required: false, hint: 'Enables mid-stay check-ins' },
  { key: 'source', label: 'Reservation source', required: false, hint: 'Falls back to the choice below' },
];

// --- Reservation source ---------------------------------------------------

/**
 * Where a booking came from. Stored on the stay (orders.source), not the
 * person: the same guest can arrive via Airbnb once and direct the next time.
 */
export const RESERVATION_SOURCES = [
  { value: 'direct', label: 'Direct / Hotel' },
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'booking_com', label: 'Booking.com' },
  { value: 'other', label: 'Other' },
] as const;

export type ReservationSource = (typeof RESERVATION_SOURCES)[number]['value'];

/**
 * Maps whatever a CSV says into one of our four buckets. Anything we don't
 * recognise becomes 'other' rather than being dropped — knowing a stay came
 * from *somewhere else* is more useful than knowing nothing.
 */
export const normalizeSource = (raw: string | null | undefined): ReservationSource | null => {
  const value = (raw || '').trim().toLowerCase();
  if (!value) return null;
  if (value.includes('airbnb')) return 'airbnb';
  // Checked before Booking.com on purpose: "Direct booking" is a common way to
  // write this, and matching on "booking" first would file it under the OTA.
  if (['direct', 'hotel', 'website', 'walkin', 'walk-in', 'walk in', 'phone'].some(v => value.includes(v))) {
    return 'direct';
  }
  if (value.includes('booking')) return 'booking_com';
  return 'other';
};

/** Normalizes a header for matching: "Guest First Name" -> "guestfirstname". */
export const cleanKey = (key: string) => key.toLowerCase().trim().replace(/[_\-\s]+/g, '');

/**
 * Header candidates per field, ordered by priority. Carried over from the
 * previous inline importer and extended with the OTA exports we document in
 * the CSV Format Guide, plus the snake_case shape used by PMS tools like
 * Hospitable that sit in front of Airbnb and Booking.com.
 */
const HEADER_CANDIDATES: Record<ImportFieldKey, string[]> = {
  firstName: ['firstname', 'first', 'guestfirstname', 'givenname', 'forename'],
  lastName: ['lastname', 'last', 'guestlastname', 'surname', 'familyname'],
  // A bare "Name" or "Guest name" is far more often one combined column than a
  // first name, so it belongs here rather than under firstName.
  fullName: ['fullname', 'guestname', 'name', 'customername', 'bookedby'],
  email: ['email', 'emailaddress', 'guestemail', 'contactemail'],
  phone: [
    'phone', 'phonenumber', 'mobile', 'mobilenumber', 'telephone', 'tel',
    'guestphone', 'contactphone', 'contactnumber', 'mobilephone', 'cell',
  ],
  checkoutDate: [
    'checkoutdate', 'checkout', 'departuredate', 'departure', 'enddate', 'todate',
    'checkoutday', 'dateout',
  ],
  checkinDate: [
    'checkindate', 'checkin', 'arrivaldate', 'arrival', 'startdate', 'fromdate',
    'checkinday', 'datein',
  ],
  source: [
    'source', 'platform', 'channel', 'bookingsource', 'reservationsource',
    'bookingchannel', 'origin', 'referrer',
  ],
};

/**
 * How a mapping was arrived at, so the wizard can tell the user how much to
 * trust it. An exact alias hit is safe to leave alone; a fuzzy hit is a guess
 * worth a glance; nothing found needs a decision.
 */
export type MatchConfidence = 'matched' | 'review' | 'none';

export type FieldMatch = { header: string | null; confidence: MatchConfidence };
export type MappingDetection = Record<ImportFieldKey, FieldMatch>;

/** Splits a normalized header into word-ish tokens for overlap scoring. */
const tokenize = (header: string): string[] =>
  header
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * Scores how well a header matches one of a field's aliases, on 0..1.
 *
 * Exact (post-normalization) equality is handled by the caller. This covers the
 * messier real-world cases: "Guest Email Address" containing "email", or
 * "Departure (local)" sharing a token with "departure". Substring containment
 * outranks token overlap because it is the stronger signal.
 */
const fuzzyScore = (header: string, candidates: string[]): number => {
  const clean = cleanKey(header);
  const tokens = new Set(tokenize(header));
  let best = 0;

  for (const candidate of candidates) {
    if (clean.includes(candidate) || candidate.includes(clean)) {
      // Longer shared text is stronger evidence: "email" inside "guestemail"
      // beats "name" inside "lastname" mapping to firstName.
      const ratio = Math.min(clean.length, candidate.length) / Math.max(clean.length, candidate.length);
      best = Math.max(best, 0.6 + 0.3 * ratio);
      continue;
    }

    const candidateTokens = tokenize(candidate);
    if (candidateTokens.length === 0) continue;
    const shared = candidateTokens.filter(t => tokens.has(t)).length;
    if (shared > 0) best = Math.max(best, 0.4 * (shared / candidateTokens.length));
  }

  return best;
};

/** A fuzzy guess below this is noise and is better reported as "not found". */
const FUZZY_THRESHOLD = 0.4;

/**
 * Best-effort mapping of CSV headers to import fields, with a confidence per
 * field. Every result is a suggestion the user can override in the wizard —
 * this is a starting point, not a decision.
 *
 * Two passes on purpose: every field gets first refusal on an exact alias hit
 * before any field is allowed to claim a column on a fuzzy guess. Otherwise a
 * field early in IMPORT_FIELDS could fuzzily grab the column that a later field
 * matches exactly.
 */
export const detectMapping = (headers: string[]): MappingDetection => {
  const byCleanKey = new Map<string, string>();
  for (const header of headers) {
    const key = cleanKey(header);
    // First header wins so a later near-duplicate can't steal the mapping.
    if (!byCleanKey.has(key)) byCleanKey.set(key, header);
  }

  const detection = {} as MappingDetection;
  for (const { key } of IMPORT_FIELDS) detection[key] = { header: null, confidence: 'none' };

  const claimed = new Set<string>();

  // Pass 1 — exact alias hits.
  for (const { key } of IMPORT_FIELDS) {
    for (const candidate of HEADER_CANDIDATES[key]) {
      const header = byCleanKey.get(candidate);
      if (header && !claimed.has(header)) {
        detection[key] = { header, confidence: 'matched' };
        claimed.add(header);
        break;
      }
    }
  }

  // Pass 2 — fuzzy, over whatever columns are still unclaimed.
  //
  // Scored globally and assigned best-first rather than field by field. Going
  // in field order would let whichever field comes first in IMPORT_FIELDS grab
  // a column that another field matches far better — "Guest Email Address"
  // going to a name field simply because names are listed first.
  const candidates: Array<{ key: ImportFieldKey; header: string; score: number }> = [];
  for (const { key } of IMPORT_FIELDS) {
    if (detection[key].header) continue;
    for (const header of headers) {
      if (claimed.has(header)) continue;
      const score = fuzzyScore(header, HEADER_CANDIDATES[key]);
      if (score >= FUZZY_THRESHOLD) candidates.push({ key, header, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  for (const { key, header } of candidates) {
    if (detection[key].header || claimed.has(header)) continue;
    detection[key] = { header, confidence: 'review' };
    claimed.add(header);
  }

  return detection;
};

/** Flattens a detection to the plain mapping the rest of the importer uses. */
export const toColumnMapping = (detection: MappingDetection): ColumnMapping => {
  const mapping: ColumnMapping = {};
  for (const { key } of IMPORT_FIELDS) {
    const header = detection[key].header;
    if (header) mapping[key] = header;
  }
  return mapping;
};

/** Convenience wrapper for callers that only want the mapping. */
export const autoDetectMapping = (headers: string[]): ColumnMapping =>
  toColumnMapping(detectMapping(headers));

/** A name is enough if it's split into two columns or supplied as one. */
export const isNameMapped = (m: ColumnMapping): boolean =>
  (!!m.firstName && !!m.lastName) || !!m.fullName || !!m.firstName;

/** A guest with no email and no phone can't be sent anything. */
export const hasContactColumn = (m: ColumnMapping): boolean => !!m.email || !!m.phone;

/**
 * What still has to be mapped before an import can run, phrased for the person
 * doing the mapping. One definition, so the button state and the explanation
 * next to it can never disagree.
 */
export const missingRequirements = (m: ColumnMapping): string[] => {
  const missing: string[] = [];
  if (!isNameMapped(m)) missing.push('a guest name');
  if (!m.checkoutDate) missing.push('a check-out date');
  if (!hasContactColumn(m)) missing.push('an email or phone column');
  return missing;
};

// --- Dates ----------------------------------------------------------------

export type DateFormat = 'DMY' | 'MDY' | 'YMD';
export type DateFormatDetection = { format: DateFormat; ambiguous: boolean };

const DATE_PATTERNS: Record<DateFormat, string[]> = {
  DMY: ['dd/MM/yyyy', 'd/M/yyyy', 'dd-MM-yyyy', 'd-M-yyyy', 'dd.MM.yyyy', 'd.M.yyyy'],
  MDY: ['MM/dd/yyyy', 'M/d/yyyy', 'MM-dd-yyyy', 'M-d-yyyy', 'MM.dd.yyyy', 'M.d.yyyy'],
  YMD: ['yyyy-MM-dd', 'yyyy/MM/dd'],
};

/** Formats every date the same way, regardless of the viewer's locale. */
export const formatDateForDisplay = (date: Date): string => formatDate(date, 'd MMM yyyy');

/**
 * Infers the date convention from evidence in the data.
 *
 * `03/04/2026` is a real date under both DMY and MDY, three months apart. When
 * a whole column is consistent with both we return `ambiguous: true` so the
 * wizard asks instead of guessing — silently shifting every stay by months is
 * the worst failure mode this importer has.
 */
export const detectDateFormat = (samples: string[]): DateFormatDetection => {
  let sawIso = false;
  let dmyOnly = 0;
  let mdyOnly = 0;
  let sawEitherWay = false;

  for (const raw of samples) {
    const value = (raw || '').trim();
    if (!value) continue;

    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(value)) {
      sawIso = true;
      continue;
    }

    const parts = value.split(/[/\-.]/);
    if (parts.length < 3) continue;

    const first = Number(parts[0]);
    const second = Number(parts[1]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) continue;

    // A component above 12 can only be a day, which pins the convention.
    if (first > 12 && second <= 12) dmyOnly++;
    else if (second > 12 && first <= 12) mdyOnly++;
    else if (first <= 12 && second <= 12) sawEitherWay = true;
  }

  if (dmyOnly > 0 && mdyOnly === 0) return { format: 'DMY', ambiguous: false };
  if (mdyOnly > 0 && dmyOnly === 0) return { format: 'MDY', ambiguous: false };
  // Conflicting evidence: the file mixes conventions. Surface it as ambiguous.
  if (dmyOnly > 0 && mdyOnly > 0) return { format: 'DMY', ambiguous: true };
  if (sawIso && !sawEitherWay) return { format: 'YMD', ambiguous: false };

  // Every value fits both readings — the user has to tell us.
  return { format: 'DMY', ambiguous: sawEitherWay };
};

/**
 * Parses a date against explicit patterns. Deliberately avoids `new Date(str)`,
 * which silently applies US month-first rules to `03/04/2026`.
 */
export const parseImportDate = (value: string, dateFormat: DateFormat): Date | null => {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;

  // ISO is unambiguous, so accept it regardless of the selected convention.
  const patterns = [...DATE_PATTERNS.YMD, ...DATE_PATTERNS[dateFormat]];

  for (const pattern of patterns) {
    // Strip any trailing time component before matching the date pattern.
    const parsed = parseDateFns(trimmed.split(/[ T]/)[0], pattern, new Date());
    if (isValid(parsed)) return parsed;
  }

  return null;
};

/** Date-only ISO string (`2026-07-30`), free of timezone shifting. */
export const toIsoDate = (date: Date): string => formatDate(date, 'yyyy-MM-dd');

// --- Rows -----------------------------------------------------------------

export type MappedRow = {
  /** 1-based line number in the source file, including the header row. */
  lineNumber: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  checkoutDate: string | null;
  checkinDate: string | null;
  /** Booking origin, when the file carries one. Null falls back to the wizard's choice. */
  source: ReservationSource | null;
  /** Raw source values, for re-exporting failed rows. */
  raw: Record<string, string>;
};

/**
 * 'info' states a fact about the row without implying anything is wrong. It
 * exists for upcoming stays: an OTA export is mostly future bookings, and
 * flagging every one of them as a warning would make a healthy import look
 * broken.
 */
export type RowIssue = { level: 'error' | 'warning' | 'info'; message: string };

export type ValidatedRow = MappedRow & {
  issues: RowIssue[];
  status: 'ok' | 'warning' | 'error' | 'duplicate';
};

/** Applies the user's column mapping to one parsed CSV record. */
export const mapRow = (
  record: Record<string, string>,
  mapping: ColumnMapping,
  dateFormat: DateFormat,
  lineNumber: number,
): MappedRow => {
  const read = (key: ImportFieldKey): string => {
    const header = mapping[key];
    if (!header) return '';
    return (record[header] ?? '').toString().trim();
  };

  const readDate = (key: ImportFieldKey): string | null => {
    const parsed = parseImportDate(read(key), dateFormat);
    return parsed ? toIsoDate(parsed) : null;
  };

  // A combined name column fills whichever halves aren't mapped explicitly.
  // Everything after the first token is the surname, so "Ana Maria Costa"
  // keeps "Maria Costa" together rather than losing it.
  let firstName = read('firstName');
  let lastName = read('lastName');
  const fullName = read('fullName');
  if (fullName && (!firstName || !lastName)) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (!firstName) firstName = parts[0] || '';
    if (!lastName) lastName = parts.slice(1).join(' ');
  }

  return {
    lineNumber,
    firstName,
    lastName,
    email: read('email') || null,
    phone: read('phone') || null,
    checkoutDate: readDate('checkoutDate'),
    checkinDate: readDate('checkinDate'),
    source: normalizeSource(read('source')),
    raw: record,
  };
};

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

/**
 * Airbnb never hands over a guest's real address — it issues a relay alias and
 * forwards from it. Those relays stop forwarding once a stay is closed out, so
 * a review invite sent to one may never arrive. Worth saying out loud rather
 * than letting the owner wonder why their open rate cratered.
 */
const PROXY_EMAIL_DOMAINS = ['guest.airbnb.com', 'airbnb.com', 'guest.booking.com', 'message.booking.com'];

export const isProxyEmail = (email: string | null): boolean => {
  const domain = (email || '').trim().toLowerCase().split('@')[1];
  return !!domain && PROXY_EMAIL_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`));
};

/** Matches the 14-day expiry window in supabase/functions/process-reviews. */
const EXPIRY_WINDOW_DAYS = 14;

export const validateRow = (row: MappedRow, today: Date = new Date()): ValidatedRow => {
  const issues: RowIssue[] = [];

  if (!row.firstName && !row.lastName) {
    issues.push({ level: 'error', message: 'Missing guest name' });
  }

  if (!row.email && !row.phone) {
    issues.push({ level: 'error', message: 'No email or phone — this guest cannot be contacted' });
  }

  if (row.email && !EMAIL_PATTERN.test(row.email)) {
    issues.push({ level: 'error', message: `Invalid email address "${row.email}"` });
  } else if (isProxyEmail(row.email)) {
    issues.push({
      level: 'warning',
      message: 'Relay address from the booking platform — the invite may not reach this guest',
    });
  }

  if (row.phone && row.phone.replace(/\D/g, '').length < 7) {
    issues.push({ level: 'error', message: `Phone number "${row.phone}" is too short` });
  }

  if (!row.checkoutDate) {
    issues.push({ level: 'error', message: 'Missing or unreadable check-out date' });
  }

  if (row.checkinDate && row.checkoutDate && row.checkinDate > row.checkoutDate) {
    issues.push({ level: 'error', message: 'Check-in date is after check-out date' });
  }

  if (row.checkoutDate) {
    const ageDays = Math.floor(
      (today.getTime() - new Date(`${row.checkoutDate}T00:00:00`).getTime()) / 86_400_000,
    );
    if (ageDays > EXPIRY_WINDOW_DAYS) {
      issues.push({
        level: 'warning',
        message: `Checked out ${ageDays} days ago — will expire without being sent`,
      });
    } else if (ageDays < 0) {
      // Not a problem: the sender holds the invite until the day of checkout.
      // Saying so is the only way the owner can tell that an import of next
      // month's arrivals has done what they expected.
      const daysAway = Math.abs(ageDays);
      issues.push({
        level: 'info',
        message: `Checks out in ${daysAway} ${daysAway === 1 ? 'day' : 'days'} — the invite sends then`,
      });
    }
  }

  const status = issues.some(i => i.level === 'error')
    ? 'error'
    : issues.some(i => i.level === 'warning')
      ? 'warning'
      : 'ok';

  return { ...row, issues, status };
};

/**
 * Identity of a stay, for duplicate detection. Guests re-appear across
 * overlapping OTA exports, and a second import would send a second request.
 */
export const dedupeKey = (row: {
  firstName?: string;
  lastName?: string;
  email: string | null;
  phone: string | null;
  checkoutDate: string | null;
}): string | null => {
  if (!row.checkoutDate) return null;
  const contact = row.email?.trim().toLowerCase() || row.phone?.replace(/\D/g, '') || '';
  if (contact) return `${contact}|${row.checkoutDate}`;

  // No contact details: fall back to the name. Airbnb exports routinely omit
  // both email and phone, and without this such rows have no identity at all —
  // re-importing the same file would create a second stay for every guest.
  const name = `${row.firstName || ''} ${row.lastName || ''}`.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!name) return null;
  return `name:${name}|${row.checkoutDate}`;
};

// --- Issue grouping -------------------------------------------------------

export type IssueGroup = {
  /** Human-readable heading, with any per-row value stripped out. */
  message: string;
  level: RowIssue['level'];
  count: number;
  lineNumbers: number[];
};

/**
 * Collapses the interpolated part of a message so every row with the same kind
 * of problem lands in one group: `Invalid email address "bob@"` and
 * `Invalid email address "x"` are one issue with a count of two, not two
 * issues. Same for the day counts in the expiry and upcoming messages.
 */
const issueGroupKey = (message: string): string =>
  message
    .replace(/"[^"]*"/g, '"…"')
    .replace(/\b\d+\b/g, 'N');

/**
 * Groups every issue across the file by kind, most-affected first. Turns a
 * 400-line wall of per-row complaints into "312 rows: missing check-out date".
 */
export const groupIssues = (rows: ValidatedRow[]): IssueGroup[] => {
  const groups = new Map<string, IssueGroup>();

  for (const row of rows) {
    for (const issue of row.issues) {
      const key = `${issue.level}::${issueGroupKey(issue.message)}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
        existing.lineNumbers.push(row.lineNumber);
      } else {
        groups.set(key, {
          // Keep the first row's wording; it reads better than the redacted key.
          message: issue.message,
          level: issue.level,
          count: 1,
          lineNumbers: [row.lineNumber],
        });
      }
    }
  }

  const severity: Record<RowIssue['level'], number> = { error: 0, warning: 1, info: 2 };
  return [...groups.values()].sort(
    (a, b) => severity[a.level] - severity[b.level] || b.count - a.count,
  );
};

// --- Template + download --------------------------------------------------

/**
 * Triggers a client-side file download. Shared so the template and the
 * failed-row export behave identically.
 */
export const downloadCsv = (fileName: string, csv: string): void => {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * A starter file for owners who have no OTA export to work from.
 *
 * Dates are ISO on purpose: it is the one format that cannot be misread as
 * either day-first or month-first, so a template-based import never hits the
 * ambiguity prompt.
 */
export const buildTemplateCsv = (today: Date = new Date()): string => {
  const shift = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return toIsoDate(d);
  };

  return Papa.unparse({
    fields: [
      'First Name', 'Last Name', 'Email', 'Phone',
      'Check-in Date', 'Check-out Date', 'Reservation Source',
    ],
    data: [
      // A stay that just ended — this guest's invite goes out right away.
      ['Maria', 'Fernandez', 'maria.fernandez@example.com', '+34 612 345 678', shift(-4), shift(-1), 'Direct'],
      // An upcoming stay — queued now, sent on the day they check out.
      ['James', 'Okafor', 'j.okafor@example.com', '+44 7700 900123', shift(3), shift(6), 'Airbnb'],
    ],
  });
};
