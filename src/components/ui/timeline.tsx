import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

export interface TimelineItem {
  time: ReactNode
  title: ReactNode
  meta?: ReactNode
  tone?: 'brand' | 'accent' | 'danger' | 'neutral'
}

export interface TimelineProps {
  items: TimelineItem[]
  className?: string
}

const DOT_CLASS: Record<NonNullable<TimelineItem['tone']>, string> = {
  brand: 'bg-brand',
  accent: 'bg-accent',
  danger: 'bg-danger',
  neutral: 'bg-muted',
}

/** Vertical audit/activity feed. */
export function Timeline({ items, className }: TimelineProps) {
  return (
    <ol className={cn('grid gap-5 border-l border-line pl-5', className)}>
      {items.map((item, index) => (
        <li key={index} className="relative min-w-0">
          <span
            aria-hidden="true"
            className={cn('absolute -left-[25px] top-1.5 h-2 w-2 rounded-full ring-4 ring-surface', DOT_CLASS[item.tone ?? 'brand'])}
          />
          <time className="font-mono text-xs text-muted">{item.time}</time>
          <div className="mt-1 text-sm font-medium text-foreground">{item.title}</div>
          {item.meta && <div className="mt-0.5 text-xs text-muted">{item.meta}</div>}
        </li>
      ))}
    </ol>
  )
}
