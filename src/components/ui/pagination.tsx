import { cn } from '../../lib/utils'
import { Button } from './button'

export interface PaginationProps {
  page: number
  totalPages: number
  total?: number
  /** Noun shown in the summary, e.g. "incidents". */
  itemLabel?: string
  onPageChange: (page: number) => void
  className?: string
}

/** Summary + Previous/Next pager used by every register table. */
export function Pagination({ page, totalPages, total, itemLabel = 'records', onPageChange, className }: PaginationProps) {
  const safeTotal = Math.max(1, totalPages)
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 text-sm text-muted', className)}>
      <span>
        Page {page} of {safeTotal}
        {typeof total === 'number' ? ` · ${total} ${itemLabel}` : null}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= safeTotal} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}
