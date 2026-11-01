import type { SafetySnapshot } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { buildSafetyLocationGuidance } from '../../../supabase/functions/_shared/safetyLocationGuidance'
import { Badge, Card, Icon } from '../../components/ui'

export function SafetyLocations({ snapshot }: { snapshot: SafetySnapshot }) {
  const guidance = buildSafetyLocationGuidance(snapshot, { includeActionDrivers: false })
  const windowLabel = snapshot.filters.days === 'all' ? 'All Time' : `Last ${snapshot.filters.days} days`
  return <section className="safety-locations grid gap-5 lg:grid-cols-2" aria-label="High-Risk Sites & Recommendations">
    <Card className="p-5 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="safety-locations-title" className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
            <Icon name="location" size={17} className="text-caution" />
            Top three high-risk sites
          </h3>
          <p className="mt-1 text-sm text-muted">Actual authorized High/Critical reports · {windowLabel}</p>
        </div>
        <Badge tone="danger">High/Critical</Badge>
      </div>
      {snapshot.dataQuality.unassignedFacility > 0 && <p className="mt-2 text-xs text-muted">
        {snapshot.dataQuality.unassignedFacility} reports lack an available site assignment and are excluded from site rankings.
      </p>}
      {guidance.state !== 'available' ? <p className="mt-4 text-sm text-muted" role="status">{guidance.reasons.join(' ')}</p>
        : <ol className="mt-4 grid gap-2">{guidance.locations.map(({ location }, index) => {
          const totalHighCritical = location.openCriticalCount + location.openHighCount
          return <li key={`${location.level}-${location.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface-soft/40 p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-caution/10 text-sm font-semibold text-caution">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <h4 className="truncate text-sm font-semibold text-foreground">{location.name}</h4>
              <small className="text-xs text-muted">{location.openCriticalCount} open critical, {location.openHighCount} open high</small>
            </div>
            <Badge tone="danger">{totalHighCritical}</Badge>
          </li>
        })}</ol>}
    </Card>

    <Card className="p-5 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
            <Icon name="aiAssistant" size={17} className="text-brand" />
            Advisory recommendations
          </h3>
          <p className="mt-1 text-sm text-muted">Deterministic guidance—not AI-generated. Advisory only; no records are changed.</p>
        </div>
        <Badge tone="info">Deterministic</Badge>
      </div>
      {guidance.state !== 'available' ? <p className="mt-4 text-sm text-muted">No supported recommendations to display. Complete classified site evidence is required.</p>
        : <ul className="mt-4 grid gap-2">{guidance.locations.map(({ location, recommendations }) =>
          <li key={`${location.level}-${location.id}`} className="flex items-start gap-2 rounded-xl border border-line bg-surface-soft/40 p-3">
            <Icon name="aiAssistant" size={16} className="mt-0.5 shrink-0 text-brand" />
            <div className="min-w-0">
              <strong className="text-sm font-semibold text-foreground">{location.name}</strong>
              <p className="mt-1 text-sm text-muted">{recommendations[0]?.advice}</p>
              <details className="mt-2 text-xs text-muted">
                <summary className="cursor-pointer">Why this recommendation · {recommendations.length} supported {recommendations.length === 1 ? 'driver' : 'drivers'}</summary>
                {recommendations.map((item) => <div key={item.source} className="mt-2">
                  <strong className="text-foreground">{item.driver}</strong>
                  <p className="mt-1">{item.advice}</p>
                  <small className="text-[11px]">Source: authorized {item.source === 'incident_counts' ? 'incident' : 'corrective-action'} aggregate, snapshot {snapshot.asOf}.</small>
                </div>)}
              </details>
            </div>
          </li>)}</ul>}
    </Card>
  </section>
}
