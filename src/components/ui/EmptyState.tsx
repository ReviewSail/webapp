import { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** 'md' is a full-page empty state; 'sm' sits inside a panel that already has a header. */
  size?: 'sm' | 'md';
  /** Omit the card shell when the empty state already sits inside one. */
  bare?: boolean;
  className?: string;
}

const sizes = {
  sm: { icon: 'h-7 w-7 mb-3', title: 'text-sm', description: 'text-xs' },
  md: { icon: 'h-9 w-9 mb-4', title: 'text-base', description: 'text-sm' },
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'md',
  bare,
  className,
}: EmptyStateProps) {
  const s = sizes[size];
  const body = (
    <div className="text-center">
      <Icon className={cn('mx-auto text-ink-faint/60', s.icon)} aria-hidden="true" />
      <h3 className={cn('font-semibold text-ink', s.title)}>{title}</h3>
      {description && <p className={cn('mt-1 text-ink-muted', s.description)}>{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );

  if (bare) {
    return <div className={cn('p-12', className)}>{body}</div>;
  }

  return (
    <div className={cn('rounded-xl border border-line bg-white p-12', className)}>
      {body}
    </div>
  );
}
