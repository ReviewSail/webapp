import { useId } from 'react';

interface SailMarkProps {
  /**
   * 'bare' draws the sails alone on a transparent ground — for the sidebar and
   * mobile header, which are already dark navy, where the icon's own dark
   * container would blend into the surface behind it.
   * 'container' is the full app-icon lockup, for anywhere the mark needs to
   * stand on an unknown background.
   */
  variant?: 'bare' | 'container';
  className?: string;
  title?: string;
}

/**
 * The ReviewSail mark.
 *
 * Two sail planes with the diagonal gap between them; no hull, no waterline.
 * Kept as inline SVG rather than an <img> so it inherits crispness at any zoom
 * and can sit on either theme without a second asset.
 */
export function SailMark({ variant = 'bare', className, title }: SailMarkProps) {
  // The sidebar renders twice (desktop + mobile drawer), so gradient ids have
  // to be unique per instance or the second copy references the first's defs.
  const uid = useId().replace(/:/g, '');
  const front = `sm-front-${uid}`;
  const back = `sm-back-${uid}`;
  const cont = `sm-cont-${uid}`;
  const withContainer = variant === 'container';

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={front} x1=".05" y1="0" x2=".95" y2="1">
          <stop offset="0" stopColor="#6FC0F5" />
          <stop offset="1" stopColor="#0071C2" />
        </linearGradient>
        <linearGradient id={back} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1D80CC" />
          <stop offset="1" stopColor="#00429E" />
        </linearGradient>
        {withContainer && (
          <linearGradient id={cont} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#14294A" />
            <stop offset=".5" stopColor="#0A1728" />
            <stop offset="1" stopColor="#050C17" />
          </linearGradient>
        )}
      </defs>

      {withContainer && <rect width="64" height="64" rx="14.5" fill={`url(#${cont})`} />}

      <path d="M23.5 16.5 L28 51.5 L9.5 48.5 C12 37 17.5 25.5 23.5 16.5 Z" fill={`url(#${back})`} />
      <path
        d="M35.8 9.5 C49 22.5 56.5 37 54 49.5 L30.5 52 Z"
        fill={`url(#${front})`}
        // The gap is cut with the surface colour behind the mark. On the bare
        // variant that is the navy sidebar; on the container variant it is the
        // container itself.
        stroke={withContainer ? '#0A1728' : 'currentColor'}
        strokeWidth="3.2"
        paintOrder="stroke"
      />
    </svg>
  );
}
