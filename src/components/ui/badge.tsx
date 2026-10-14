import type { ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'
import { SignalBar } from './signal-bar'
import { SEVERITY_META, isSeverityLevel, type SeverityLevel } from './severity'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-line bg-surface-soft text-muted',
        success: 'border-brand/25 bg-brand/10 text-brand-dark',
        warning: 'border-caution/30 bg-caution/10 text-foreground',
        danger: 'border-danger/25 bg-danger/10 text-danger',
        accent: 'border-accent/30 bg-accent/10 text-foreground',
        info: 'border-ink/20 bg-ink/5 text-ink-2',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
)

export interface BadgeProps extends VariantProps<typeof badgeVariants> {
  tone?: NonNullable<VariantProps<typeof badgeVariants>['tone']>
  className?: string
  children: ReactNode
}

export function Badge({ tone, className, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {children}
    </span>
  )
}

export interface SeverityBadgeProps {
  severity: SeverityLevel | string | null | undefined
  /** Show the worded label ("High") next to the signal bar. */
  label?: boolean
  className?: string
}

/**
 * Severity rendered with the signal bar + optional worded label. Falls back to
 * a neutral "Not set" when the value isn't a known severity level.
 */
export function SeverityBadge({ severity, label = true, className }: SeverityBadgeProps) {
  const level = isSeverityLevel(severity) ? severity : null
  if (!level) {
    return <Badge tone="neutral" className={className}>Not set</Badge>
  }
  return (
    <Badge
      tone="neutral"
      className={cn('border-transparent bg-transparent px-1 py-0', className)}
    >
      <SignalBar severity={level} label={SEVERITY_META[level].label} />
      {label && <span className="text-foreground">{SEVERITY_META[level].label}</span>}
    </Badge>
  )
}