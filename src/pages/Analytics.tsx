import { useState, useMemo } from 'react';
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
import { format, subDays, startOfDay, differenceInDays } from 'date-fns';
import { cn } from '../lib/utils';

type TimeRange = '30d' | '90d' | 'all';

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
    reviewRequests,
    orders,
    customers,
    feedbacks,
    activeLocationId,
  } = useReviewSail();

  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  // Compute the date boundaries
  const now = new Date();
  const rangeStart = useMemo(() => {
    if (timeRange === '30d') return subDays(now, 30);
    if (timeRange === '90d') return subDays(now, 90);
    return new Date(0); // all time
  }, [timeRange]);

  const previousPeriodEnd = rangeStart;
  const periodDurationMs = now.getTime() - rangeStart.getTime();
  const previousPeriodStart = new Date(previousPeriodEnd.getTime() - periodDurationMs);

  // Filter data for active location
  const activeLocOrders = useMemo(
    () => orders.filter(o => o.locationId === activeLocationId),
    [orders, activeLocationId]
  );
  const activeLocOrderIds = useMemo(
    () => new Set(activeLocOrders.map(o => o.id)),
    [activeLocOrders]
  );

  // Helper: get customer name initials for a request
  const getCustomerForRequest = (requestId: string) => {
    const req = reviewRequests.find(r => r.id === requestId);
    if (!req) return null;
    const order = orders.find(o => o.id === req.orderId);
    if (!order) return null;
    return customers.find(c => c.id === order.customerId) || null;
  };

  const getCustomerName = (requestId: string): string => {
    const customer = getCustomerForRequest(requestId);
    return customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown Guest';
  };

  const getCustomerInitials = (requestId: string): string => {
    const customer = getCustomerForRequest(requestId);
    return customer
      ? `${customer.firstName?.[0] ?? ''}${customer.lastName?.[0] ?? ''}`
      : '?';
  };

  // Filter data by time range
  const isInPreviousPeriod = (dateStr: string | undefined | null): boolean => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d >= previousPeriodStart && d < previousPeriodEnd;
  };

  const isInRange = (dateStr: string | undefined | null): boolean => {
    if (!dateStr) return true; // all time, everything counts
    const d = new Date(dateStr);
    return d >= rangeStart && d <= now;
  };

  // Active location review requests
  const activeLocRequests = useMemo(
    () => reviewRequests.filter(r => activeLocOrderIds.has(r.orderId)),
    [reviewRequests, activeLocOrderIds]
  );

  const activeLocFeedbacks = useMemo(
    () => feedbacks.filter(f => {
      if (!f.requestId) return false;
      const req = reviewRequests.find(r => r.id === f.requestId);
      return req && activeLocOrderIds.has(req.orderId);
    }),
    [feedbacks, reviewRequests, activeLocOrderIds]
  );

  // ===== KPI CALCULATIONS =====

  // 1. Reviews Requested
  const reviewsRequested = useMemo(
    () => activeLocRequests.filter(r => isInRange(r.sentAt) || (timeRange === 'all')).length,
    [activeLocRequests, timeRange]
  );

  const reviewsRequestedPrev = useMemo(
    () => {
      if (timeRange === 'all') return 0;
      return activeLocRequests.filter(r => isInPreviousPeriod(r.sentAt)).length;
    },
    [activeLocRequests, timeRange]
  );

  const reviewTrend = useMemo(() => {
    if (timeRange === 'all' || reviewsRequestedPrev === 0) return null;
    return Math.round(((reviewsRequested - reviewsRequestedPrev) / reviewsRequestedPrev) * 100);
  }, [reviewsRequested, reviewsRequestedPrev, timeRange]);

  // 2. Reviews Completed (from feedback table)
  const reviewsCompleted = useMemo(
    () => activeLocFeedbacks.filter(f => isInRange(f.createdAt)).length,
    [activeLocFeedbacks, timeRange]
  );

  const reviewsCompletedPrev = useMemo(
    () => {
      if (timeRange === 'all') return 0;
      return activeLocFeedbacks.filter(f => isInPreviousPeriod(f.createdAt)).length;
    },
    [activeLocFeedbacks, timeRange]
  );

  const completedTrend = useMemo(() => {
    if (timeRange === 'all' || reviewsCompletedPrev === 0) return null;
    return Math.round(((reviewsCompleted - reviewsCompletedPrev) / reviewsCompletedPrev) * 100);
  }, [reviewsCompleted, reviewsCompletedPrev, timeRange]);

  // 3. Private Feedback Caught — now respects time range
  const privateFeedbackCaught = useMemo(
    () => activeLocRequests.filter(r =>
      r.status === 'private_feedback' && (timeRange === 'all' || isInRange(r.sentAt))
    ).length,
    [activeLocRequests, timeRange]
  );

  // 4. Average Rating
  const averageRating = useMemo(() => {
    if (activeLocFeedbacks.length === 0) return 0;
    const sum = activeLocFeedbacks.reduce((acc, f) => acc + f.rating, 0);
    return sum / activeLocFeedbacks.length;
  }, [activeLocFeedbacks]);

  // ===== CHART DATA =====

  const chartData = useMemo(() => {
    const numDays = timeRange === 'all'
      ? Math.max(differenceInDays(now, new Date(0)), 1)
      : differenceInDays(now, rangeStart);

    // For large date ranges, bucket by week instead of day
    const bucketByWeek = numDays > 90;

    if (bucketByWeek) {
      // Group by ISO week start (Monday)
      const weekMap = new Map<string, { label: string; date: Date; requested: number; completed: number }>();

      activeLocRequests.forEach(r => {
        if (!r.sentAt) return;
        const d = new Date(r.sentAt);
        if (timeRange !== 'all' && d < rangeStart) return;
        const weekStart = startOfDay(d);
        const day = weekStart.getDay();
        const diff = day === 0 ? 6 : day - 1;
        weekStart.setDate(weekStart.getDate() - diff);
        const key = weekStart.toISOString();
        if (!weekMap.has(key)) {
          weekMap.set(key, {
            label: format(weekStart, 'MMM d'),
            date: weekStart,
            requested: 0,
            completed: 0,
          });
        }
        weekMap.get(key)!.requested++;
      });

      activeLocFeedbacks.forEach(f => {
        const d = new Date(f.createdAt);
        if (timeRange !== 'all' && d < rangeStart) return;
        const weekStart = startOfDay(d);
        const day = weekStart.getDay();
        const diff = day === 0 ? 6 : day - 1;
        weekStart.setDate(weekStart.getDate() - diff);
        const key = weekStart.toISOString();
        if (!weekMap.has(key)) {
          weekMap.set(key, {
            label: format(weekStart, 'MMM d'),
            date: weekStart,
            requested: 0,
            completed: 0,
          });
        }
        weekMap.get(key)!.completed++;
      });

      return Array.from(weekMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
    } else {
      // Group by day
      const dayMap = new Map<string, { label: string; date: Date; requested: number; completed: number }>();

      // Generate all days in range
      for (let i = 0; i <= numDays; i++) {
        const d = subDays(now, numDays - i);
        if (timeRange !== 'all' && d < rangeStart) continue;
        const key = format(d, 'yyyy-MM-dd');
        dayMap.set(key, {
          label: format(d, 'MMM d'),
          date: d,
          requested: 0,
          completed: 0,
        });
      }

      activeLocRequests.forEach(r => {
        if (!r.sentAt) return;
        const d = new Date(r.sentAt);
        if (timeRange !== 'all' && d < rangeStart) return;
        const key = format(d, 'yyyy-MM-dd');
        if (dayMap.has(key)) {
          dayMap.get(key)!.requested++;
        }
      });

      activeLocFeedbacks.forEach(f => {
        const d = new Date(f.createdAt);
        if (timeRange !== 'all' && d < rangeStart) return;
        const key = format(d, 'yyyy-MM-dd');
        if (dayMap.has(key)) {
          dayMap.get(key)!.completed++;
        }
      });

      return Array.from(dayMap.values());
    }
  }, [activeLocRequests, activeLocFeedbacks, timeRange, rangeStart, now]);

  // ===== RECENT ACTIVITY =====

  const recentActivity = useMemo(() => {
    type ActivityEvent = {
      id: string;
      type: 'review_completed' | 'request_sent';
      guestName: string;
      guestInitials: string;
      timestamp: string;
    };

    const events: ActivityEvent[] = [];

    // 1. Request sent events
    activeLocRequests.forEach(r => {
      if (!r.sentAt) return;
      events.push({
        id: `sent-${r.id}`,
        type: 'request_sent',
        guestName: getCustomerName(r.id),
        guestInitials: getCustomerInitials(r.id),
        timestamp: r.sentAt,
      });
    });

    // 2. Review completed events (from feedback)
    activeLocFeedbacks.forEach(f => {
      if (!f.createdAt || !f.requestId) return;
      events.push({
        id: `fb-${f.id}`,
        type: 'review_completed',
        guestName: getCustomerName(f.requestId),
        guestInitials: getCustomerInitials(f.requestId),
        timestamp: f.createdAt,
      });
    });

    // Sort by timestamp descending, take top 10
    return events
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);
  }, [activeLocRequests, activeLocFeedbacks, reviewRequests, orders, customers]);

  // ===== EMPTY STATE =====

  const hasNoData = activeLocRequests.length === 0;

  if (hasNoData) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
            <p className="text-sm text-slate-500 mt-1">Track your review performance over time.</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center flex flex-col items-center justify-center space-y-4">
          <BarChart3 className="h-10 w-10 text-slate-300 mx-auto mb-2" />
          <h3 className="text-lg font-semibold text-slate-700">No analytics data yet</h3>
          <p className="text-sm text-slate-400 max-w-md">
            Send your first review request to see analytics here.
          </p>
          <Link
            to="/import"
            className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-2.5 px-5 rounded-xl shadow-sm transition-all"
          >
            <Send className="h-4 w-4" />
            <span>Import Guests</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Track your review performance over time.</p>
        </div>

        {/* Time Range Toggle */}
        <div className="inline-flex items-center bg-slate-100 rounded-xl p-0.5 shadow-sm">
          {([
            { value: '30d' as const, label: 'Last 30 days' },
            { value: '90d' as const, label: 'Last 90 days' },
            { value: 'all' as const, label: 'All time' },
          ]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTimeRange(value)}
              className={cn(
                'px-4 py-2 text-sm font-semibold rounded-lg transition-all',
                timeRange === value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Reviews Requested */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:scale-110 transition-transform">
            <Send className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Reviews Requested</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-bold text-slate-900 tracking-tight">
              {timeRange === 'all' ? activeLocRequests.length : reviewsRequested}
            </span>
          </div>
          <div className="mt-4 flex items-center space-x-1 text-xs">
            {reviewTrend !== null ? (
              <span className={cn(
                'inline-flex items-center font-semibold px-2 py-0.5 rounded-full',
                reviewTrend >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'
              )}>
                {reviewTrend >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 mr-1" />
                )}
                {reviewTrend >= 0 ? '+' : ''}{reviewTrend}% vs prev period
              </span>
            ) : (
              <span className="inline-flex items-center font-semibold text-slate-400 px-2 py-0.5 rounded-full bg-slate-50">
                <Minus className="h-3.5 w-3.5 mr-1" />
                No prior data
              </span>
            )}
          </div>
        </div>

        {/* Reviews Completed */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform">
            <CheckCircle className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Reviews Completed</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-bold text-slate-900 tracking-tight">{reviewsCompleted}</span>
          </div>
          <div className="mt-4 flex items-center space-x-1 text-xs">
            {completedTrend !== null ? (
              <span className={cn(
                'inline-flex items-center font-semibold px-2 py-0.5 rounded-full',
                completedTrend >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'
              )}>
                {completedTrend >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 mr-1" />
                )}
                {completedTrend >= 0 ? '+' : ''}{completedTrend}% vs prev period
              </span>
            ) : (
              <span className="inline-flex items-center font-semibold text-slate-400 px-2 py-0.5 rounded-full bg-slate-50">
                <Minus className="h-3.5 w-3.5 mr-1" />
                No prior data
              </span>
            )}
          </div>
        </div>

        {/* Private Feedback Caught */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 p-3 bg-violet-50 text-violet-600 rounded-xl group-hover:scale-110 transition-transform">
            <MessageSquare className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Private Feedback Caught</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-bold text-slate-900 tracking-tight">{privateFeedbackCaught}</span>
          </div>
          <div className="mt-4 flex items-center space-x-1 text-xs">
            <span className="inline-flex items-center font-semibold text-slate-400 px-2 py-0.5 rounded-full bg-slate-50">
              <Minus className="h-3.5 w-3.5 mr-1" />
              {timeRange === 'all' ? 'All time' : 'Period'}
            </span>
          </div>
        </div>

        {/* Average Rating */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 p-3 bg-amber-50 text-amber-600 rounded-xl group-hover:scale-110 transition-transform">
            <Star className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Average Rating</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-bold text-slate-900 tracking-tight">
              {averageRating > 0 ? averageRating.toFixed(1) : '—'}
            </span>
            {averageRating > 0 && (
              <span className="text-sm text-slate-400">/ 5</span>
            )}
          </div>
          <div className="mt-4 flex items-center space-x-1 text-xs">
            <span className="inline-flex items-center font-semibold text-slate-400 px-2 py-0.5 rounded-full bg-slate-50">
              <Star className="h-3.5 w-3.5 mr-1 text-amber-400" />
              {activeLocFeedbacks.length} total reviews
            </span>
          </div>
        </div>
      </div>

      {/* Line Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-6">Requested vs Completed</h2>
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
                  name="Requested"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#6366f1' }}
                />
                <Line
                  type="monotone"
                  dataKey="completed"
                  name="Completed"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#10b981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex items-center justify-center h-72 text-slate-400 text-sm">
            No data available for the selected period.
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-900 flex items-center">
            <BarChart3 className="h-5 w-5 mr-2 text-indigo-600" />
            Recent Activity
          </h2>
        </div>

        {recentActivity.length > 0 ? (
          <div className="divide-y divide-slate-50">
            {recentActivity.map((event) => (
              <div
                key={event.id}
                className="px-6 py-4 flex items-center space-x-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="h-9 w-9 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                  {event.guestInitials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {event.guestName}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center">
                    {event.type === 'request_sent' ? (
                      <>
                        <Send className="h-3 w-3 mr-1 text-indigo-400" />
                        Review request sent
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1 text-emerald-400" />
                        Review completed
                      </>
                    )}
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {timeAgo(event.timestamp)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-slate-400 text-sm">
            No recent activity for the selected period.
          </div>
        )}
      </div>
    </div>
  );
}