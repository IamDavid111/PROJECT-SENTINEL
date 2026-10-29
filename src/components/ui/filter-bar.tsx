import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

export interface FilterBarProps {
  children: ReactNode
  actions?: ReactNode
  className?: string
}

/** Toolbar for filter fields with actions anchored to the end. */
export function FilterBar({ children, actions, className }: FilterBarProps) {
  return (
    <div className={cn('flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-3', className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
