import { useMemo } from 'react';
import { ArrowUpRight, TrendingUp } from 'lucide-react';
import type { ReviewRequest, MessageEvent } from '../../context/ReviewSailContext';

interface ResultsHeroProps {
  locationName: string;
  /** Requests for the active location only. */
  requests: ReviewRequest[];
  /** Message events for those requests. */
  events: MessageEvent[];
  totalClicked: number;
  loading?: boolean;
  onImportGuests: () => void;
}

const DAYS = 30;

/** YYYY-MM-DD in the viewer's own zone, so "today" means their today. */
const dayKey = (value: string | Date): string => {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * A smooth path through evenly spaced points, as a Catmull-Rom spline converted
 * to cubic béziers. A polyline through 30 daily counts reads as noise; the
 * curve reads as a trend, which is the only thing anyone takes from a chart
 * this small.
 */
function smoothPath(values: number[], w: number, h: number, max: number): string {
  if (values.length === 0) return '';
  const stepX = w / Math.max(values.length - 1, 1);
  const pt = (i: number) => [i * stepX, h - (values[i] / (max || 1)) * h] as const;

  let d = `M ${pt(0)[0]} ${pt(0)[1]}`;
  for (let i = 0; i < values.length - 1; i++) {
    const [x0, y0] = pt(Math.max(i - 1, 0));
    const [x1, y1] = pt(i);
    const [x2, y2] = pt(i + 1);
    const [x3, y3] = pt(Math.min(i + 2, values.length - 1));
    const c1x = x1 + (x2 - x0) / 6, c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6, c2y = y2 - (y3 - y1) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
  }
  return d;
}

/**
 * The dashboard's opening statement, and the only element on the screen wearing
 * the brand gradient.
 *
 * It leads with the single outcome the product exists to produce — guests who
 * actually reached the Google review page — rather than with machinery. The
 * two-series sparkline behind it is the argument: invites sent as a soft band,
 * click-throughs as the solid line, so the gap between them is the drop-off.
 */
export function ResultsHero({
  locationName,
  requests,
  events,
  totalClicked,
  loading,
  onImportGuests,
}: ResultsHeroProps) {
  const { sent, clicked, last7, prev7, peak } = useMemo(() => {
    const days: string[] = [];
    const today = new Date();
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(dayKey(d));
    }
    const index = new Map(days.map((d, i) => [d, i]));

    const sentSeries = new Array(DAYS).fill(0);
    const clickSeries = new Array(DAYS).fill(0);

    for (const r of requests) {
      if (!r.sentAt) continue;
      const i = index.get(dayKey(r.sentAt));
      if (i !== undefined) sentSeries[i] += 1;
    }

    const requestIds = new Set(requests.map(r => r.id));
    for (const e of events) {
      if (e.eventType !== 'clicked' || !requestIds.has(e.requestId)) continue;
      const i = index.get(dayKey(e.createdAt));
      if (i !== undefined) clickSeries[i] += 1;
    }

    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    return {
      sent: sentSeries,
      clicked: clickSeries,
      last7: sum(clickSeries.slice(-7)),
      prev7: sum(clickSeries.slice(-14, -7)),
      peak: Math.max(...sentSeries, ...clickSeries, 1),
    };
  }, [requests, events]);

  const hasHistory = sent.some(v => v > 0) || clicked.some(v => v > 0);
  const delta = last7 - prev7;

  const W = 320, H = 88;
  // Headroom, so a peak day doesn't collide with the card's top edge — and so
  // the curve reads as a shape rather than something clipped.
  const ceiling = peak * 1.15;
  const sentPath = smoothPath(sent, W, H, ceiling);
  const clickPath = smoothPath(clicked, W, H, ceiling);

  if (loading) {
    return (
      <section className="brand-gradient rounded-xl p-6" aria-hidden="true">
        <div className="animate-pulse space-y-3">
          <div className="h-3 w-28 rounded bg-white/20" />
          <div className="h-10 w-24 rounded bg-white/30" />
          <div className="h-3 w-44 rounded bg-white/20" />
        </div>
        <span className="sr-only">Loading your results…</span>
      </section>
    );
  }

  return (
    <section className="brand-gradient relative overflow-hidden rounded-xl px-6 py-6 text-white">
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-[0.14em] text-white/60">
            {locationName}
          </p>

          {hasHistory ? (
            <>
              <p className="tnum mt-3 text-5xl font-semibold leading-none tracking-[-0.04em]">
                {totalClicked.toLocaleString()}
              </p>
              <p className="mt-2 max-w-xs text-sm text-white/75">
                {totalClicked === 1 ? 'guest has' : 'guests have'} opened your review page
              </p>
              {(last7 > 0 || prev7 > 0) && (
                <p className="tnum mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-xs font-medium text-white">
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                  {last7} in the last 7 days
                  {delta !== 0 && (
                    <span className="text-white/60">
                      {delta > 0 ? `· up ${delta}` : `· down ${Math.abs(delta)}`}
                    </span>
                  )}
                </p>
              )}
            </>
          ) : (
            // An empty screen is an invitation to act, not a report of nothing.
            <>
              <p className="mt-3 max-w-sm text-2xl font-semibold leading-snug tracking-[-0.02em]">
                Your first review is one import away.
              </p>
              <p className="mt-2 max-w-sm text-sm text-white/75">
                Bring in a checkout report and ReviewSail invites each guest the day they leave.
              </p>
              <button
                onClick={onImportGuests}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-white/90"
              >
                Import guests
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        {hasHistory && (
          <div className="w-full shrink-0 sm:w-[320px]">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="h-20 w-full"
              role="img"
              aria-label={`Invites sent and review pages opened over the last ${DAYS} days`}
            >
              <defs>
                <linearGradient id="rs-sent-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fff" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Invites sent — the soft band */}
              <path d={`${sentPath} L ${W} ${H} L 0 ${H} Z`} fill="url(#rs-sent-fill)" />
              <path d={sentPath} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.5" />
              {/* Opened the review page — the point of the whole thing */}
              <path
                d={clickPath}
                fill="none"
                stroke="#fff"
                strokeWidth="2.5"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div className="mt-2 flex items-center justify-end gap-4 text-[11px] text-white/75">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full bg-white/40" />
                Sent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full bg-white" />
                Opened
              </span>
              <span>{DAYS} days</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
