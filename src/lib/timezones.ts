/**
 * `locations.timezone` was written at signup and then read by nothing — the
 * send scheduler compared `preferred_send_hour` straight against UTC, so a
 * host in Los Angeles who picked 10 AM had guests emailed at 3 AM local.
 *
 * These helpers back the Settings picker; the matching comparison lives in
 * supabase/functions/process-reviews.
 */

/** The visitor's IANA zone, falling back to UTC where unavailable. */
export const browserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** Friendly display name while preserving the IANA value for scheduling. */
export const friendlyTimezone = (timezone: string): string => {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longGeneric' }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value;
    const city = timezone.split('/').pop()?.replace(/_/g, ' ');
    return name && city && name !== city ? `${name} · ${city}` : name || timezone;
  } catch {
    return timezone.replace(/_/g, ' ');
  }
};

export const friendlySendHour = (hour: number): string => `${hour % 12 || 12}${hour < 12 ? ' am' : ' pm'}`;

/**
 * Every zone the runtime knows about. `supportedValuesOf` is widely available
 * but still worth guarding, since a missing list would break the whole page.
 */
export const TIMEZONES: string[] = (() => {
  try {
    const supported = (Intl as any).supportedValuesOf?.('timeZone') as string[] | undefined;
    if (supported?.length) return ['UTC', ...supported.filter(zone => zone !== 'UTC')];
  } catch {
    // fall through
  }
  return [
    'UTC',
    'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
    'America/Sao_Paulo', 'Europe/London', 'Europe/Lisbon', 'Europe/Madrid',
    'Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Amsterdam',
    'Europe/Warsaw', 'Europe/Athens', 'Africa/Cairo', 'Asia/Dubai',
    'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Tokyo',
    'Australia/Sydney', 'Pacific/Auckland',
  ];
})();

/** The hour 0-23 in `timeZone` at the given instant. */
export const hourInZone = (timeZone: string, at: Date = new Date()): number => {
  try {
    const hour = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    }).format(at);
    return Number(hour) % 24;
  } catch {
    return at.getUTCHours();
  }
};

/** "10:00" rendered for the picker label. */
export const formatHourInZone = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

/** What the local send time corresponds to right now in the viewer's own zone. */
export const describeSendTime = (timeZone: string, hour: number): string => {
  try {
    const now = new Date();
    const probe = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0,
    ));
    const offsetAtNoon = hourInZone(timeZone, probe) - 12;
    const utcHour = (((hour - offsetAtNoon) % 24) + 24) % 24;
    return `${formatHourInZone(hour)} in ${timeZone.replace(/_/g, ' ')} (${formatHourInZone(utcHour)} UTC)`;
  } catch {
    return formatHourInZone(hour);
  }
};

/** Keep malformed legacy timezone values from crashing overview date rendering. */
export const safeTimezone = (timezone?: string): string => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone || 'UTC' });
    return timezone || 'UTC';
  } catch { return 'UTC'; }
};

export const formatInviteTime = (value?: string, timezone?: string): string => {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('en-US', { timeZone: safeTimezone(timezone), month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
};
