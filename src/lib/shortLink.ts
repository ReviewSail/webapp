/**
 * SMS links must be short: the long gate URL is 97 characters, which alone eats
 * most of a 160-character segment.
 *
 * A UUID is 16 bytes of real information padded out to 36 characters of hex and
 * hyphens. Base64url-encoding those raw bytes gives 22 characters — so the code
 * *is* the request id, fully reversible, needing no lookup table and no column.
 *
 *   /feedback-gate?request_id=03d364c0-b5e9-4692-929c-bdb891fcd3f2   97 chars
 *   /r/A9Nkw...                                                      60 chars
 *
 * Note: process-reviews carries a small Deno copy of encodeRequestId. Keep the
 * two in step — a mismatch produces links that resolve to nothing.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toBase64Url = (binary: string): string =>
  btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64Url = (code: string): string => {
  const base64 = code.replace(/-/g, '+').replace(/_/g, '/');
  // Restore the stripped '=' padding to a multiple of 4.
  return atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
};

/** UUID -> 22-character URL-safe code. Returns null for a malformed UUID. */
export const encodeRequestId = (uuid: string): string | null => {
  if (!UUID_PATTERN.test(uuid)) return null;

  const hex = uuid.replace(/-/g, '');
  let binary = '';
  for (let i = 0; i < 32; i += 2) {
    binary += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return toBase64Url(binary);
};

/** 22-character code -> UUID. Returns null for anything that isn't one. */
export const decodeRequestId = (code: string): string | null => {
  if (!/^[A-Za-z0-9_-]{22}$/.test(code)) return null;

  try {
    const binary = fromBase64Url(code);
    if (binary.length !== 16) return null;

    const hex = [...binary].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    const uuid = [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join('-');

    return UUID_PATTERN.test(uuid) ? uuid : null;
  } catch {
    return null;
  }
};

/**
 * The codec is UUID-generic, not request-specific. Property QR links encode a
 * `locations.id` with the very same functions, which is why property links need
 * no new column and no second encoder.
 *
 * The two are indistinguishable once encoded — both are 22 characters of
 * base64url — so which kind of id a code holds comes from the route it arrived
 * on (`/r/` vs `/p/`), never from the code itself.
 */
export const encodeShortId = encodeRequestId;
export const decodeShortId = decodeRequestId;
