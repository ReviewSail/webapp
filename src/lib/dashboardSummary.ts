import { safeTimezone } from './timezones';
import type { Customer, GuestFeedback, MessageEvent, Order, ReviewRequest } from '../context/ReviewSailContext';

/** Calendar dates in the property's timezone, including today. */
export function propertyDay(value: Date | string, timezone: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: safeTimezone(timezone), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}

export function dashboardSummary({ locationId, timezone, orders, requests, events, feedbacks, customers, enableEmail, enableSms, now = new Date() }: {
  locationId: string; timezone: string; orders: Order[]; requests: ReviewRequest[];
  events: MessageEvent[]; feedbacks: GuestFeedback[]; customers: Customer[];
  enableEmail: boolean; enableSms: boolean; now?: Date;
}) {
  const today = propertyDay(now, timezone);
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  const firstDay = start.toISOString().slice(0, 10);
  const inPeriod = (value?: string) => {
    if (!value || new Date(value).getTime() > now.getTime()) return false;
    const day = propertyDay(value, timezone);
    return day >= firstDay && day <= today;
  };
  const locationOrders = orders.filter(order => order.locationId === locationId);
  const orderMap = new Map(locationOrders.map(order => [order.id, order]));
  const customerMap = new Map(customers.map(customer => [customer.id, customer]));
  const outbound = requests.filter(request => request.origin !== 'qr' && orderMap.has(request.orderId));
  const requestIds = new Set(outbound.map(request => request.id));
  const firstClicks = new Map<string, string>();
  const activity = new Map<string, number>();
  for (const event of events) {
    if (!requestIds.has(event.requestId) || !Number.isFinite(Date.parse(event.createdAt))) continue;
    activity.set(event.requestId, Math.max(activity.get(event.requestId) ?? 0, Date.parse(event.createdAt)));
    if (event.eventType !== 'clicked') continue;
    const earlier = firstClicks.get(event.requestId);
    if (!earlier || Date.parse(event.createdAt) < Date.parse(earlier)) firstClicks.set(event.requestId, event.createdAt);
  }
  const pending = outbound.filter(request => request.status === 'pending' && orderMap.get(request.orderId)?.status === 'completed');
  const missingContact = pending.filter(request => {
    const customer = customerMap.get(orderMap.get(request.orderId)!.customerId);
    return !(enableEmail && customer?.email?.trim()) && !(enableSms && customer?.phone?.trim());
  });
  const locationFeedback = feedbacks.filter(feedback => feedback.locationId === locationId);
  const latest = [...outbound].sort((a, b) => {
    const timestamp = (request: ReviewRequest) => Math.max(activity.get(request.id) ?? 0, Date.parse(request.sentAt ?? '') || 0);
    return timestamp(b) - timestamp(a);
  }).slice(0, 5);
  return {
    sent: outbound.filter(request => inPeriod(request.sentAt)).length,
    clicked: [...firstClicks.values()].filter(inPeriod).length,
    feedback: locationFeedback.filter(feedback => inPeriod(feedback.createdAt)).length,
    unread: locationFeedback.filter(feedback => feedback.kind !== 'rating' && !feedback.isRead).length,
    queued: pending.length,
    missingContact: missingContact.length,
    latest,
    totalInvites: outbound.length,
    hasActivity: outbound.length > 0 || locationFeedback.length > 0,
    recognition: [...locationFeedback].filter(feedback => (feedback.starRating ?? 0) >= 4 && feedback.feedbackText?.trim()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0],
  };
}
