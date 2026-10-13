import * as React from 'react'

import { cn } from '../../lib/utils'
import { Icon } from './icon'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
  containerClassName?: string
}

/**
 * Styled native select with the kit's chevron. Keeps native keyboard/a11y
 * behavior; the wrapper only adds the custom arrow.
 */
export function Select({ className, containerClassName, invalid, children, ...props }: SelectProps) {
  return (
    <span className={cn('relative block', containerClassName)}>
      <select
        aria-invalid={invalid || undefined}
        className={cn(
          'h-11 w-full appearance-none rounded-xl border bg-surface px-3 py-2 pr-9 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-1 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50',
          invalid ? 'border-danger' : 'border-line',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <Icon
        name="chevronDown"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
        size={16}
      />
    </span>
  )
}