import { cn } from '../../lib/utils'

export interface SpinnerProps {
  size?: number | string
  label?: string
  className?: string
  /** Stroke colour for the spinner ring. Defaults to white for brand/dark surfaces. */
  fill?: string
}

/**
 * Ring spinner: a faint full track with a bright sweeping arc. Deliberately
 * stroked (not a filled wedge) so it reads as a conventional loading spinner.
 */
export function Spinner({ size = 20, label = 'Loading…', className, fill = '#fff' }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className="animate-spin motion-reduce:animate-none"
        aria-hidden="true"
        focusable="false"
      >
        {/* Track */}
        <circle cx="12" cy="12" r="9" fill="none" stroke={fill} strokeOpacity="0.22" strokeWidth="2.5" />
        {/* Sweeping arc (~1/4 of the circumference) */}
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke={fill}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="14 43"
        />
      </svg>
    </span>
  )
}

export function SpinnerCenter({
  label = 'Loading…',
  className,
  fill = '#fff',
}: {
  label?: string
  className?: string
  fill?: string
}) {
  return (
    <div className={cn('flex items-center justify-center p-8', className)} role="status" aria-label={label}>
      <Spinner size={24} fill={fill} />
    </div>
  )
}