import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

export interface DetailItem {
  label: ReactNode
  value: ReactNode
}

export interface DetailListProps {
  items: DetailItem[]
  columns?: 1 | 2 | 3
  className?: string
}

const COLUMN_CLASS: Record<NonNullable<DetailListProps['columns']>, string> = {
  1: 'grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
}

/** Read-only key/value block for record detail panels. */
export function DetailList({ items, columns = 2, className }: DetailListProps) {
  return (
    <dl className={cn('grid gap-4', COLUMN_CLASS[columns], className)}>
      {items.map((item, index) => (
        <div key={index} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">{item.label}</dt>
          <dd className="mt-1 break-words text-sm text-foreground">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
