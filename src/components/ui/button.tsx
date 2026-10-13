import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'
import { Icon } from './icon'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-brand text-white shadow-sm hover:bg-brand-dark',
        secondary: 'bg-foreground text-surface hover:bg-muted',
        outline: 'border border-line bg-surface text-foreground hover:bg-surface-soft',
        ghost: 'text-muted hover:bg-surface-soft hover:text-foreground',
        danger: 'bg-danger text-white hover:bg-danger/90',
        accent: 'bg-accent text-white hover:bg-accent/90',
        reverse: 'bg-white text-brand hover:bg-white/90',
      },
      size: {
        default: 'h-11 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Shows a spinner and disables the button while `true`. */
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Icon name="spinner" size={16} className="animate-spin motion-reduce:animate-none" />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

export { buttonVariants }