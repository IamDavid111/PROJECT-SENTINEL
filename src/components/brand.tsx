import { cn } from '../lib/utils'

const MARK_SIZES = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
} as const

export interface BrandMarkProps {
  size?: keyof typeof MARK_SIZES
  className?: string
}

/** The SentinelQHSE shield mark. Rendered at three sizes across the app. */
export function BrandMark({ size = 'lg', className }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm',
        MARK_SIZES[size],
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-[55%] w-[55%]">
        <path
          d="M12 3.5 19 6v5.7c0 4.2-2.7 7.9-7 9.3-4.3-1.4-7-5.1-7-9.3V6l7-2.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="m9.2 12 1.8 1.8 3.9-4.2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

export interface BrandLockupProps {
  href?: string
  onDark?: boolean
  compact?: boolean
  size?: keyof typeof MARK_SIZES
  className?: string
}

/** Mark + wordmark + optional descriptor. Used by the public header/footer. */
export function BrandLockup({ href = '#top', onDark = false, compact = false, size = 'md', className }: BrandLockupProps) {
  return (
    <a href={href} className={cn('inline-flex min-w-0 items-center gap-2.5', className)} aria-label="SentinelQHSE home">
      <BrandMark size={size} />
      <span className="grid min-w-0 gap-0.5 leading-none">
        <span className={cn('truncate font-display text-sm font-semibold tracking-tight', onDark ? 'text-white' : 'text-foreground')}>
          SentinelQHSE<sup className="text-[8px]">™</sup>
        </span>
        {!compact && (
          <span className={cn('text-[9px] font-semibold uppercase tracking-[0.16em]', onDark ? 'text-slate-400' : 'text-muted')}>
            Safety intelligence
          </span>
        )}
      </span>
    </a>
  )
}
