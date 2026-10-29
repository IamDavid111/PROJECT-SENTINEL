import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical'
  label?: ReactNode
  className?: string
}

/** Hairline separator; horizontal dividers can carry a centered label. */
export function Divider({ orientation = 'horizontal', label, className }: DividerProps) {
  if (orientation === 'vertical') {
    return <span role="separator" aria-orientation="vertical" className={cn('inline-block h-full w-px self-stretch bg-line', className)} />
  }

  if (label) {
    return (
      <div role="separator" className={cn('flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-muted', className)}>
        <span className="h-px flex-1 bg-line" />
        {label}
        <span className="h-px flex-1 bg-line" />
      </div>
    )
  }

  return <hr className={cn('border-0 border-t border-line', className)} />
}
