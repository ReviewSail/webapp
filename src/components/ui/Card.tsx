import { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn('bg-white rounded-2xl border border-slate-200 shadow-sm', className)}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Tailwind color stem for the icon chip, e.g. 'indigo' (default) or 'red'. */
  tone?: 'indigo' | 'red' | 'emerald' | 'amber';
  action?: React.ReactNode;
}

const toneClasses = {
  indigo: { chip: 'bg-indigo-50', icon: 'text-indigo-600', title: 'text-slate-900' },
  red: { chip: 'bg-red-50', icon: 'text-red-600', title: 'text-red-700' },
  emerald: { chip: 'bg-emerald-50', icon: 'text-emerald-600', title: 'text-slate-900' },
  amber: { chip: 'bg-amber-50', icon: 'text-amber-600', title: 'text-slate-900' },
};

export function CardHeader({ icon: Icon, title, description, tone = 'indigo', action }: CardHeaderProps) {
  const t = toneClasses[tone];
  return (
    <div className="flex items-center space-x-3">
      <div className={cn('p-2 rounded-xl', t.chip)}>
        <Icon className={cn('h-5 w-5', t.icon)} />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className={cn('text-lg font-bold', t.title)}>{title}</h2>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
