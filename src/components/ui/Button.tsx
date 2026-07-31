import { forwardRef } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Leading icon. Sized automatically — pass the component, not an element. */
  icon?: LucideIcon;
  /** Swaps the icon for a spinner and disables the button. */
  loading?: boolean;
  /** Stretches to the container. */
  block?: boolean;
}

/*
 * The primary button is a flat brand blue, not the brand gradient. The gradient
 * belongs to exactly one element per screen (see .brand-gradient in index.css),
 * and a page almost always has a primary action — so if buttons wore it, the
 * rule would be broken on every screen by definition.
 */
const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm shadow-brand-900/10',
  secondary: 'bg-card text-ink border border-line hover:bg-canvas active:bg-line/60',
  ghost: 'text-ink-muted hover:bg-canvas hover:text-ink active:bg-line/60',
  danger: 'bg-critical text-white hover:bg-critical/90 active:bg-critical/80',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-sm gap-2 rounded-xl',
};

const iconSizes: Record<Size, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-4 w-4',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon: Icon, loading, block, className, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className={cn(iconSizes[size], 'animate-spin')} aria-hidden="true" />
      ) : Icon ? (
        <Icon className={iconSizes[size]} aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
});
