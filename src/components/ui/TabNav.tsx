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
    <div className="border-b border-slate-200">
      {/* Settings has six tabs; on a phone they scroll rather than wrap. */}
      <nav className="flex space-x-6 overflow-x-auto" role="tablist">
        {tabs.map(({ key, label, icon: Icon, badge }) => (
          <button
            key={key}
            role="tab"
            aria-selected={active === key}
            onClick={() => onChange(key)}
            className={cn(
              'pb-3 px-1 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-2 shrink-0',
              active === key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
            {badge !== undefined && badge > 0 && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white min-w-[18px] h-4">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
