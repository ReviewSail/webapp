/**
 * SMS billing is per *segment*, not per message, and the segment size depends
 * on which alphabet the text can be encoded in:
 *
 *   GSM-7  160 chars alone, 153 each once split across segments
 *   UCS-2   70 chars alone,  67 each once split
 *
 * A single character outside GSM-7 — an emoji, a curly apostrophe, an em-dash —
 * forces the whole message to UCS-2 and more than halves its capacity. That is
 * invisible while editing, so the Settings editor surfaces it live.
 */

export type SmsEncoding = 'GSM-7' | 'UCS-2';

/** The GSM 03.38 basic alphabet. */
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

/** Extension-table characters: still GSM-7, but each costs two septets. */
const GSM_EXTENDED = '^{}\\[~]|€';

const GSM_BASIC_SET = new Set([...GSM_BASIC]);
const GSM_EXTENDED_SET = new Set([...GSM_EXTENDED]);

export const detectEncoding = (text: string): SmsEncoding =>
  [...text].every(c => GSM_BASIC_SET.has(c) || GSM_EXTENDED_SET.has(c)) ? 'GSM-7' : 'UCS-2';

/**
 * Billable length. Under GSM-7 extension characters count double; under UCS-2
 * we count UTF-16 code units, since a non-BMP emoji occupies two.
 */
export const countUnits = (text: string, encoding: SmsEncoding = detectEncoding(text)): number =>
  encoding === 'GSM-7'
    ? [...text].reduce((n, c) => n + (GSM_EXTENDED_SET.has(c) ? 2 : 1), 0)
    : text.length;

export type SegmentInfo = {
  encoding: SmsEncoding;
  units: number;
  segments: number;
  /** Units still available before another segment is billed. */
  remaining: number;
  /** The first character that forced UCS-2, if any — the actionable detail. */
  offendingCharacter?: string;
};

export const analyzeSms = (text: string): SegmentInfo => {
  const encoding = detectEncoding(text);
  const units = countUnits(text, encoding);

  const singleLimit = encoding === 'GSM-7' ? 160 : 70;
  const multiLimit = encoding === 'GSM-7' ? 153 : 67;

  const segments = units === 0 ? 0 : units <= singleLimit ? 1 : Math.ceil(units / multiLimit);
  const capacity = segments <= 1 ? singleLimit : segments * multiLimit;

  const offendingCharacter =
    encoding === 'UCS-2'
      ? [...text].find(c => !GSM_BASIC_SET.has(c) && !GSM_EXTENDED_SET.has(c))
      : undefined;

  return { encoding, units, segments, remaining: capacity - units, offendingCharacter };
};

/**
 * Template placeholders are far shorter than what replaces them — {reviewLink}
 * is 12 characters but renders to ~60 — so a raw count of the template would
 * badly understate the real message. Substitute representative values first.
 */
export const previewSms = (
  template: string,
  sample: { firstName?: string; lastName?: string; locationName?: string; reviewLink?: string } = {},
): string =>
  template
    .replace(/{firstName}/g, sample.firstName ?? 'Jean-Pierre')
    .replace(/{lastName}/g, sample.lastName ?? 'Dubois')
    .replace(/{locationName}/g, sample.locationName ?? 'Seaside Inn')
    // Length of a real short link: origin + "/r/" + 22-char code.
    .replace(/{reviewLink}/g, sample.reviewLink ?? 'https://webapp-nine-teal.vercel.app/r/A8kQ2mPz9xLm3nRt5vWq7Y');
