import { cn } from '../../lib/utils'
import { SEVERITY_LEVELS, SEVERITY_META, type SeverityLevel } from './severity'

export interface SignalBarProps {
  severity: SeverityLevel
  /** Number of segments in the bar. */
  segments?: number
  /** Label announced alongside the visual; pass the worded severity for screen readers. */
  label?: string
  className?: string
}

/**
 * The SentinelQHSE signature: a compact gauge that reads severity spatially —
 * 1..N segments light up as level rises (Low 1 · Medium 2 · High 3 · Critical 4).
 * Color is a reinforcement, never the only signal.
 */
export function SignalBar({ severity, segments = 4, label, className }: SignalBarProps) {
  const { level, segmentClass } = SEVERITY_META[severity]
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      role="img"
      aria-label={label ? `${label} (${SEVERITY_META[severity].label})` : SEVERITY_META[severity].label}
    >
      {SEVERITY_LEVELS.slice(0, segments).map((_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn('h-1.5 w-1.5 rounded-full transition-colors', index < level ? segmentClass : 'bg-line')}
        />
      ))}
    </span>
  )
}