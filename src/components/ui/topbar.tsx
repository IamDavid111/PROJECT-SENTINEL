import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { Breadcrumb, type BreadcrumbItem } from './breadcrumb'

export interface TopbarProps {
  eyebrow?: ReactNode
  title: ReactNode
  breadcrumbs?: BreadcrumbItem[]
  actions?: ReactNode
  /** Optional emergency/context block shown before the actions. */
  context?: ReactNode
  className?: string
}

/** Workspace topbar: orientation rail (eyebrow · title · breadcrumb) + actions. */
export function Topbar({ eyebrow, title, breadcrumbs, actions, context, className }: TopbarProps) {
  return (
    <header className={cn('flex flex-wrap items-center justify-between gap-4 border-b border-line bg-surface px-4 py-3 sm:px-6', className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          {eyebrow && <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{eyebrow}</span>}
          <h1 className="truncate font-display text-lg font-semibold tracking-tight text-foreground">{title}</h1>
          {breadcrumbs && <Breadcrumb items={breadcrumbs} />}
        </div>
        {context && <div className="min-w-0">{context}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
