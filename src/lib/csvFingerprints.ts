import { cleanKey, type ColumnMapping, type ReservationSource } from './csvImport';

/**
 * Recognising the file an owner just downloaded, so they don't have to explain
 * it to us column by column.
 *
 * Neither Airbnb nor Booking.com publishes its export schema, and Booking.com's
 * extranet localises its headers — a German property exports "Anreise", not
 * "Check-in". So this deliberately does *not* test for an exact set of headers.
 * It scores how many of a platform's signature columns are present and accepts
 * the best one over a threshold, which degrades gracefully when a platform
 * renames or adds a column instead of failing shut.
 *
 * Everything here is a suggestion: the wizard still shows the mapping and lets
 * the owner change it before a single row is written.
 */

export type PlatformKey = 'airbnb' | 'booking_com' | 'hospitable' | 'vrbo';

type Fingerprint = {
  key: PlatformKey;
  label: string;
  /** What we stamp on orders.source when this format is detected. */
  source: ReservationSource;
  /**
   * Headers that characterise the format, normalized via cleanKey. Presence is
   * scored as a proportion, so a partial match still identifies the file.
   */
  signature: string[];
  /**
   * Headers we treat as strong evidence on their own — a column name unlikely
   * to appear in any other platform's export.
   */
  distinctive: string[];
  /** Field -> normalized header. Resolved back to the real header at detect time. */
  columns: Partial<Record<keyof ColumnMapping, string[]>>;
};

const FINGERPRINTS: Fingerprint[] = [
  {
    key: 'airbnb',
    label: 'Airbnb',
    source: 'airbnb',
    // Airbnb's "List of reservations" export. Note the absence of an email
    // column in the signature — most Airbnb exports genuinely have none, and
    // requiring one here would stop us recognising the format at all.
    signature: ['confirmationcode', 'status', 'guestname', 'contact', 'startdate', 'enddate', 'listing'],
    distinctive: ['confirmationcode'],
    columns: {
      firstName: ['firstname'],
      lastName: ['lastname'],
      fullName: ['guestname'],
      email: ['email', 'guestemail'],
      phone: ['contact', 'phone', 'phonenumber'],
      checkinDate: ['startdate', 'checkin'],
      checkoutDate: ['enddate', 'checkout'],
    },
  },
  {
    key: 'booking_com',
    label: 'Booking.com',
    source: 'booking_com',
    // Booking.com extranet reservations export. "booknumber" is the reliable
    // anchor; the surrounding columns vary by market and interface language.
    signature: ['booknumber', 'bookedby', 'guestname', 'checkin', 'checkout', 'status', 'roomnights'],
    distinctive: ['booknumber'],
    columns: {
      firstName: ['firstname', 'guestfirstname'],
      lastName: ['lastname', 'guestlastname'],
      fullName: ['guestname', 'bookedby'],
      email: ['email', 'guestemail', 'emailaddress'],
      phone: ['phone', 'phonenumber', 'contactnumber'],
      checkinDate: ['checkin', 'checkindate', 'arrival'],
      checkoutDate: ['checkout', 'checkoutdate', 'departure'],
    },
  },
  {
    key: 'hospitable',
    label: 'Hospitable',
    source: 'other',
    // A PMS that sits in front of Airbnb/Booking.com for a lot of hosts, and
    // the one export format we could verify against published documentation.
    signature: [
      'guestfirstname', 'guestlastname', 'guestemail', 'guestphone',
      'checkindate', 'checkoutdate', 'platform', 'listingname',
    ],
    distinctive: ['guestfirstname', 'listingname'],
    columns: {
      firstName: ['guestfirstname'],
      lastName: ['guestlastname'],
      email: ['guestemail'],
      phone: ['guestphone'],
      checkinDate: ['checkindate'],
      checkoutDate: ['checkoutdate'],
      source: ['platform'],
    },
  },
  {
    key: 'vrbo',
    label: 'Expedia / VRBO',
    source: 'other',
    signature: ['reservationid', 'guestname', 'arrivaldate', 'departuredate', 'propertyname'],
    distinctive: ['reservationid'],
    columns: {
      firstName: ['firstname'],
      lastName: ['lastname'],
      fullName: ['guestname'],
      email: ['email', 'emailaddress'],
      phone: ['phone', 'phonenumber'],
      checkinDate: ['arrivaldate'],
      checkoutDate: ['departuredate'],
    },
  },
];

/**
 * Proportion of signature headers a file must carry to be claimed. Set by hand
 * rather than tuned: below this, a generic spreadsheet with a "Status" and a
 * "Guest name" column starts matching everything.
 */
const MATCH_THRESHOLD = 0.5;

export type PlatformDetection = {
  key: PlatformKey;
  label: string;
  source: ReservationSource;
  mapping: ColumnMapping;
  /** 0..1 — how much of the signature was present. */
  score: number;
};

/**
 * Identifies the export format of a header row, or returns null when nothing
 * matches well enough to be worth claiming.
 */
export const detectPlatform = (headers: string[]): PlatformDetection | null => {
  const byCleanKey = new Map<string, string>();
  for (const header of headers) {
    const key = cleanKey(header);
    if (!byCleanKey.has(key)) byCleanKey.set(key, header);
  }

  let best: PlatformDetection | null = null;

  for (const print of FINGERPRINTS) {
    const present = print.signature.filter(s => byCleanKey.has(s)).length;
    const score = present / print.signature.length;

    // A distinctive column vouches for the format even when the rest of the
    // export has drifted — "Confirmation code" is not a Booking.com header.
    const hasDistinctive = print.distinctive.some(d => byCleanKey.has(d));
    if (score < MATCH_THRESHOLD && !(hasDistinctive && score >= 0.3)) continue;

    const mapping: ColumnMapping = {};
    for (const [field, candidates] of Object.entries(print.columns)) {
      for (const candidate of candidates as string[]) {
        const header = byCleanKey.get(candidate);
        if (header && !Object.values(mapping).includes(header)) {
          mapping[field as keyof ColumnMapping] = header;
          break;
        }
      }
    }

    // Without a check-out date there is nothing to schedule an invite against,
    // so a "match" that can't find one isn't usable as an auto-mapping.
    if (!mapping.checkoutDate) continue;

    if (!best || score > best.score) {
      best = { key: print.key, label: print.label, source: print.source, mapping, score };
    }
  }

  return best;
};

/**
 * Airbnb's export identifies guests by display name only — one "Guest name"
 * column, no surname field, and frequently no email at all. The wizard uses
 * this to explain the gap rather than presenting an empty mapping as normal.
 */
export const hasReachableContact = (mapping: ColumnMapping): boolean =>
  !!mapping.email || !!mapping.phone;
