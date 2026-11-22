export type SendOutcome = { success: boolean; error?: string; message?: string; partial?: boolean };

/** Reject HTTP-200 no-ops and legacy mock responses as well as explicit failures. */
export function readSendOutcome(data: unknown, requestId: string): SendOutcome {
  const payload = data as { success?: boolean; error?: string; results?: unknown[] } | null;
  const result = Array.isArray(payload?.results)
    ? payload.results.find(value => (value as { id?: string })?.id === requestId) as {
      status?: string;
      channels?: Record<string, { status?: string; providerId?: string; reason?: string }>;
    } | undefined
    : undefined;
  const accepted = ['email', 'sms'].filter(channel =>
    result?.channels?.[channel]?.status === 'accepted'
      && typeof result.channels[channel].providerId === 'string'
      && !!result.channels[channel].providerId?.trim(),
  );
  if (payload?.success !== true || result?.status !== 'sent' || accepted.length === 0) {
    return {
      success: false,
      error: payload?.error || 'No provider acceptance was confirmed. Check the request and provider logs before retrying.',
    };
  }
  const other = ['email', 'sms'].filter(channel => !accepted.includes(channel))
    .map(channel => `${channel === 'sms' ? 'SMS' : 'Email'}: ${result.channels?.[channel]?.reason?.replace(/_/g, ' ') || 'not accepted'}`);
  const partial = ['email', 'sms'].some(channel =>
    ['failed', 'configuration_error'].includes(result.channels?.[channel]?.status || ''),
  );
  return {
    success: true,
    partial,
    message: `Accepted by the provider for ${accepted.map(c => c === 'sms' ? 'SMS' : 'email').join(' and ')}. Delivery is not yet confirmed.${other.length ? ` ${other.join('; ')}.` : ''}`,
  };
}
