import { Badge } from '../../components/ui/badge'
import { Card } from '../../components/ui/card'
import { Icon } from '../../components/ui/icon'
import { cn } from '../../lib/utils'
import type { DashboardMetric } from './types'

const incidentKeys = [
  'total-incidents',
  'open-incidents',
  'resolved-incidents',
  'high-risk-incidents',
  'open-high-risk-incidents',
  'closed-high-risk-incidents',
  'inspections-completed',
]

const actionRows = [
  { label: 'Corrective', open: 'open-corrective-actions', closed: 'closed-corrective-actions' },
  { label: 'Preventive', open: 'open-preventive-actions', closed: 'closed-preventive-actions' },
  { label: 'Investigation', open: 'open-investigations', closed: 'closed-investigations' },
]

function byKey(metrics: DashboardMetric[]) {
  return new Map(metrics.map((metric) => [metric.key, metric]))
}

function RegisterHeader({ title, description, windowLabel }: { title: string; description: string; windowLabel: string }) {
  return (
    <div className="flex items-start justify-between gap-3 p-5 pb-2">
      <div>
        <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </div>
      <Badge tone="neutral">{windowLabel}</Badge>
    </div>
  )
}

/** Compact incident counts. Replaces the previous wall of metric cards. */
export function IncidentRegister({ metrics, windowLabel }: { metrics: DashboardMetric[]; windowLabel: string }) {
  const metricsByKey = byKey(metrics)
  return (
    <Card className="flex h-full flex-col shadow-none">
      <RegisterHeader title="Incident register" description="Counts in the selected window" windowLabel={windowLabel} />
      <div className="grid px-5 pb-2">
        {incidentKeys.map((key) => {
          const metric = metricsByKey.get(key)
          return (
            <div key={key} className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0">
              <span className="text-sm text-muted">{metric?.label ?? key}</span>
              <span className={cn('font-display text-base font-semibold tabular-nums', metric?.available ? 'text-foreground' : 'text-muted')}>
                {metric?.available ? metric.value : '—'}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-auto border-t border-line px-5 py-3">
        <a href="#incidents" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-dark hover:underline">
          Open incident register <Icon name="arrowRight" size={12} />
        </a>
      </div>
    </Card>
  )
}

/** Corrective, preventive and investigation actions in one open/closed matrix. */
export function ActionRegister({ metrics, actionHref, windowLabel }: { metrics: DashboardMetric[]; actionHref: string; windowLabel: string }) {
  const metricsByKey = byKey(metrics)
  return (
    <Card className="flex h-full flex-col shadow-none">
      <RegisterHeader title="Action register" description="Open and closed by action type" windowLabel={windowLabel} />
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-5 px-5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        <span>Type</span>
        <span className="text-right">Open</span>
        <span className="text-right">Closed</span>
      </div>
      <div className="grid px-5">
        {actionRows.map((row) => (
          <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-5 border-b border-line py-2.5 last:border-0">
            <span className="text-sm text-muted">{row.label}</span>
            <a href={actionHref} className="text-right font-display text-base font-semibold tabular-nums text-foreground hover:underline">
              {metricsByKey.get(row.open)?.value ?? '—'}
            </a>
            <a href={actionHref} className="text-right font-display text-base font-semibold tabular-nums text-brand-dark hover:underline">
              {metricsByKey.get(row.closed)?.value ?? '—'}
            </a>
          </div>
        ))}
      </div>
      <div className="mt-auto border-t border-line px-5 py-3">
        <a href={actionHref} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-dark hover:underline">
          Open action register <Icon name="arrowRight" size={12} />
        </a>
      </div>
    </Card>
  )
}
