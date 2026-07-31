import { cn } from '../../lib/utils';

interface PageHeaderProps {
  title: string;
  /** One line. If it needs two, it belongs in the page, not the header. */
  description?: string;
  /** Primary action, right-aligned. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Every page gets a title. Until now none of them had one — the user's only
 * clue about where they were was which sidebar item was lit.
 */
export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
