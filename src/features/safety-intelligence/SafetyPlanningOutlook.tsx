import type { SafetySnapshot } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { buildSafetyPlanningIndicators } from '../../../supabase/functions/_shared/safetyPlanningIndicators'
import { useState } from 'react'
import { Badge, Button, Card, DataTable, Icon } from '../../components/ui'
import type { DataTableColumn } from '../../components/ui'
import { initialPriorityLocationCount, priorityPlanningLocations } from './safetyPlanningView'

export function SafetyPlanningOutlook({ snapshot, report = false }: { snapshot: SafetySnapshot; report?: boolean }) {
  const outlook = buildSafetyPlanningIndicators(snapshot)
  const [expanded, setExpanded] = useState(false)
  const priorities = priorityPlanningLocations(outlook)
  const visible = report || expanded ? priorities : priorities.slice(0, initialPriorityLocationCount)
  const columns: DataTableColumn<(typeof priorities)[number]>[] = [
    {
      id: 'site',
      header: 'Site',
      cell: (item) => <strong className="whitespace-nowrap text-sm text-foreground">{item.location.name}</strong>,
    },
    {
      id: 'drivers',
      header: 'Observed drivers',
      cell: (item) => <ul className="grid min-w-[220px] gap-1 text-xs text-muted">
        {item.drivers.map((driver) => <li key={driver.observation}>{driver.observation}</li>)}
      </ul>,
    },
    {
      id: 'advice',
      header: 'Preventive advice · Advisory',
      cell: (item) => <ul className="grid min-w-[220px] gap-1 text-xs text-muted">
        {item.drivers.map((driver) => <li key={driver.observation}>{driver.advice}</li>)}
      </ul>,
    },
  ]
  return <section className="safety-locations" aria-labelledby="safety-planning-title">
    <Card className="p-5 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="safety-planning-title" className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
            <Icon name="warning" size={17} className="text-caution" />
            14-Day Safety Planning Indicators
          </h3>
          <p className="mt-1 text-sm text-muted">Current priorities for the next 14 days—not a trained prediction or an authoritative forecast.
            {' '}Deterministic and advisory; no records are changed.</p>
        </div>
        <Badge tone="warning">Priority outlook · Not ML</Badge>
      </div>
      <p className="mt-3 text-xs text-muted">Showing {visible.length} of {priorities.length} priority sites.
        {' '}Priority order: open Critical reports, Critical-linked unfinished actions, open High reports, then other unfinished actions.
        {' '}Other sites are not shown; omission is not a safety assurance.</p>

      {outlook.state === 'unavailable' ? (
        <p className="mt-4 text-sm text-muted" role="status">Updated planning counts are unavailable from the deployed analytics endpoint.</p>
      ) : !outlook.locations.length ? (
        <p className="mt-4 text-sm text-muted" role="status">No authorized site planning data is available.</p>
      ) : !priorities.length ? (
        <p className="mt-4 text-sm text-muted" role="status">No qualifying open reports or unfinished actions were observed in the authorized site data. This is not a safety assurance.</p>
      ) : (
        <DataTable
          className="mt-4 shadow-none"
          columns={columns}
          rows={visible}
          rowKey={(item) => `${item.location.level}-${item.location.id}`}
        />
      )}

      {outlook.locations.some((item) => item.state === 'incomplete') && (
        <p className="mt-4 rounded-xl border border-caution/30 bg-caution/10 px-4 py-3 text-sm text-foreground" role="status">
          Some site counts are incomplete. Review the source and due-date limitations before using them for planning.
        </p>
      )}
      {!report && priorities.length > initialPriorityLocationCount && (
        <Button type="button" variant="outline" size="sm" className="mt-4" aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}>
          <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={15} />
          {expanded ? 'Show fewer sites' : `Show ${priorities.length - initialPriorityLocationCount} more priority sites`}
        </Button>
      )}
      <p className="mt-4 text-xs text-muted">Source: authorized shared incident/action aggregates, snapshot {outlook.asOf}.</p>
    </Card>
  </section>
}
