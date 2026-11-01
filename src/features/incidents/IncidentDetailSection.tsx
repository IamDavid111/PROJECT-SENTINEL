import type { ReactNode } from 'react'

import { Badge } from '../../components/ui'

export function SectionTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid gap-0.5">
        <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function BooleanBadge({ value }: { value: boolean }) {
  return <Badge tone={value ? 'warning' : 'neutral'}>{value ? 'Yes' : 'No'}</Badge>
}
