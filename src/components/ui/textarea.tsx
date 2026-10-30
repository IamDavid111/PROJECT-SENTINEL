import * as React from 'react'

import { cn } from '../../lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'w-full rounded-xl border bg-surface px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-danger focus:border-danger' : 'border-line focus:border-brand',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'