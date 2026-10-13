import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { Card } from './card'
import { Icon, type IconProps } from './icon'
import { SignalBar } from './signal-bar'
import { isSeverityLevel, type SeverityLevel } from './severity'

export interface KpiCardProps {
  label: ReactNode
  value: ReactNode
  /** Optional severity for the signal bar gutter. */
  severity?: SeverityLevel | string | null
  icon?: IconProps['name']
  /** Small footnote under the value ("Across all sites"). */
  hint?: ReactNode
  /** Uppercase datapoint appended to the label row ("+12%"). */
  change?: ReactNode
  changeTone?: 'up' | 'down' | 'neutral'
  className?: string
}

/**
 * Metric tile: label, display-face tabular value, optional severity signal bar,
 * optional icon, and a datapoint/footnote row. Numerals use tabular figures so
 * columns of cards read as instruments, not badges.
 */
export function KpiCard({
  label,
  value,
  severity,
  icon,
  hint,
  change,
  changeTone = 'neutral',
  className,
}: KpiCardProps) {
  const level = isSeverityLevel(severity) ? severity : null
  return (
    <Card className={cn('flex flex-col gap-2 p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-muted">
          {icon ? (
            <Icon name={icon} size={16} />
          ) : level ? (
            <SignalBar severity={level} />
          ) : null}
          <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
        </div>
        {change && (
          <span
            className={cn(
              'rounded-full border border-line bg-surface-soft px-2 py-0.5 text-xs font-medium',
              changeTone === 'up' && 'text-brand-dark',
              changeTone === 'down' && 'text-danger',
            )}
          >
            {change}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </span>
        {level && <SignalBar severity={level} label="Severity" className="self-center" />}
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </Card>
  )
}