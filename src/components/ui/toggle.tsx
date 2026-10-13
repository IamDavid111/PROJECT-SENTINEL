import type { ReactNode } from 'react'
import * as React from 'react'

import { cn } from '../../lib/utils'

export interface ToggleProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  label?: ReactNode
}

/**
 * Switch control (role="switch"). Show `label` text next to it for settings
 * rows; the accessible name comes from the label when present.
 */
export function Toggle({ checked, onCheckedChange, label, className, disabled, ...props }: ToggleProps) {
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center gap-2',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : undefined}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2',
          checked ? 'border-brand bg-brand' : 'border-line bg-surface-soft',
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
      {label && <span className="text-sm text-foreground">{label}</span>}
    </label>
  )
}