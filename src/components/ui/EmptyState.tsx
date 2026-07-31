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
  sm: { icon: 'h-8 w-8 mb-3', title: 'text-sm', description: 'text-xs' },
  md: { icon: 'h-10 w-10 mb-4', title: 'text-lg', description: 'text-sm' },
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
      <Icon className={cn('text-slate-300 mx-auto', s.icon)} />
      <h3 className={cn('font-semibold text-slate-700', s.title)}>{title}</h3>
      {description && <p className={cn('text-slate-400 mt-1', s.description)}>{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );

  if (bare) {
    return <div className={cn('p-12', className)}>{body}</div>;
  }

  return (
    <div className={cn('bg-white rounded-2xl border border-slate-200 shadow-sm p-12', className)}>
      {body}
    </div>
  );
}
