import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { Card } from './card'

export interface ChartCardProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

/** Chart shell: title rack, toolbar slot, plot area, source/legend footer. */
export function ChartCard({ title, description, actions, children, footer, className }: ChartCardProps) {
  return (
    <Card className={cn('flex min-w-0 flex-col gap-4 p-5 shadow-none', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="min-w-0">{children}</div>
      {footer && <div className="border-t border-line pt-3 text-xs text-muted">{footer}</div>}
    </Card>
  )
}
