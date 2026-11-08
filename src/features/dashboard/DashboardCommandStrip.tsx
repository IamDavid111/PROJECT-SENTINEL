import { ArrowRight } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { cn } from '../../lib/utils'
import { OrganizationManagementSystemsSection } from './OrganizationManagementSystemsSection'

export type DashboardStripStat = {
  key: string
  label: string
  value: string
  hint: string
  href: string
  tone?: 'danger' | 'caution' | 'brand'
}

const TONE_CLASS: Record<NonNullable<DashboardStripStat['tone']>, string> = {
  danger: 'text-danger',
  caution: 'text-caution',
  brand: 'text-brand-dark',
}

/** Shift-board readout: date, full-width greeting, organization context, and the four attention numbers. */
export function DashboardCommandStrip({ userName, organizationName, role, stats, client, organizationId }: {
  userName: string
  organizationName: string
  role: string
  stats: DashboardStripStat[]
  client: SupabaseClient
  organizationId: string
}) {
  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  const timeLabel = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="grid gap-5 py-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="h-px w-6 bg-brand" aria-hidden="true" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{dateLabel}</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-brand motion-safe:animate-pulse" aria-hidden="true" />
            As of {timeLabel}
          </div>
        </div>

        <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          <span className="block">{greeting},</span>
          <span className="block">{userName}</span>
        </h2>

        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <span>{organizationName}</span>
          <span aria-hidden="true">·</span>
          <span>{role}</span>
        </p>
      </div>

      <OrganizationManagementSystemsSection client={client} organizationId={organizationId} />

      <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <a
            key={stat.key}
            href={stat.href}
            className="group grid gap-1 rounded-lg border border-transparent p-2 transition-colors hover:border-brand/50 hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 sm:border-l sm:border-line sm:pl-4 sm:first:border-l-0 sm:first:pl-0"
          >
            <span className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              {stat.label}
              <ArrowRight size={14} className="shrink-0 text-brand transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </span>
            <span className={cn('font-display text-3xl font-semibold tabular-nums tracking-tight', stat.tone ? TONE_CLASS[stat.tone] : 'text-foreground')}>
              {stat.value}
            </span>
            <span className="text-[11px] leading-tight text-muted">{stat.hint}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
