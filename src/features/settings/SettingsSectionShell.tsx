import type { ReactNode } from 'react'

import { Badge } from '../../components/ui'

export function SettingsSectionShell({ title, description, action, dirty = false, children }: {
  title: string
  description: string
  action?: ReactNode
  dirty?: boolean
  children: ReactNode
}) {
  return (
    <section className="grid gap-4 rounded-card border border-line bg-surface p-5 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</h2>
            {dirty && <Badge tone="warning">Unsaved</Badge>}
          </div>
          <p className="text-sm text-muted">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
