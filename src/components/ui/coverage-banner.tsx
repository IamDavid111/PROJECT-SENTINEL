import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { Badge } from './badge'
import { Icon } from './icon'

export type CoverageStatus = 'complete' | 'partial' | 'empty'

export interface CoverageBannerProps {
  scope: ReactNode
  windowLabel: ReactNode
  snapshot: ReactNode
  status?: CoverageStatus
  className?: string
}

const STATUS_META: Record<CoverageStatus, { tone: 'success' | 'warning' | 'neutral'; label: string }> = {
  complete: { tone: 'success', label: 'Complete coverage' },
  partial: { tone: 'warning', label: 'Partial coverage' },
  empty: { tone: 'neutral', label: 'No data' },
}

/** Analytics header strip: scope, window, UTC snapshot and coverage state. */
export function CoverageBanner({ scope, windowLabel, snapshot, status = 'complete', className }: CoverageBannerProps) {
  const meta = STATUS_META[status]
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm', className)}>
      <span className="flex items-center gap-2 font-medium text-foreground">
        <Icon name="administration" size={15} className="text-brand" />
        {scope}
      </span>
      <span className="text-line" aria-hidden="true">·</span>
      <span className="text-muted">{windowLabel}</span>
      <span className="text-line" aria-hidden="true">·</span>
      <span className="font-mono text-xs text-muted">Snapshot: {snapshot} (UTC)</span>
      <Badge tone={meta.tone} className="ml-auto">{meta.label}</Badge>
    </div>
  )
}
