import { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * A resting surface: hairline border, no shadow. Depth is reserved for things
 * that genuinely float — menus, toasts, the guest drawer. A page of shadowed
 * cards reads as busy before a single word is read.
 */
export function Card({ children, className }: CardProps) {
  return (
    <div className={cn('rounded-xl border border-line bg-card', className)}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Semantic tone for the icon chip. 'indigo' is kept as an alias for 'brand'
   *  so existing callers keep working while the app finishes migrating. */
  tone?: 'brand' | 'indigo' | 'red' | 'emerald' | 'amber';
  action?: React.ReactNode;
}

const toneClasses = {
  brand: { chip: 'bg-brand-50', icon: 'text-brand-600', title: 'text-ink' },
  indigo: { chip: 'bg-brand-50', icon: 'text-brand-600', title: 'text-ink' },
  red: { chip: 'bg-critical-soft', icon: 'text-critical', title: 'text-critical' },
  emerald: { chip: 'bg-positive-soft', icon: 'text-positive', title: 'text-ink' },
  amber: { chip: 'bg-caution-soft', icon: 'text-caution', title: 'text-ink' },
};

export function CardHeader({ icon: Icon, title, description, tone = 'brand', action }: CardHeaderProps) {
  const t = toneClasses[tone];
  return (
    <div className="flex items-center gap-3">
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', t.chip)}>
        <Icon className={cn('h-[18px] w-[18px]', t.icon)} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className={cn('text-[15px] font-semibold', t.title)}>{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
