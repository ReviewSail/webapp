import { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface TabItem {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

interface TabNavProps {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
}

export function TabNav({ tabs, active, onChange }: TabNavProps) {
  return (
    <div className="border-b border-line">
      {/* Settings has six tabs; on a phone they scroll rather than wrap. */}
      <nav className="flex gap-5 overflow-x-auto" role="tablist">
        {tabs.map(({ key, label, icon: Icon, badge }) => (
          <button
            key={key}
            role="tab"
            aria-selected={active === key}
            onClick={() => onChange(key)}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors',
              active === key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-muted hover:text-ink'
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
            {badge !== undefined && badge > 0 && (
              <span className="tnum inline-flex h-4 min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
