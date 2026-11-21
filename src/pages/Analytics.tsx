import { useState, useMemo, useEffect } from 'react';
import { useReviewSail } from '../context/ReviewSailContext';
import {
  BarChart3,
  Send,
  CheckCircle,
  MessageSquare,
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import { analyticsSummary, type AnalyticsRange } from '../lib/analyticsSummary';
import { cn } from '../lib/utils';

function timeAgo(date: string | Date): string {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return format(then, 'MMM d');
}

export default function Analytics() {
  const {
    reviewRequests, orders, customers, feedbacks, activeLocationId, locations,
    loading, dashboardLoading, dashboardError, refreshData,
  } = useReviewSail();
  const [timeRange, setTimeRange] = useState<AnalyticsRange>('30d');
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Update the local reporting clock across midnight; this does not poll the database.
    const update = () => setNow(new Date());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);
  const timezone = locations.find(location => location.id === activeLocationId)?.timezone;
  const summary = useMemo(() => analyticsSummary({
    locationId: activeLocationId, timezone, orders, requests: reviewRequests,
    feedbacks, range: timeRange, now,
  }), [activeLocationId, timezone, orders, reviewRequests, feedbacks, timeRange, now]);
  const reviewsRequested = summary.sent.length;
  const reviewsCompleted = summary.rated.length;
  const privateFeedbackCaught = summary.lowRatings;
  const averageRating = summary.averageRating;
  const reviewTrend = summary.sentTrend;
  const completedTrend = summary.ratedTrend;
  const chartData = summary.chartData;

  const recentActivity = useMemo(() => {
    const requestById = new Map(reviewRequests.map(request => [request.id, request]));
    const orderById = new Map(orders.map(order => [order.id, order]));
    const customerById = new Map(customers.map(customer => [customer.id, customer]));
    const guest = (requestId: string | null, providedName?: string | null) => {
      const request = requestId ? requestById.get(requestId) : undefined;
      const order = request ? orderById.get(request.orderId) : undefined;
      const customer = order ? customerById.get(order.customerId) : undefined;
      const name = providedName?.trim() || (customer
        ? [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim() : '') || 'Anonymous guest';
      return { guestName: name, guestInitials: name.split(/\s+/).slice(0, 2).map(part => part[0]).join('') };
    };
    const events = [
      ...summary.sent.map(request => ({
        id: 'sent-' + request.id, type: 'request_sent' as const,
        ...guest(request.id), timestamp: request.sentAt!,
      })),
      ...summary.received.map(feedback => ({
        id: 'fb-' + feedback.id,
        type: feedback.kind === 'recovery' ? 'follow_up' as const : 'feedback_received' as const,
        ...guest(feedback.requestId, feedback.guestName), timestamp: feedback.createdAt,
      })),
    ];
    return events.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.id.localeCompare(b.id)).slice(0, 10);
  }, [summary, reviewRequests, orders, customers]);

  if (loading || dashboardLoading) return <p role="status">Loading analytics…</p>;
  if (dashboardError) return (
    <div role="alert" className="space-y-3">
      <p>Analytics could not be loaded. Totals are unavailable.</p>
      <button type="button" className="text-brand-600 underline" onClick={() => { void refreshData(); }}>Try again</button>
    </div>
  );
  const hasNoData = !summary.hasData;

  if (hasNoData) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">Analytics</h1>
            <p className="text-sm text-ink-muted mt-1">Track invitations and guest feedback over time.</p>
          </div>
        </div>

        <EmptyState
          icon={BarChart3}
          title="No analytics data yet"
          description="Collect guest feedback or send an invitation to see analytics here."
          action={
            <Link
              to="/import"
              className="inline-flex items-center space-x-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm py-2.5 px-5 rounded-xl shadow-sm transition-all"
            >
              <Send className="h-4 w-4" />
              <span>Import Guests</span>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Analytics</h1>
          <p className="text-sm text-ink-muted mt-1">Track invitations and guest feedback over time.</p>
        </div>

        {/* Time Range Toggle */}
        <div className="inline-flex items-center bg-muted rounded-xl p-0.5 shadow-sm">
          {([
            { value: '30d' as const, label: 'Last 30 days' },
            { value: '90d' as const, label: 'Last 90 days' },
            { value: 'all' as const, label: 'All time' },
          ]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTimeRange(value)}
              aria-pressed={timeRange === value}
              className={cn(
                'px-4 py-2 text-sm font-semibold rounded-lg transition-all',
                timeRange === value
                  ? 'bg-card text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-ink-muted">
        Dates use {summary.timezone}; day ranges include today. Invites use recorded send timestamps,
        not confirmed delivery. Rated responses include QR feedback and are not confirmed Google reviews.
        These are separate activity counts, not a conversion rate.
      </p>
      <p className="text-xs text-ink-muted">
        Based on loaded records, capped at 2,000 per dataset. Large histories may be incomplete.
        Marked test stays are excluded where their linked records are loaded.
      </p>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Invites sent */}
        <div className="bg-card p-6 rounded-2xl border border-line/80 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 p-3 bg-brand-50 text-brand-600 rounded-xl group-hover:scale-110 transition-transform">
            <Send className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold text-ink-faint uppercase tracking-wider">Invites sent</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-bold text-ink tracking-tight">
              {reviewsRequested}
            </span>
          </div>
          <div className="mt-4 flex items-center space-x-1 text-xs">
            {reviewTrend !== null ? (
              <span className={cn(
                'inline-flex items-center font-semibold px-2 py-0.5 rounded-full',
                reviewTrend >= 0 ? 'text-positive bg-positive-soft' : 'text-critical bg-critical-soft'
              )}>
                {reviewTrend >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 mr-1" />
                )}
                {reviewTrend >= 0 ? '+' : ''}{reviewTrend}% vs prev period
              </span>
            ) : (
              <span className="inline-flex items-center font-semibold text-ink-faint px-2 py-0.5 rounded-full bg-canvas">
                <Minus className="h-3.5 w-3.5 mr-1" />
                No prior data
              </span>
            )}
          </div>
        </div>

        {/* Rated responses */}
        <div className="bg-card p-6 rounded-2xl border border-line/80 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 p-3 bg-positive-soft text-positive rounded-xl group-hover:scale-110 transition-transform">
            <CheckCircle className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold text-ink-faint uppercase tracking-wider">Rated responses</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-bold text-ink tracking-tight">{reviewsCompleted}</span>
          </div>
          <div className="mt-4 flex items-center space-x-1 text-xs">
            {completedTrend !== null ? (
              <span className={cn(
                'inline-flex items-center font-semibold px-2 py-0.5 rounded-full',
                completedTrend >= 0 ? 'text-positive bg-positive-soft' : 'text-critical bg-critical-soft'
              )}>
                {completedTrend >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 mr-1" />
                )}
                {completedTrend >= 0 ? '+' : ''}{completedTrend}% vs prev period
              </span>
            ) : (
              <span className="inline-flex items-center font-semibold text-ink-faint px-2 py-0.5 rounded-full bg-canvas">
                <Minus className="h-3.5 w-3.5 mr-1" />
                No prior data
              </span>
            )}
          </div>
        </div>

        {/* Low ratings (1–3) */}
        <div className="bg-card p-6 rounded-2xl border border-line/80 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 p-3 bg-brand-50 text-brand-600 rounded-xl group-hover:scale-110 transition-transform">
            <MessageSquare className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold text-ink-faint uppercase tracking-wider">Low ratings (1–3)</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-bold text-ink tracking-tight">{privateFeedbackCaught}</span>
          </div>
          <div className="mt-4 flex items-center space-x-1 text-xs">
            <span className="inline-flex items-center font-semibold text-ink-faint px-2 py-0.5 rounded-full bg-canvas">
              <Minus className="h-3.5 w-3.5 mr-1" />
              {timeRange === 'all' ? 'All time' : 'Period'}
            </span>
          </div>
        </div>

        {/* Average Rating */}
        <div className="bg-card p-6 rounded-2xl border border-line/80 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 p-3 bg-caution-soft text-caution rounded-xl group-hover:scale-110 transition-transform">
            <Star className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold text-ink-faint uppercase tracking-wider">Average Rating</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-bold text-ink tracking-tight">
              {averageRating !== null ? averageRating.toFixed(1) : '—'}
            </span>
            {averageRating !== null && (
              <span className="text-sm text-ink-faint">/ 5</span>
            )}
          </div>
          <div className="mt-4 flex items-center space-x-1 text-xs">
            <span className="inline-flex items-center font-semibold text-ink-faint px-2 py-0.5 rounded-full bg-canvas">
              <Star className="h-3.5 w-3.5 mr-1 text-star" />
              {reviewsCompleted} rated responses in this period
            </span>
          </div>
        </div>
      </div>

      {/* Line Chart */}
      <div className="bg-card rounded-2xl border border-line shadow-sm p-6">
        <h2 className="text-lg font-bold text-ink mb-6">Invitations and rated responses</h2>
        {chartData.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                />
                <Line
                  type="monotone"
                  dataKey="requested"
                  name="Invites sent"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#6366f1' }}
                />
                <Line
                  type="monotone"
                  dataKey="completed"
                  name="Rated responses"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#10b981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex items-center justify-center h-72 text-ink-faint text-sm">
            No data available for the selected period.
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-card rounded-2xl border border-line shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-line bg-canvas/50">
          <h2 className="text-lg font-bold text-ink flex items-center">
            <BarChart3 className="h-5 w-5 mr-2 text-brand-600" />
            Recent Activity
          </h2>
        </div>

        {recentActivity.length > 0 ? (
          <div className="divide-y divide-line">
            {recentActivity.map((event) => (
              <div
                key={event.id}
                className="px-6 py-4 flex items-center space-x-4 hover:bg-canvas/50 transition-colors"
              >
                <div className="h-9 w-9 rounded-full bg-brand-50 text-brand-700 font-bold text-xs flex items-center justify-center shrink-0">
                  {event.guestInitials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">
                    {event.guestName}
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5 flex items-center">
                    {event.type === 'request_sent' ? (
                      <>
                        <Send className="h-3 w-3 mr-1 text-brand-400" />
                        Invitation recorded as sent
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1 text-positive" />
                        {event.type === 'follow_up' ? 'Follow-up message received' : 'Guest feedback received'}
                      </>
                    )}
                  </p>
                </div>
                <span className="text-xs text-ink-faint shrink-0">
                  {timeAgo(event.timestamp)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-ink-faint text-sm">
            No recent activity for the selected period.
          </div>
        )}
      </div>
    </div>
  );
}
