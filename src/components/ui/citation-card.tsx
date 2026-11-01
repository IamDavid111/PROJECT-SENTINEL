import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

export interface CitationCardProps {
  title: ReactNode
  meta?: ReactNode
  excerpt: ReactNode
  href?: string
  status?: ReactNode
  badges?: ReactNode
  footer?: ReactNode
  className?: string
}

/** Grounded answer source: document/record title, excerpt and deep link. */
export function CitationCard({ title, meta, excerpt, href, status, badges, footer, className }: CitationCardProps) {
  return (
    <article className={cn('grid gap-3 rounded-xl border border-line bg-surface p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <h4 className="truncate text-sm font-semibold text-foreground">{title}</h4>
          {meta && <p className="text-xs text-muted">{meta}</p>}
        </div>
        {status}
      </div>
      {badges && <div className="flex flex-wrap items-center gap-1.5">{badges}</div>}
      <blockquote className="border-l-2 border-brand pl-3 text-sm leading-relaxed text-muted">{excerpt}</blockquote>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{footer}</span>
        {href && (
          <a href={href} className="font-medium text-brand-dark underline underline-offset-4 hover:text-brand">
            Open source
          </a>
        )}
      </div>
    </article>
  )
}
