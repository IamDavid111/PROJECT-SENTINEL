import { cn } from '../../lib/utils'
import { Card } from './card'
import { Icon } from './icon'

export type MapSiteStatus = 'critical' | 'warning' | 'ok'

export interface MapSite {
  id: string
  name: string
  status: MapSiteStatus
  /** Percentage position within the map surface. */
  x: number
  y: number
}

export interface MapCardProps {
  configured?: boolean
  sites?: readonly MapSite[]
  title?: string
  description?: string
  className?: string
}

const PIN_CLASS: Record<MapSiteStatus, string> = {
  critical: 'bg-danger text-white',
  warning: 'bg-caution text-ink',
  ok: 'bg-brand text-white',
}

const STATUS_LABEL: Record<MapSiteStatus, string> = {
  critical: 'Critical',
  warning: 'High',
  ok: 'Normal',
}

/**
 * Safety map shell. The real page mounts Mapbox; this primitive owns the frame,
 * configuration/empty states and the accessible site legend.
 */
export function MapCard({
  configured = true,
  sites = [],
  title = 'Safety risk map',
  description = 'Site markers are colored by current safety status.',
  className,
}: MapCardProps) {
  return (
    <Card className={cn('grid gap-4 p-5 shadow-none', className)}>
      <div className="grid gap-1">
        <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted">{description}</p>
      </div>

      {!configured ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface-soft px-6 py-12 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-muted"><Icon name="location" size={20} /></span>
          <strong className="text-sm font-semibold text-foreground">Map service configuration is required</strong>
          <p className="max-w-sm text-xs text-muted">Add a public Mapbox token to render site markers. The rest of the dashboard is unaffected.</p>
        </div>
      ) : sites.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface-soft px-6 py-12 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-muted"><Icon name="location" size={20} /></span>
          <strong className="text-sm font-semibold text-foreground">No site data available</strong>
          <p className="max-w-sm text-xs text-muted">Site coordinates will appear once an authorized site has a location.</p>
        </div>
      ) : (
        <>
          <div
            className="relative h-64 overflow-hidden rounded-xl border border-line bg-ink"
            role="img"
            aria-label={`Safety map with ${sites.length} sites`}
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px), radial-gradient(circle at 30% 40%, rgba(18,169,79,0.25), transparent 55%), radial-gradient(circle at 75% 65%, rgba(249,115,22,0.18), transparent 50%)',
                backgroundSize: '40px 40px, 40px 40px, 100% 100%, 100% 100%',
              }}
            />
            {sites.map((site) => (
              <span
                key={site.id}
                className={cn('absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-lg ring-2 ring-white/30', PIN_CLASS[site.status])}
                style={{ left: `${site.x}%`, top: `${site.y}%` }}
                title={`${site.name} · ${STATUS_LABEL[site.status]}`}
              >
                <Icon name="location" size={12} />
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
            {(Object.keys(STATUS_LABEL) as MapSiteStatus[]).map((status) => (
              <span key={status} className="flex items-center gap-1.5">
                <span className={cn('h-2.5 w-2.5 rounded-full', PIN_CLASS[status].split(' ')[0])} />
                {STATUS_LABEL[status]}
              </span>
            ))}
            <span className="ml-auto font-mono">{sites.length} sites</span>
          </div>
        </>
      )}
    </Card>
  )
}
