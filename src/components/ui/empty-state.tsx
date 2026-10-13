import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { Icon, type IconProps } from './icon'

export interface EmptyStateProps {
  icon?: IconProps['name']
  title: ReactNode
  description?: ReactNode
  /** Primary next step — an action button, usually. */
  action?: ReactNode
  className?: string
}

/**
 * Empty states are directions, not dead ends: they say what the screen is for
 * and offer the natural next action instead of apologizing.
 */
export function EmptyState({ icon = 'inbox', title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-soft text-muted">
        <Icon name={icon} size={22} />
      </span>
      <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}