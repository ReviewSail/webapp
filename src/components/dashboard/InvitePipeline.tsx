import { cn } from '../../lib/utils';
import { Metric } from '../ui/Metric';

interface InvitePipelineProps {
  totalSent: number;
  totalPending: number;
  deliveryRate: number;
  clickRate: number;
  totalClicked: number;
  totalOptedOut: number;
  loading?: boolean;
}

/*
 * The dashboard's one signature element, and the only place on the screen that
 * wears the brand gradient.
 *
 * It replaces three stat cards that showed the same numbers side by side but
 * never showed the relationship between them. A review invite genuinely is an
 * ordered journey — queued, delivered, clicked — so a proportional bar encodes
 * something true rather than decorating. The gradient lands on "clicked",
 * because that is the segment the whole product exists to grow.
 *
 * Opt-outs are drawn detached from the run of stages: leaving is leakage, not a
 * step, and stacking it inline would imply guests progress into it.
 */
export function InvitePipeline({
  totalSent,
  totalPending,
  deliveryRate,
  clickRate,
  totalClicked,
  totalOptedOut,
  loading,
}: InvitePipelineProps) {
  // Real numbers only. Rendering zeros mid-fetch told an account with hundreds
  // of guests that it had none, which reads as lost data rather than loading.
  if (loading) {
    return (
      <section className="rounded-xl border border-line bg-card p-5" aria-hidden="true">
        <div className="animate-pulse space-y-5">
          <div className="h-4 w-32 rounded bg-line" />
          <div className="h-10 rounded-lg bg-line/60" />
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-16 rounded bg-line/70" />
                <div className="h-7 w-12 rounded bg-line" />
              </div>
            ))}
          </div>
        </div>
        <span className="sr-only">Loading your invite pipeline…</span>
      </section>
    );
  }

  // Everything that has ever entered the pipeline for this location.
  const total = totalPending + totalSent + totalOptedOut;
  // totalSent already counts guests who went on to click, so the middle band is
  // the remainder — delivered, but not yet engaged.
  const awaitingClick = Math.max(totalSent - totalClicked, 0);
  const isEmpty = total === 0;

  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  // Left to right in journey order, matching the label row beneath — position
  // is the whole point of a bar like this, so the two must agree. Colour
  // deepens as guests get further along, ending on the gradient.
  const segments = [
    { key: 'queued', value: totalPending, className: 'bg-brand-50 ring-1 ring-inset ring-brand-100' },
    { key: 'awaiting', value: awaitingClick, className: 'bg-brand-200' },
    {
      key: 'clicked',
      value: totalClicked,
      // Solid, not the gradient: ResultsHero owns the screen's one gradient.
      // This is still the darkest segment, so it stays the destination the eye
      // travels toward.
      className: 'bg-brand-800',
    },
  ].filter((s) => s.value > 0);

  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[15px] font-semibold text-ink">Invite pipeline</h2>
        <p className="tnum text-xs text-ink-muted">
          {isEmpty ? 'No invites yet' : `${total.toLocaleString()} invites all time`}
        </p>
      </div>

      {/* The bar */}
      <div className="mt-4 flex items-stretch gap-2">
        <div
          className="flex h-10 flex-1 items-stretch gap-0.5 overflow-hidden rounded-lg bg-canvas"
          role="img"
          aria-label={
            isEmpty
              ? 'Invite pipeline is empty'
              : `${totalClicked} clicked, ${awaitingClick} delivered awaiting a click, ${totalPending} queued, ${totalOptedOut} opted out`
          }
        >
          {isEmpty ? (
            // An empty screen is an invitation to act, so the empty bar still
            // teaches the shape of the journey rather than showing a blank box.
            <div className="flex flex-1 items-center gap-0.5 rounded-lg border border-dashed border-line px-1">
              {['Queued', 'Delivered', 'Clicked'].map((label) => (
                <span
                  key={label}
                  className="flex-1 text-center text-[11px] font-medium text-ink-muted"
                >
                  {label}
                </span>
              ))}
            </div>
          ) : (
            segments.map((s) => (
              <div
                key={s.key}
                className={cn('origin-left animate-grow-x', s.className)}
                style={{ width: `${pct(s.value)}%` }}
              />
            ))
          )}
        </div>

        {/* Leakage, deliberately detached from the run of stages. */}
        {totalOptedOut > 0 && (
          <div
            className="h-10 w-2 shrink-0 rounded-lg bg-ink-faint/30"
            title={`${totalOptedOut} opted out`}
            aria-hidden="true"
          />
        )}
      </div>

      {/* The numbers, in journey order. Labels stay to one line — a wrapping
          label pushes its figure out of line with the rest of the row. */}
      <div className="mt-5 grid grid-cols-2 items-start gap-x-6 gap-y-5 sm:grid-cols-4">
        <Metric
          label="Queued"
          value={totalPending.toLocaleString()}
          sub={totalPending === 0 ? 'Outbox is clear' : 'Waiting to send'}
        />
        <Metric
          label="Delivered"
          value={totalSent.toLocaleString()}
          // A rate needs a denominator to mean anything. With nothing attempted,
          // "100% of attempted" is technically true and completely useless.
          sub={totalSent === 0 && totalPending === 0 ? 'Nothing sent yet' : `${deliveryRate}% of attempted`}
        />
        <Metric
          label="Clicked"
          value={totalClicked.toLocaleString()}
          sub={totalSent === 0 ? 'Awaiting delivery' : `${clickRate}% of delivered`}
        />
        <Metric
          label="Opted out"
          value={totalOptedOut.toLocaleString()}
          sub={totalOptedOut === 0 ? 'Nobody unsubscribed' : "Won't be contacted again"}
        />
      </div>
    </section>
  );
}
