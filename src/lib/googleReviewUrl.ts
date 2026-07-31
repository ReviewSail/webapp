/**
 * The whole product hinges on this one URL: it is where a happy guest is sent
 * to actually post the review. A wrong value fails silently — the guest lands
 * on a profile page, shrugs, and leaves.
 *
 * There are two shapes that open Google's review composer directly:
 *   https://search.google.com/local/writereview?placeid=ChIJ...
 *   https://g.page/r/<CID>/review
 *
 * A link copied from Google Maps' "Share" button is NOT one of these — it opens
 * the listing, where the guest must hunt for "Write a review".
 *
 * We deliberately do not resolve a share link into a Place ID. That needs the
 * Google Places API, a billing account, and a server-side proxy to hide the
 * key. Classifying the input and telling the user where to get the right link
 * gets nearly all the value for none of that.
 */

export type GoogleUrlKind =
  | 'empty'
  | 'review-link'
  | 'place-id'
  | 'listing-link'
  | 'invalid';

export type GoogleUrlAssessment = {
  kind: GoogleUrlKind;
  /** The URL to store — normalized when we can, else the trimmed input. */
  normalized: string;
  /** Whether guests will land straight on the review composer. */
  opensReviewComposer: boolean;
  message?: string;
};

/** Google Place IDs are opaque, but real ones consistently look like this. */
const PLACE_ID_PATTERN = /^ChI[A-Za-z0-9_-]{10,}$/;

const buildWriteReviewUrl = (placeId: string) =>
  `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;

const LISTING_HOST_HINTS = [
  'maps.app.goo.gl',
  'goo.gl/maps',
  'maps.google.',
  'google.com/maps',
  'g.co/kgs',
];

export const assessGoogleReviewUrl = (input: string): GoogleUrlAssessment => {
  const value = (input || '').trim();

  if (!value) {
    return {
      kind: 'empty',
      normalized: '',
      opensReviewComposer: false,
      message: 'Without a review link, guests who rate you highly have nowhere to go.',
    };
  }

  // A bare Place ID pasted from Google's Place ID finder.
  if (PLACE_ID_PATTERN.test(value)) {
    return {
      kind: 'place-id',
      normalized: buildWriteReviewUrl(value),
      opensReviewComposer: true,
      message: "Recognised a Google Place ID — we've turned it into a direct review link.",
    };
  }

  const lower = value.toLowerCase();

  if (!/^https?:\/\//.test(lower)) {
    return {
      kind: 'invalid',
      normalized: value,
      opensReviewComposer: false,
      message: "That doesn't look like a link. Paste the full URL, starting with https://",
    };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {
      kind: 'invalid',
      normalized: value,
      opensReviewComposer: false,
      message: "That doesn't look like a valid link.",
    };
  }

  // Already a direct review link.
  const isWriteReview =
    url.hostname.endsWith('google.com') && url.pathname.includes('/local/writereview');
  const isGPageReview =
    url.hostname === 'g.page' && /\/r\/[^/]+\/review\/?$/.test(url.pathname);

  if (isWriteReview || isGPageReview) {
    return {
      kind: 'review-link',
      normalized: value,
      opensReviewComposer: true,
      message: 'This opens the review box directly — exactly what you want.',
    };
  }

  // A Maps listing / share link: works, but costs the guest extra taps.
  if (LISTING_HOST_HINTS.some(hint => lower.includes(hint)) || url.hostname.endsWith('google.com')) {
    return {
      kind: 'listing-link',
      normalized: value,
      opensReviewComposer: false,
      message:
        'This opens your Google profile, not the review box — guests have to find "Write a review" themselves, and many won\'t. For a direct link, open Google Business Profile and use "Ask for reviews".',
    };
  }

  return {
    kind: 'invalid',
    normalized: value,
    opensReviewComposer: false,
    message: "That isn't a Google link. Paste your Google review link or Place ID.",
  };
};

/** Convenience for callers that only need to know whether to warn. */
export const isUsableReviewUrl = (input: string): boolean =>
  assessGoogleReviewUrl(input).kind !== 'empty' && assessGoogleReviewUrl(input).kind !== 'invalid';
