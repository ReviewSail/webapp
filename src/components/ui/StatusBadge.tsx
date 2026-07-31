import { cn } from '../../lib/utils';

/**
 * One status vocabulary for review requests. Previously duplicated in
 * RecentRequestsTable and GuestDetailPanel, where the two colour maps had
 * already drifted apart.
 */
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  sent: 'bg-blue-50 text-blue-700 border-blue-200',
  clicked: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  opted_out: 'bg-red-50 text-red-600 border-red-200',
  expired: 'bg-slate-50 text-slate-500 border-slate-200',
  already_reviewed: 'bg-violet-50 text-violet-700 border-violet-200',
  private_feedback: 'bg-slate-50 text-slate-600 border-slate-300',
};

const SHORT_LABELS: Record<string, string> = {
  pending: 'Pending',
  sent: 'Sent',
  clicked: 'Clicked',
  opted_out: 'Opted Out',
  expired: 'Expired',
  already_reviewed: 'Reviewed',
  private_feedback: 'Private Feedback',
};

/** The detail drawer has room to say what the status actually means. */
const LONG_LABELS: Record<string, string> = {
  pending: 'Awaiting Send',
  sent: 'Invite Sent',
  clicked: 'Feedback Received',
  opted_out: 'Opted Out',
  expired: 'Expired',
  already_reviewed: 'Already Reviewed',
  private_feedback: 'Private Feedback',
};

interface StatusBadgeProps {
  status: string;
  /** 'pill' is the table badge; 'detailed' is the larger drawer badge with a dot. */
  variant?: 'pill' | 'detailed';
  className?: string;
}

export function StatusBadge({ status, variant = 'pill', className }: StatusBadgeProps) {
  const color = STATUS_COLORS[status] || 'bg-slate-50 text-slate-600 border-slate-200';
  const labels = variant === 'detailed' ? LONG_LABELS : SHORT_LABELS;
  const label = labels[status] || status;

  if (variant === 'detailed') {
    return (
      <div
        className={cn(
          'px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center space-x-1.5 border',
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
    <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-semibold border', color, className)}>
      {label}
    </span>
  );
}
