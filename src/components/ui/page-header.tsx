import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

export interface PageHeaderProps {
  /** Small uppercase signpost with the green field rule ("OPERATIONS & QHSE"). */
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Right-aligned actions. */
  actions?: ReactNode
  className?: string
}

/**
 * The "status board" rack every surface opens with: eyebrow rule, display title,
 * optional description, and actions anchored to the end. Structure carries the
 * page hierarchy instead of decoration.
 */
export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="flex flex-col gap-1.5">
        {eyebrow && (
          <div className="flex items-center gap-2">
            <span className="h-px w-6 bg-brand" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{eyebrow}</span>
          </div>
        )}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description && <p className="max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}