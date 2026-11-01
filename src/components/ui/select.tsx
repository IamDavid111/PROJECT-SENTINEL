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
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, containerClassName, invalid, children, ...props }, ref) => (
    <span className={cn('relative block', containerClassName)}>
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'h-9 w-full appearance-none rounded-xl border bg-surface px-3 py-2 pr-9 text-sm text-foreground transition-colors focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          invalid ? 'border-danger focus:border-danger' : 'border-line focus:border-brand',
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
  ),
)
Select.displayName = 'Select'