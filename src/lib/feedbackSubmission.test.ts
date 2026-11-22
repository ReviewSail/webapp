import { describe, expect, it } from 'vitest';
import { readFeedbackOutcome, safeReviewUrl } from './feedbackSubmission';

describe('feedback acknowledgements', () => {
  it.each(['accepted', 'duplicate'])('accepts only a matching %s receipt', status => {
    expect(readFeedbackOutcome({ status, submission_id: 'expected' }, 'expected')).toEqual({ saved: true, uncertain: false });
    expect(readFeedbackOutcome({ status, submission_id: 'wrong' }, 'expected')).toMatchObject({ saved: false, uncertain: true });
  });
  it.each([null, undefined, {}, { status: 'accepted' }, { success: true }, { status: 'toString' }])('does not treat malformed or legacy success as saved: %j', value => {
    expect(readFeedbackOutcome(value, 'expected')).toMatchObject({ saved: false, uncertain: true });
  });
  it.each(['invalid', 'unavailable', 'rate_limited', 'conflict'])('reports %s explicitly', status => {
    expect(readFeedbackOutcome({ status }, 'expected')).toMatchObject({ saved: false, uncertain: false, error: expect.any(String) });
  });
  it.each(['javascript:alert(1)', 'data:text/html,test', 'http://example.com', 'https://user:password@example.com', 'invalid'])('rejects unsafe public URL %s', url => {
    expect(safeReviewUrl(url)).toBeNull();
  });
  it('retains an HTTPS review destination', () => {
    expect(safeReviewUrl('https://www.google.com/maps')).toBe('https://www.google.com/maps');
  });
});
