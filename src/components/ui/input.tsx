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
        'flex h-9 w-full rounded-xl border bg-surface px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-danger focus:border-danger' : 'border-line focus:border-brand',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'