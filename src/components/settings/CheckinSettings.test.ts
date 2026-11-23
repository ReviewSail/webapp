import { describe, expect, it } from 'vitest';
import { previewStay } from './CheckinSettings';

describe('property schedule preview', () => {
  it('shows Friday evening and Saturday noon for a weekend stay', () => {
    expect(previewStay('both', '16:00', 2, 2, 10)).toEqual([
      'Friday · 6:00 PM · Arrival check-in',
      'Saturday · 12:00 PM · First-night follow-up',
    ]);
  });
  it('coalesces late arrivals and excludes departure day', () => {
    expect(previewStay('both', '23:30', 2, 2, 10)).toEqual([
      'Saturday · 9:00 AM · Arrival check-in',
    ]);
    expect(previewStay('both', '23:30', 1, 2, 10)).toEqual([]);
    expect(previewStay('day2', '16:00', 1, 2, 10)).toEqual([]);
  });
  it('checks the actual hourly run against local quiet hours', () => {
    expect(previewStay('arrival', '17:20', 2, 2, 10, 'UTC')[0]).toContain('Saturday · 9:00 AM');
    expect(previewStay('arrival', '17:20', 2, 2, 10, 'Asia/Kolkata')[0]).toContain(
      'Friday · 7:20 PM',
    );
  });
  it('keeps legacy schedules and quiet hours', () => {
    expect(previewStay('legacy', '16:00', 2, 2, 10)).toEqual(['Day 2 · 10:00 AM · Stay check-in']);
    expect(previewStay('arrival', '05:30', 1, 2, 10)).toEqual([
      'Friday · 9:00 AM · Arrival check-in',
    ]);
  });
});
