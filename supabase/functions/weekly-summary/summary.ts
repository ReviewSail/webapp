export type Frequency = 'weekly' | 'monthly';
export interface Period { start: string; end: string; firstDay: string; lastDay: string; timezone: string }
export interface Location { id: string; account_id: string; name: string | null; timezone: string | null }
interface Stay { location_id: string; source: string | null }
export interface Invitation { id: string; sent_at: string | null; origin: string | null; orders: Stay | null }
export interface Feedback {
  id: string; location_id: string; request_id: string | null; kind: string;
  star_rating: number | null; created_at: string; review_requests: { orders: Stay | null } | null;
}
export interface Midstay extends Stay { id: string; midstay_sent_at: string | null }
export interface Metrics { invitations: number; ratings: number; ratingSum: number; lowRatings: number; followups: number; midstay: number }
export interface PropertySummary { location: Location; period: Period; metrics: Metrics }

const dayAt = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
};
const shiftDay = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

// The UTC cron's week/month, not the hour a retry happens, identifies a report.
// Monday is the weekly anchor; the first of the month is the monthly anchor.
export function reportingKey(now: Date, frequency: Frequency): string {
  const utcDay = now.toISOString().slice(0, 10);
  if (frequency === 'monthly') return `${utcDay.slice(0, 7)}-01`;
  const weekday = new Date(`${utcDay}T00:00:00Z`).getUTCDay();
  return shiftDay(utcDay, -((weekday + 6) % 7));
}

// Find the first instant on a local calendar date, including DST midnight changes.
// Do not subtract 24-hour blocks from a local midnight: DST days can be 23/25 hours.
function boundary(day: string, timezone: string): string {
  const nominal = Date.parse(`${day}T00:00:00Z`);
  let lo = nominal - 48 * 3600000, hi = nominal + 48 * 3600000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayAt(new Date(mid), timezone) < day) lo = mid + 1;
    else hi = mid;
  }
  return new Date(lo).toISOString();
}

export function reportingPeriod(now: Date, frequency: Frequency, configuredTimezone: string | null): Period {
  const timezone = configuredTimezone || 'UTC';
  // Invalid configured zones fail closed instead of silently assigning the wrong dates.
  const key = reportingKey(now, frequency);
  let firstDay: string, endDay: string;
  if (frequency === 'monthly') {
    // The cron's UTC month identifies which completed calendar month is requested.
    // A western property may not have finished it at 08:00 UTC on the first day.
    endDay = key;
    firstDay = `${shiftDay(endDay, -1).slice(0, 7)}-01`;
  } else {
    // Anchor at the cron's Monday 08:00 UTC, so an overlap or late rerun
    // describes the same seven completed local dates for each property.
    endDay = dayAt(new Date(`${key}T08:00:00Z`), timezone);
    firstDay = shiftDay(endDay, -7);
  }
  const start = boundary(firstDay, timezone), end = boundary(endDay, timezone);
  if (Date.parse(end) > now.getTime()) throw new Error('Reporting period is not complete');
  return { start, end, firstDay, lastDay: shiftDay(endDay, -1), timezone };
}

export const emptyMetrics = (): Metrics => ({ invitations: 0, ratings: 0, ratingSum: 0, lowRatings: 0, followups: 0, midstay: 0 });
const inPeriod = (value: string | null, period: Period) => {
  const timestamp = value ? Date.parse(value) : NaN;
  return timestamp >= Date.parse(period.start) && timestamp < Date.parse(period.end);
};

export function calculateMetrics(locationId: string, period: Period, invitations: Invitation[], feedback: Feedback[], midstays: Midstay[]): Metrics {
  const metrics = emptyMetrics();
  const realStay = (stay: Stay | null) => {
    if (!stay || stay.location_id !== locationId) throw new Error('Incomplete or mismatched stay relationship');
    return stay.source !== 'reviewsail_test';
  };
  for (const invitation of invitations) {
    if (realStay(invitation.orders) && invitation.origin !== 'qr' && inPeriod(invitation.sent_at, period)) metrics.invitations++;
  }
  for (const item of feedback) {
    if (item.location_id !== locationId) throw new Error('Feedback property mismatch');
    if (!inPeriod(item.created_at, period)) continue;
    // A property QR response legitimately has no review request. Linked test stays do not count.
    if (item.request_id !== null && !realStay(item.review_requests?.orders ?? null)) continue;
    if (item.kind === 'recovery') { metrics.followups++; continue; }
    if (!['rating', 'complaint'].includes(item.kind) || !Number.isInteger(item.star_rating) || item.star_rating! < 1 || item.star_rating! > 5) {
      throw new Error('Invalid rated feedback');
    }
    metrics.ratings++;
    metrics.ratingSum += item.star_rating!;
    if (item.star_rating! <= 3) metrics.lowRatings++;
  }
  for (const stay of midstays) {
    if (realStay(stay) && inPeriod(stay.midstay_sent_at, period)) metrics.midstay++;
  }
  return metrics;
}

export function totalMetrics(properties: PropertySummary[]): Metrics {
  return properties.reduce((total, property) => {
    for (const key of Object.keys(total) as (keyof Metrics)[]) total[key] += property.metrics[key];
    return total;
  }, emptyMetrics());
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const average = (metrics: Metrics) => metrics.ratings ? (metrics.ratingSum / metrics.ratings).toFixed(1) : '—';

export function renderSummary(account: string, owner: string, frequency: Frequency, properties: PropertySummary[], appUrl: string): string {
  const total = totalMetrics(properties);
  const title = frequency === 'weekly' ? 'Weekly' : 'Monthly';
  const rows = properties.map(({ location, period, metrics }) => `<tr>
    <th scope="row">${escapeHtml(location.name || 'Unnamed property')}<br><small>${period.firstDay} – ${period.lastDay} (${escapeHtml(period.timezone)})</small></th>
    <td>${metrics.invitations}</td><td>${metrics.ratings}</td><td>${average(metrics)}</td><td>${metrics.lowRatings}</td><td>${metrics.followups}</td><td>${metrics.midstay}</td>
  </tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body><h1>${title} ReviewSail summary</h1><p>Hello ${escapeHtml(owner)},</p><h2>${escapeHtml(account)}</h2>
  <p>Invitations recorded sent: <strong>${total.invitations}</strong><br>
  Guest ratings received: <strong>${total.ratings}</strong><br>
  Average guest rating: <strong>${average(total)}</strong><br>
  Low ratings (1–3 stars): <strong>${total.lowRatings}</strong><br>
  Follow-up messages: <strong>${total.followups}</strong><br>
  Mid-stay check-ins recorded sent: <strong>${total.midstay}</strong></p>
  <table cellpadding="8" border="1"><caption>Completed reporting dates in each property's timezone</caption>
  <thead><tr><th scope="col">Property / dates</th><th scope="col">Invitations</th><th scope="col">Ratings</th><th scope="col">Average</th><th scope="col">Low ratings</th><th scope="col">Follow-ups</th><th scope="col">Mid-stay check-ins</th></tr></thead><tbody>${rows}</tbody></table>
  <p>Ratings are private feedback collected by ReviewSail, including property QR responses, not confirmed Google or Booking.com reviews.
  Invitations and mid-stay check-ins use recorded send timestamps, not confirmed delivery. Reminders are not additional invitations.
  Mid-stay check-ins are not a count of resolved guest issues. Test stays are excluded where linked to the feedback.</p>
  <p><a href="${escapeHtml(appUrl)}/inbox">Open your feedback inbox</a>. Contact guests separately through Booking.com or your usual channel; an internal note does not send a reply.</p>
  <p><a href="${escapeHtml(appUrl)}/settings?tab=account">Manage or disable email summaries in Settings</a> (sign-in required).</p></body></html>`;
}
