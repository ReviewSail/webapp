import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTheme, type ThemePreference } from '../../context/ThemeContext';
import { cn } from '../../lib/utils';

type Option = {
  value: ThemePreference;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Miniature of the app in that theme. Fixed colours — a preview that
   *  followed the active theme would show you the same thing three times. */
  preview: { canvas: string; sidebar: string; card: string; line: string; ink: string };
};

const OPTIONS: Option[] = [
  {
    value: 'light',
    label: 'Light',
    hint: 'Always light',
    icon: Sun,
    preview: { canvas: '#F5F7FA', sidebar: '#002B6B', card: '#FFFFFF', line: '#E2E8F0', ink: '#0B1B33' },
  },
  {
    value: 'dark',
    label: 'Dark',
    hint: 'Always dark',
    icon: Moon,
    preview: { canvas: '#0D1521', sidebar: '#070E1C', card: '#141F2E', line: '#28374B', ink: '#E8EEF7' },
  },
  {
    value: 'system',
    label: 'System',
    hint: 'Follows your device',
    icon: Monitor,
    preview: { canvas: '#F5F7FA', sidebar: '#002B6B', card: '#FFFFFF', line: '#E2E8F0', ink: '#0B1B33' },
  },
];

/** A small wireframe of the app, so the choice is visual rather than a word. */
function ThemePreview({ p, split }: { p: Option['preview']; split?: boolean }) {
  const dark = OPTIONS[1].preview;
  return (
    <div
      className="relative flex h-16 w-full overflow-hidden rounded-md border"
      style={{ borderColor: p.line, background: p.canvas }}
      aria-hidden="true"
    >
      <div className="w-1/4 shrink-0" style={{ background: p.sidebar }} />
      <div className="flex flex-1 flex-col gap-1 p-1.5">
        <div className="h-2 w-2/3 rounded-sm" style={{ background: p.ink, opacity: 0.85 }} />
        <div className="flex-1 rounded-sm border" style={{ background: p.card, borderColor: p.line }} />
      </div>
      {/* 'System' shows both halves, because that is literally what it does. */}
      {split && (
        <div className="absolute inset-y-0 right-0 flex w-1/2 overflow-hidden">
          <div className="flex w-full" style={{ background: dark.canvas }}>
            <div className="flex flex-1 flex-col gap-1 p-1.5">
              <div className="h-2 w-2/3 rounded-sm" style={{ background: dark.ink, opacity: 0.85 }} />
              <div className="flex-1 rounded-sm border" style={{ background: dark.card, borderColor: dark.line }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppearanceSettings() {
  const { theme, resolved, setTheme } = useTheme();

  return (
    <div className="bg-card rounded-2xl border border-line shadow-sm p-6 space-y-4">
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-brand-50 rounded-xl">
          <Sun className="h-5 w-5 text-brand-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-ink">Appearance</h2>
          <p className="text-xs text-ink-muted">
            How ReviewSail looks on this device. Saved per browser, not per account.
          </p>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label="Colour theme"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {OPTIONS.map((opt) => {
          const active = theme === opt.value;
          return (
            <button
              key={opt.value}
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(opt.value)}
              className={cn(
                'group rounded-xl border p-3 text-left transition-colors',
                active
                  ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                  : 'border-line bg-card hover:border-brand-200 hover:bg-canvas'
              )}
            >
              <ThemePreview p={opt.preview} split={opt.value === 'system'} />
              <div className="mt-2.5 flex items-center gap-1.5">
                <opt.icon
                  className={cn('h-4 w-4 shrink-0', active ? 'text-brand-700' : 'text-ink-faint')}
                  aria-hidden="true"
                />
                <span className={cn('text-sm font-medium', active ? 'text-brand-800' : 'text-ink')}>
                  {opt.label}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">{opt.hint}</p>
            </button>
          );
        })}
      </div>

      {theme === 'system' && (
        <p className="text-xs text-ink-muted">
          Your device is currently set to {resolved}. ReviewSail will switch with it.
        </p>
      )}
    </div>
  );
}
