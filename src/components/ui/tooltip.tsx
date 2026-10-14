import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

export interface TooltipProps {
  label: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

const POSITION: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
}

/**
 * Lightweight CSS tooltip: appears on hover and keyboard focus of the trigger.
 * Keyboard users reach the trigger, so the tooltip is also revealed via
 * focus-within.
 */
export function Tooltip({ label, children, side = 'top', className }: TooltipProps) {
  return (
    <span className={cn('group relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-40 hidden max-w-56 rounded-lg bg-ink-2 px-2.5 py-1.5 text-xs font-medium text-surface shadow-card group-hover:block group-focus-within:block motion-reduce:transition-none',
          POSITION[side],
        )}
      >
        {label}
      </span>
    </span>
  )
}