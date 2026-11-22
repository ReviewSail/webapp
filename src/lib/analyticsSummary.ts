import type { GuestFeedback, Order, ReviewRequest } from '../context/ReviewSailContext';
import { safeTimezone } from './timezones';

export type AnalyticsRange = '30d' | '90d' | 'all';

/** Calendar arithmetic, not elapsed 24-hour blocks: DST must not shift a reporting day. */
function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** Reporting over already-loaded records; not a complete server-side aggregate. */
export function analyticsSummary({ locationId, timezone, orders, requests, feedbacks, range, now }: {
  locationId: string | null; timezone?: string; orders: Order[]; requests: ReviewRequest[];
  feedbacks: GuestFeedback[]; range: AnalyticsRange; now: Date;
}) {
  const zone = safeTimezone(timezone);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const dayOf = (value: string | Date) => {
    const parts = formatter.formatToParts(new Date(value));
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
  };
  const today = dayOf(now);
  const days = range === '30d' ? 30 : 90;
  const firstDay = shiftDay(today, 1 - days);
  const previousFirstDay = shiftDay(firstDay, -days);
  const inPeriod = (value: string | undefined, previous = false) => {
    if (!value) return false;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp) || timestamp > now.getTime()) return false;
    if (range === 'all') return !previous;
    const day = dayOf(value);
    return previous ? day >= previousFirstDay && day < firstDay : day >= firstDay && day <= today;
  };
  const orderById = new Map(orders.map(order => [order.id, order]));
  const testOrderIds = new Set(orders.filter(order => order.source === 'reviewsail_test').map(order => order.id));
  const testRequestIds = new Set(requests.filter(request => testOrderIds.has(request.orderId)).map(request => request.id));
  const scopedRequests = requests.filter(request => {
    const order = orderById.get(request.orderId);
    return order?.locationId === locationId && !testOrderIds.has(request.orderId) && request.origin !== 'qr';
  });
  const scopedFeedback = feedbacks.filter(feedback => feedback.locationId === locationId &&
    (!feedback.requestId || !testRequestIds.has(feedback.requestId)));
  // Follow-up messages are not additional rated responses or public reviews.
  const isRated = (feedback: GuestFeedback) => feedback.kind !== 'recovery' &&
    feedback.starRating != null && Number.isInteger(feedback.starRating) &&
    feedback.starRating >= 1 && feedback.starRating <= 5;
  const sent = scopedRequests.filter(request => inPeriod(request.sentAt));
  const received = scopedFeedback.filter(feedback => inPeriod(feedback.createdAt));
  const rated = received.filter(isRated);
  const previousSent = scopedRequests.filter(request => inPeriod(request.sentAt, true)).length;
  const previousRated = scopedFeedback.filter(feedback => isRated(feedback) && inPeriod(feedback.createdAt, true)).length;
  const trend = (current: number, previous: number) => range === 'all' || previous === 0
    ? null : Math.round((current - previous) / previous * 100);

  const buckets = new Map<string, { label: string; requested: number; completed: number }>();
  const labelOf = (day: string) => new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', ...(range === 'all' ? { year: 'numeric' as const } : {}),
  }).format(new Date(`${day}T12:00:00Z`));
  const bucket = (value: string) => {
    const day = dayOf(value);
    if (range !== 'all') return day;
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    return shiftDay(day, -(weekday === 0 ? 6 : weekday - 1));
  };
  const ensureBucket = (day: string) => {
    if (!buckets.has(day)) buckets.set(day, { label: labelOf(day), requested: 0, completed: 0 });
    return buckets.get(day)!;
  };
  if (range !== 'all') for (let index = 0; index < days; index++) ensureBucket(shiftDay(firstDay, index));
  for (const request of sent) ensureBucket(bucket(request.sentAt!)).requested++;
  for (const feedback of rated) ensureBucket(bucket(feedback.createdAt)).completed++;
  return {
    timezone: zone, sent, received, rated,
    hasData: scopedRequests.length > 0 || scopedFeedback.length > 0,
    sentTrend: trend(sent.length, previousSent), ratedTrend: trend(rated.length, previousRated),
    lowRatings: rated.filter(feedback => feedback.starRating! <= 3).length,
    averageRating: rated.length ? rated.reduce((sum, feedback) => sum + feedback.starRating!, 0) / rated.length : null,
    chartData: [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value),
  };
}
