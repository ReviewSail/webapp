import { parse as parseDateFns, isValid, format as formatDate } from 'date-fns';

/**
 * Pure CSV import logic — no React, no Supabase. The wizard renders these
 * results; the context persists them.
 */

export type ImportFieldKey =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'checkoutDate'
  | 'checkinDate';

export type ColumnMapping = Partial<Record<ImportFieldKey, string>>;

export const IMPORT_FIELDS: Array<{
  key: ImportFieldKey;
  label: string;
  required: boolean;
  hint?: string;
}> = [
  { key: 'firstName', label: 'First name', required: true },
  { key: 'lastName', label: 'Last name', required: true },
  { key: 'email', label: 'Email', required: false, hint: 'Email or phone required' },
  { key: 'phone', label: 'Phone', required: false, hint: 'Email or phone required' },
  { key: 'checkoutDate', label: 'Check-out date', required: true },
  { key: 'checkinDate', label: 'Check-in date', required: false, hint: 'Enables mid-stay check-ins' },
];

/** Normalizes a header for matching: "Guest First Name" -> "guestfirstname". */
const cleanKey = (key: string) => key.toLowerCase().trim().replace(/[_\-\s]+/g, '');

/**
 * Header candidates per field, ordered by priority. Carried over from the
 * previous inline importer and extended with the OTA exports we document in
 * the CSV Format Guide.
 */
const HEADER_CANDIDATES: Record<ImportFieldKey, string[]> = {
  firstName: ['firstname', 'first', 'guestfirstname', 'givenname', 'forename', 'guestname', 'name'],
  lastName: ['lastname', 'last', 'guestlastname', 'surname', 'familyname'],
  email: ['email', 'emailaddress', 'guestemail', 'contactemail'],
  phone: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'telephone', 'tel', 'guestphone', 'contactphone'],
  checkoutDate: ['checkoutdate', 'checkout', 'departuredate', 'departure', 'enddate', 'todate'],
  checkinDate: ['checkindate', 'checkin', 'arrivaldate', 'arrival', 'startdate', 'fromdate'],
};

/**
 * Best-effort mapping of CSV headers to import fields. Every result is a
 * suggestion the user can override in the wizard — this is a starting point,
 * not a decision.
 */
export const autoDetectMapping = (headers: string[]): ColumnMapping => {
  const byCleanKey = new Map<string, string>();
  for (const header of headers) {
    const key = cleanKey(header);
    // First header wins so a later near-duplicate can't steal the mapping.
    if (!byCleanKey.has(key)) byCleanKey.set(key, header);
  }

  const mapping: ColumnMapping = {};
  const claimed = new Set<string>();

  for (const { key } of IMPORT_FIELDS) {
    for (const candidate of HEADER_CANDIDATES[key]) {
      const header = byCleanKey.get(candidate);
      if (header && !claimed.has(header)) {
        mapping[key] = header;
        claimed.add(header);
        break;
      }
    }
  }

  return mapping;
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
  /** Raw source values, for re-exporting failed rows. */
  raw: Record<string, string>;
};

export type RowIssue = { level: 'error' | 'warning'; message: string };

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

  return {
    lineNumber,
    firstName: read('firstName'),
    lastName: read('lastName'),
    email: read('email') || null,
    phone: read('phone') || null,
    checkoutDate: readDate('checkoutDate'),
    checkinDate: readDate('checkinDate'),
    raw: record,
  };
};

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

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
    }
  }

  const status = issues.some(i => i.level === 'error')
    ? 'error'
    : issues.length > 0
      ? 'warning'
      : 'ok';

  return { ...row, issues, status };
};

/**
 * Identity of a stay, for duplicate detection. Guests re-appear across
 * overlapping OTA exports, and a second import would send a second request.
 */
export const dedupeKey = (row: {
  email: string | null;
  phone: string | null;
  checkoutDate: string | null;
}): string | null => {
  if (!row.checkoutDate) return null;
  const contact = row.email?.trim().toLowerCase() || row.phone?.replace(/\D/g, '') || '';
  if (!contact) return null;
  return `${contact}|${row.checkoutDate}`;
};
