import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { Icon } from './icon'

export interface BreadcrumbItem {
  label: ReactNode
  href?: string
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
}

/** Accessible breadcrumb trail. The last item is the current page. */
export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {items.map((item, index) => {
          const current = index === items.length - 1
          return (
            <li key={index} className="flex min-w-0 items-center gap-1.5">
              {item.href && !current ? (
                <a href={item.href} className="truncate hover:text-foreground hover:underline">
                  {item.label}
                </a>
              ) : (
                <span className={cn('truncate', current && 'text-foreground')} aria-current={current ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
              {!current && <Icon name="chevronRight" size={12} className="shrink-0 text-line" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
