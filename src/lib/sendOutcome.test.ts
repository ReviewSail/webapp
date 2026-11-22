import { describe, expect, it } from 'vitest';
import { readSendOutcome } from './sendOutcome';

describe('provider acceptance contract', () => {
  it.each([null, {}, { success: true }, { success: true, results: [] }])('rejects missing results: %j', data => {
    expect(readSendOutcome(data, 'a').success).toBe(false);
  });
  it('rejects a different request even if a provider accepted it', () => {
    expect(readSendOutcome({ success: true, results: [{ id: 'b', status: 'sent', channels: { email: { status: 'accepted', providerId: 'id' } } }] }, 'a').success).toBe(false);
  });
  it('reports partial acceptance honestly', () => {
    const result = readSendOutcome({ success: true, results: [{ id: 'a', status: 'sent', channels: {
      email: { status: 'accepted', providerId: 'id' }, sms: { status: 'configuration_error', reason: 'missing_credentials' },
    } }] }, 'a');
    expect(result.success).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.message).toContain('SMS: missing credentials');
  });
  it('rejects persistence failure after provider acceptance', () => {
    expect(readSendOutcome({ success: false, error: 'Do not resend', results: [{ id: 'a', status: 'recording_failed', channels: { email: { status: 'accepted', providerId: 'id' } } }] }, 'a')).toEqual({ success: false, error: 'Do not resend' });
  });
});
