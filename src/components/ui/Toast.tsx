import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastRecord {
  id: number;
  variant: ToastVariant;
  message: string;
}

interface ToastOptions {
  /** Override the default dismiss delay, in ms. Use for messages that take longer to read. */
  duration?: number;
}

interface ToastApi {
  success: (message: string, opts?: ToastOptions) => void;
  error: (message: string, opts?: ToastOptions) => void;
  info: (message: string, opts?: ToastOptions) => void;
}

const ToastContext = createContext<{ toast: ToastApi } | undefined>(undefined);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

const VARIANTS: Record<ToastVariant, { className: string; icon: typeof CheckCircle; iconClass: string }> = {
  success: {
    className: 'bg-positive-soft border-positive/20 text-positive',
    icon: CheckCircle,
    iconClass: 'text-positive',
  },
  error: {
    className: 'bg-critical-soft border-critical/20 text-critical',
    icon: AlertCircle,
    iconClass: 'text-critical',
  },
  info: {
    className: 'bg-card border-line text-ink',
    icon: Info,
    iconClass: 'text-brand-600',
  },
};

// Errors stay long enough to read and act on; confirmations get out of the way.
const DURATIONS: Record<ToastVariant, number> = { success: 4000, info: 4000, error: 6000 };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string, opts?: ToastOptions) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, variant, message }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), opts?.duration ?? DURATIONS[variant])
      );
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toast: {
        success: (message: string, opts?: ToastOptions) => push('success', message, opts),
        error: (message: string, opts?: ToastOptions) => push('error', message, opts),
        info: (message: string, opts?: ToastOptions) => push('info', message, opts),
      },
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          className="fixed bottom-4 right-4 left-4 md:left-auto md:bottom-6 md:right-6 z-[100] flex flex-col items-stretch md:items-end space-y-2 pointer-events-none"
          aria-live="polite"
          aria-atomic="false"
        >
          {toasts.map((t) => {
            const v = VARIANTS[t.variant];
            const Icon = v.icon;
            return (
              <div
                key={t.id}
                role={t.variant === 'error' ? 'alert' : 'status'}
                className={cn(
                  'pointer-events-auto flex items-start space-x-2.5 p-4 rounded-xl border shadow-lg text-sm md:max-w-sm animate-toast-in',
                  v.className
                )}
              >
                <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', v.iconClass)} />
                <span className="flex-1">{t.message}</span>
                <button
                  onClick={() => dismiss(t.id)}
                  className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}
