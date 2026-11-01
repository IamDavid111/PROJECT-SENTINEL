import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { Icon, type IconProps } from './icon'

export interface AccordionProps {
  title: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  icon?: IconProps['name']
  className?: string
}

/** Native `details/summary` disclosure with the kit's chrome. */
export function Accordion({ title, children, defaultOpen = false, icon, className }: AccordionProps) {
  return (
    <details
      open={defaultOpen}
      className={cn('group rounded-xl border border-line bg-surface', className)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          {icon && <Icon name={icon} size={16} className="shrink-0 text-muted" />}
          {title}
        </span>
        <Icon
          name="chevronDown"
          size={16}
          className="shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="border-t border-line px-4 py-3 text-sm text-muted">{children}</div>
    </details>
  )
}
