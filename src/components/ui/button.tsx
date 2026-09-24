import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-[#16A34A] text-white shadow-sm hover:bg-[#15803D]',
        secondary: 'bg-[var(--text)] text-[var(--surface)] hover:bg-[var(--muted)]',
        outline: 'border border-[var(--line)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-soft)]',
        ghost: 'text-[var(--muted)] hover:bg-[var(--surface-soft)]',
        danger: 'bg-red-600 text-white hover:bg-red-500',
        accent: 'bg-[#F97316] text-white hover:bg-[#EA580C]',
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
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
