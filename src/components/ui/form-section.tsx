import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

export interface FormSectionProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** Form section header + body. Pairs with FormGrid / FormFull. */
export function FormSection({ title, description, actions, children, className }: FormSectionProps) {
  return (
    <section className={cn('grid gap-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>
}

/** A field that spans both columns of a FormGrid. */
export function FormFull({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('sm:col-span-2', className)}>{children}</div>
}

export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4', className)}>
      {children}
    </div>
  )
}
