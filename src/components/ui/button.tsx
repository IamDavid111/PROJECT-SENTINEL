import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'
import { Spinner } from './spinner'

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-brand text-white hover:bg-brand-dark',
        secondary: 'border border-line bg-surface-soft text-foreground hover:bg-surface',
        outline: 'border border-line bg-transparent text-foreground hover:bg-surface-soft',
        ghost: 'text-muted hover:bg-surface-soft hover:text-foreground',
        danger: 'bg-danger text-white hover:bg-danger/90',
        accent: 'bg-accent text-white hover:bg-accent/90',
        reverse: 'bg-white text-brand hover:bg-white/90',
        inverse: 'border border-white/25 bg-transparent text-white hover:bg-white/10',
      },
      size: {
        default: 'h-9 px-3',
        sm: 'h-8 px-2.5 text-xs',
        lg: 'h-10 px-4',
        icon: 'h-9 w-9',
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
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => {
    const spinnerFill =
      variant === 'outline' || variant === 'ghost' || variant === 'secondary' || variant === 'reverse'
        ? 'currentColor'
        : '#fff'

    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Spinner size={16} fill={spinnerFill} label="Loading" />}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }