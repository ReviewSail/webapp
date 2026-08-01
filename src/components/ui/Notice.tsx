import { AlertCircle, AlertTriangle, CheckCircle2, Info, X, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

type Tone = 'info' | 'caution' | 'critical' | 'positive';

interface NoticeProps {
  tone?: Tone;
  title: string;
  /** Supporting line. Say what to do about it, not just what happened. */
  children?: React.ReactNode;
  /** Right-aligned action, e.g. a Button. */
  action?: React.ReactNode;
  onDismiss?: () => void;
  icon?: LucideIcon;
  className?: string;
}

const tones: Record<Tone, { wrap: string; icon: string; title: string; glyph: LucideIcon }> = {
  info: { wrap: 'bg-brand-50 border-brand-100', icon: 'text-brand-600', title: 'text-brand-900', glyph: Info },
  caution: { wrap: 'bg-caution-soft border-caution/20', icon: 'text-caution', title: 'text-caution', glyph: AlertTriangle },
  critical: { wrap: 'bg-critical-soft border-critical/20', icon: 'text-critical', title: 'text-critical', glyph: AlertCircle },
  positive: { wrap: 'bg-positive-soft border-positive/20', icon: 'text-positive', title: 'text-positive', glyph: CheckCircle2 },
};

/**
 * The flat inline alert. Replaces the hand-rolled amber box that was pasted
 * into pages one at a time, each with slightly different padding.
 *
 * Deliberately quiet: a notice is not the most important thing on a screen, so
 * it never gets the brand gradient and never gets a shadow.
 */
export function Notice({ tone = 'info', title, children, action, onDismiss, icon, className }: NoticeProps) {
  const t = tones[tone];
  const Glyph = icon ?? t.glyph;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-3 rounded-xl border px-4 py-3',
        t.wrap,
        className
      )}
    >
      {/* The min-width is what makes this responsive: once the message can no
          longer hold its floor, the action wraps to its own line instead of
          being squeezed into the middle of the sentence. */}
      <div className="flex min-w-[15rem] flex-1 items-start gap-3">
        <Glyph className={cn('mt-0.5 h-4 w-4 shrink-0', t.icon)} aria-hidden="true" />
        <div className="min-w-0">
          <p className={cn('text-sm font-medium', t.title)}>{title}</p>
          {children && <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{children}</p>}
        </div>
      </div>
      {(action || onDismiss) && (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {action}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="-mr-1 rounded-md p-1 text-ink-faint transition-colors hover:bg-black/5 hover:text-ink-muted"
              aria-label={`Dismiss: ${title}`}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
