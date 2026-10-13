import * as React from 'react'

import { cn } from '../../lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'flex h-11 w-full rounded-xl border bg-surface px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-1 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-danger' : 'border-line',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'