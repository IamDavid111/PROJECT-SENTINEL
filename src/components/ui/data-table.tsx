import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { Icon } from './icon'
import { Skeleton } from './skeleton'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from './table'

export type SortDirection = 'asc' | 'desc'

export interface DataTableSort {
  columnId: string
  direction: SortDirection
}

export interface DataTableColumn<T> {
  id: string
  header: ReactNode
  cell: (row: T) => ReactNode
  sortable?: boolean
  align?: 'left' | 'center' | 'right'
  className?: string
  headerClassName?: string
}

export interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[]
  rows: readonly T[]
  rowKey: (row: T) => string
  toolbar?: ReactNode
  loading?: boolean
  loadingRows?: number
  empty?: ReactNode
  sort?: DataTableSort | null
  onSortChange?: (sort: DataTableSort) => void
  pagination?: ReactNode
  className?: string
  rowClassName?: (row: T) => string | undefined
}

const ALIGN_CLASS: Record<NonNullable<DataTableColumn<unknown>['align']>, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

/** Generic register table: toolbar, sortable headers, loading, empty and pager slots. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  toolbar,
  loading = false,
  loadingRows = 4,
  empty,
  sort,
  onSortChange,
  pagination,
  className,
  rowClassName,
}: DataTableProps<T>) {
  const toggleSort = (columnId: string) => {
    if (!onSortChange) return
    const nextDirection: SortDirection = sort?.columnId === columnId && sort.direction === 'asc' ? 'desc' : 'asc'
    onSortChange({ columnId, direction: nextDirection })
  }

  return (
    <div className={cn('overflow-hidden rounded-card border border-line bg-surface', className)}>
      {toolbar}
      <div className="overflow-x-auto">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => {
                const active = sort?.columnId === column.id
                return (
                  <TableHead
                    key={column.id}
                    aria-sort={active ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn(ALIGN_CLASS[column.align ?? 'left'], column.headerClassName)}
                  >
                    {column.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.id)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded text-xs font-semibold uppercase tracking-wide transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                          active && 'text-foreground',
                        )}
                      >
                        {column.header}
                        <Icon name={active && sort?.direction === 'desc' ? 'chevronDown' : 'chevronUp'} size={12} className={cn(!active && 'opacity-40')} />
                      </button>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: loadingRows }).map((_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`} className="hover:bg-transparent">
                  {columns.map((column) => (
                    <TableCell key={column.id} className={column.className}>
                      <Skeleton variant="text" className="w-full max-w-40" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!loading && rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="py-10 text-center text-sm text-muted">
                  {empty ?? 'No records found.'}
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              rows.map((row) => (
                <TableRow key={rowKey(row)} className={rowClassName?.(row)}>
                  {columns.map((column) => (
                    <TableCell key={column.id} className={cn(ALIGN_CLASS[column.align ?? 'left'], column.className)}>
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </table>
      </div>
      {pagination}
    </div>
  )
}

export interface TableToolbarProps {
  children?: ReactNode
  actions?: ReactNode
  className?: string
}

/** Filter/search cluster shown at the top of a DataTable. */
export function TableToolbar({ children, actions, className }: TableToolbarProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3', className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
