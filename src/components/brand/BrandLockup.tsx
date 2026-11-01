import { cn } from '../../lib/utils'
import { BrandMark, type BrandMarkSize } from './BrandMark'

export interface BrandLockupProps {
  href?: string
  onDark?: boolean
  compact?: boolean
  size?: BrandMarkSize
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