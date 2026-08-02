import { describe, it, expect } from 'vitest';
import { encodeShortId, decodeShortId, encodeRequestId, decodeRequestId } from './shortLink';

const REQUEST_ID = '03d364c0-b5e9-4692-929c-bdb891fcd3f2';
const LOCATION_ID = 'a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7';

describe('the short-link codec', () => {
  it('round-trips a request id', () => {
    expect(decodeShortId(encodeShortId(REQUEST_ID)!)).toBe(REQUEST_ID);
  });

  it('round-trips a location id, which is what property QR links encode', () => {
    expect(decodeShortId(encodeShortId(LOCATION_ID)!)).toBe(LOCATION_ID);
  });

  it('produces 22 URL-safe characters', () => {
    const code = encodeShortId(LOCATION_ID)!;
    expect(code).toHaveLength(22);
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('is UUID-generic — the alias and the original are the same function', () => {
    expect(encodeShortId).toBe(encodeRequestId);
    expect(decodeShortId).toBe(decodeRequestId);
  });

  it('cannot tell a location code from a request code', () => {
    // This is why /p/ and /r/ must be separate routes: nothing in the code
    // itself says which kind of id it holds. If this ever stops being true,
    // the route split can be revisited.
    const a = encodeShortId(REQUEST_ID)!;
    const b = encodeShortId(LOCATION_ID)!;
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(b).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('rejects anything that is not a code', () => {
    expect(decodeShortId('nope')).toBeNull();
    expect(decodeShortId('')).toBeNull();
    expect(decodeShortId('!'.repeat(22))).toBeNull();
    expect(encodeShortId('not-a-uuid')).toBeNull();
  });
});
