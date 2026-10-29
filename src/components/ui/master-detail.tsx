import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

export interface MasterDetailProps {
  master: ReactNode
  detail: ReactNode
  className?: string
  masterClassName?: string
  detailClassName?: string
}

/** Two-pane list/detail layout: master list left, record detail right. */
export function MasterDetail({ master, detail, className, masterClassName, detailClassName }: MasterDetailProps) {
  return (
    <div className={cn('grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]', className)}>
      <div className={cn('min-w-0', masterClassName)}>{master}</div>
      <div className={cn('min-w-0', detailClassName)}>{detail}</div>
    </div>
  )
}
