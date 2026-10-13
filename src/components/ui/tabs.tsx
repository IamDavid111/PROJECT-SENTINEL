import { useState, type ReactNode } from 'react'

import { cn } from '../../lib/utils'

export interface TabItem {
  id: string
  label: ReactNode
  content?: ReactNode
}

export interface TabsProps {
  items: TabItem[]
  value?: string
  onChange?: (id: string) => void
  className?: string
}

/**
 * Accessible tabs (roles tablist/tab/tabpanel). Controlled or uncontrolled;
 * arrow-key movement is intentionally delegated to native buttons + focus rings
 * to keep the first version dependency-free.
 */
export function Tabs({ items, value, onChange, className }: TabsProps) {
  const [internal, setInternal] = useState(() => items[0]?.id ?? '')
  const activeId = value ?? internal

  const select = (id: string) => {
    if (value === undefined) setInternal(id)
    onChange?.(id)
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div role="tablist" aria-label="Tabs" className="flex gap-1 border-b border-line">
        {items.map((item) => {
          const selected = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`panel-${item.id}`}
              onClick={() => select(item.id)}
              className={cn(
                'rounded-t-lg border-b-2 px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1',
                selected ? 'border-brand text-foreground' : 'border-transparent text-muted hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`panel-${item.id}`}
          aria-labelledby={`tab-${item.id}`}
          hidden={item.id !== activeId}
          className="focus-visible:outline-none"
        >
          {item.content}
        </div>
      ))}
    </div>
  )
}