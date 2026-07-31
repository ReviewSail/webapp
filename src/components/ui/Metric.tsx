import { cn } from '../../lib/utils';

interface MetricProps {
  /** Sentence case. Not uppercase-tracked — that treatment is what truncated
   *  "Review Link Click Rate" into "REVIEW LINK CLICK RA". */
  label: string;
  value: React.ReactNode;
  /** The denominator or the qualifier. A data slot holds data, not slogans. */
  sub?: React.ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * A label, a figure, and the thing that makes the figure mean something.
 *
 * There is no icon chip and no status pill. The old cards carried "Active" and
 * "Live" badges that asserted nothing and an icon that sat on top of its own
 * label.
 */
export function Metric({ label, value, sub, size = 'md', className }: MetricProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="truncate text-xs font-medium text-ink-muted">{label}</p>
      <p
        className={cn(
          'tnum mt-1 font-semibold tracking-[-0.03em] text-ink',
          size === 'md' ? 'text-3xl' : 'text-xl'
        )}
      >
        {value}
      </p>
      {sub && <p className="tnum mt-1 text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}
