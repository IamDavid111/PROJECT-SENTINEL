import type { SafetySnapshot } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { buildSafetyPlanningIndicators } from '../../../supabase/functions/_shared/safetyPlanningIndicators'
import { useState } from 'react'
import { TriangleAlert, ChevronDown, ChevronUp } from 'lucide-react'
import { initialPriorityLocationCount, priorityPlanningLocations } from './safetyPlanningView'

export function SafetyPlanningOutlook({ snapshot, report = false }: { snapshot: SafetySnapshot; report?: boolean }) {
  const outlook = buildSafetyPlanningIndicators(snapshot)
  const [expanded, setExpanded] = useState(false)
  const priorities = priorityPlanningLocations(outlook)
  const visible = report || expanded ? priorities : priorities.slice(0, initialPriorityLocationCount)
  return <section className="safety-locations" aria-labelledby="safety-planning-title">
    <div className="safety-panel-heading">
      <h3 id="safety-planning-title"><TriangleAlert size={18} aria-hidden="true" />14-Day Safety Planning Indicators</h3>
      <span className="safety-label">Priority outlook · Not ML</span>
    </div>
    <p>Current priorities for the next 14 days—not a trained prediction or an authoritative forecast.
      {' '}Deterministic and advisory; no records are changed.</p>
    <p>Showing {visible.length} of {priorities.length} priority sites.
      {' '}Priority order: open Critical reports, Critical-linked unfinished actions, open High reports, then other unfinished actions.
      {' '}Other sites are not shown; omission is not a safety assurance.</p>
    {outlook.state === 'unavailable' ? (
      <p role="status">Updated planning counts are unavailable from the deployed analytics endpoint.</p>
    ) : !outlook.locations.length ? (
      <p role="status">No authorized site planning data is available.</p>
    ) : !priorities.length ? (
      <p role="status">No qualifying open reports or unfinished actions were observed in the authorized site data. This is not a safety assurance.</p>
    ) : (
      <div className="safety-planning-table" role="region" aria-label="Priority site planning outlook" tabIndex={0}>
        <table><thead><tr><th scope="col">Site</th><th scope="col">Observed drivers</th><th scope="col">Preventive advice · Advisory</th></tr></thead>
        <tbody>{visible.map((item) => <tr key={`${item.location.level}-${item.location.id}`}>
          <th scope="row"><strong>{item.location.name}</strong></th>
          <td><ul>{item.drivers.map((driver) => <li key={driver.observation}>{driver.observation}</li>)}</ul></td>
          <td><ul>{item.drivers.map((driver) => <li key={driver.observation}>{driver.advice}</li>)}</ul></td>
        </tr>)}</tbody></table>
      </div>
    )}
    {outlook.locations.some((item) => item.state === 'incomplete') && (
      <p role="status">
        Some site counts are incomplete. Review the source and due-date limitations before using them for planning.
      </p>
    )}
    {!report && priorities.length > initialPriorityLocationCount && <button type="button" className="button button-outline button-small safety-show-more" aria-expanded={expanded}
      onClick={() => setExpanded((value) => !value)}>
      {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
      {expanded ? 'Show fewer sites' : `Show ${priorities.length - initialPriorityLocationCount} more priority sites`}
    </button>}
    <small className="safety-source-note">Source: authorized shared incident/action aggregates, snapshot {outlook.asOf}.</small>
  </section>
}
