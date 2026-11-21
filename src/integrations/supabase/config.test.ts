import { describe, expect, it } from 'vitest';
import { getSupabaseConfig } from './config';

describe('getSupabaseConfig', () => {
  it('requires both deployment values', () => {
    expect(() => getSupabaseConfig(undefined, 'key')).toThrow(/VITE_SUPABASE_URL/);
    expect(() => getSupabaseConfig('https://example.supabase.co', ' ')).toThrow(
      /VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY/,
    );
  });

  it('accepts an HTTPS Supabase URL and trims configuration values', () => {
    expect(getSupabaseConfig(' https://example.supabase.co/ ', ' key ')).toEqual({
      url: 'https://example.supabase.co',
      key: 'key',
    });
  });

  it('allows HTTP only for local Supabase development', () => {
    expect(getSupabaseConfig('http://127.0.0.1:54321', 'key').url).toBe(
      'http://127.0.0.1:54321',
    );
    expect(() => getSupabaseConfig('http://example.supabase.co', 'key')).toThrow(/HTTPS/);
  });

  it('rejects malformed URLs', () => {
    expect(() => getSupabaseConfig('not-a-url', 'key')).toThrow(/valid URL/);
  });
});
