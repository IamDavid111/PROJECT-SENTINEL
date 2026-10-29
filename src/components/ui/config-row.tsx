import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { Toggle } from './toggle'

export interface ConfigRowProps {
  title: ReactNode
  description?: ReactNode
  enabled?: boolean
  onEnabledChange?: (enabled: boolean) => void
  action?: ReactNode
  children?: ReactNode
  className?: string
}

export interface ConfigListProps {
  children: ReactNode
  className?: string
}

/** Bordered list for settings rows (shifts, departments, sites, contacts…). */
export function ConfigList({ children, className }: ConfigListProps) {
  return <div className={cn('grid gap-2', className)}>{children}</div>
}

/** Label + status + optional switch + optional action. */
export function ConfigRow({ title, description, enabled, onEnabledChange, action, children, className }: ConfigRowProps) {
  return (
    <div className={cn('grid gap-3 rounded-xl border border-line bg-surface px-3 py-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {typeof enabled === 'boolean' && (
            <Toggle
              checked={enabled}
              onCheckedChange={onEnabledChange}
              aria-label={typeof title === 'string' ? `${title} enabled` : 'Enabled'}
            />
          )}
          {action}
        </div>
      </div>
      {children}
    </div>
  )
}
