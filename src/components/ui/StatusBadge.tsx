import { cn } from '../../lib/utils';

/**
 * One status vocabulary for review requests. Previously duplicated in
 * RecentRequestsTable and GuestDetailPanel, where the two colour maps had
 * already drifted apart.
 */
/*
 * Colour here carries meaning, so it is spent narrowly: brand blue for the
 * states we want (delivered, engaged, reviewed), state colours for the two that
 * need a reaction, and plain neutral for everything inert. Seven distinct hues
 * for seven statuses would make a table of guests look like a paint chart.
 */
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-caution-soft text-caution border-caution/20',
  sent: 'bg-brand-50 text-brand-700 border-brand-100',
  clicked: 'bg-positive-soft text-positive border-positive/20',
  opted_out: 'bg-critical-soft text-critical border-critical/20',
  expired: 'bg-canvas text-ink-faint border-line',
  already_reviewed: 'bg-brand-50 text-brand-800 border-brand-100',
  private_feedback: 'bg-canvas text-ink-muted border-line',
};

const SHORT_LABELS: Record<string, string> = {
  pending: 'Pending',
  sent: 'Sent',
  clicked: 'Clicked',
  opted_out: 'Opted out',
  expired: 'Expired',
  already_reviewed: 'Reviewed',
  private_feedback: 'Private feedback',
};

/** The detail drawer has room to say what the status actually means. */
const LONG_LABELS: Record<string, string> = {
  pending: 'Awaiting send',
  sent: 'Invite sent',
  clicked: 'Feedback received',
  opted_out: 'Opted out',
  expired: 'Expired',
  already_reviewed: 'Already reviewed',
  private_feedback: 'Private feedback',
};

interface StatusBadgeProps {
  status: string;
  /** 'pill' is the table badge; 'detailed' is the larger drawer badge with a dot. */
  variant?: 'pill' | 'detailed';
  className?: string;
}

export function StatusBadge({ status, variant = 'pill', className }: StatusBadgeProps) {
  const color = STATUS_COLORS[status] || 'bg-canvas text-ink-muted border-line';
  const labels = variant === 'detailed' ? LONG_LABELS : SHORT_LABELS;
  const label = labels[status] || status;

  if (variant === 'detailed') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium',
          color,
          className
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', color, className)}>
      {label}
    </span>
  );
}
