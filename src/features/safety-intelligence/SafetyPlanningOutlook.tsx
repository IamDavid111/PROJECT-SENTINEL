import type { SafetySnapshot } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { buildSafetyPlanningIndicators } from '../../../supabase/functions/_shared/safetyPlanningIndicators'
import { useState } from 'react'
import { TriangleAlert, ChevronDown, ChevronUp } from 'lucide-react'
import { initialPriorityLocationCount, priorityPlanningLocations } from './safetyPlanningView'

export function SafetyPlanningOutlook({ snapshot }: { snapshot: SafetySnapshot }) {
  const outlook = buildSafetyPlanningIndicators(snapshot)
  const [expanded, setExpanded] = useState(false)
  const priorities = priorityPlanningLocations(outlook)
  const visible = expanded ? priorities : priorities.slice(0, initialPriorityLocationCount)
  return <section className="safety-locations" aria-labelledby="safety-planning-title">
    <div className="safety-panel-heading">
      <h3 id="safety-planning-title"><TriangleAlert size={18} aria-hidden="true" />14-Day Safety Planning Indicators</h3>
      <span className="safety-label">Priority outlook · Not ML</span>
    </div>
    <p>Current priorities for the next 14 days—not a trained prediction or an authoritative forecast.
      {' '}Deterministic and advisory; no records are changed.</p>
    <p>Showing {visible.length} of {priorities.length} priority sites.
      {' '}High indicators or observed urgent drivers: open High/Critical reports or overdue unfinished actions.
      {' '}Other sites are not shown; omission is not a safety assurance.</p>
    <details className="safety-methodology"><summary>Methodology and coverage</summary>
      <p>Planning period: {outlook.asOf} to {outlook.planningEnd} (UTC).
        {' '}Evidence window: {snapshot.windows.indicator.start} to {snapshot.windows.indicator.end}.
        {' '}Uses 90-day history, latest 14-day reports and the current open/action backlog, regardless of the KPI window.</p>
      <p>High: open Critical report or overdue unfinished action linked to a Critical report.
        {' '}Medium: otherwise, open High report, recent High/Critical report or overdue unfinished action.
        {' '}Low: none of those drivers, with complete evidence and at least 10 classified reports in 90 days.</p>
      <p>Verified/closed actions are terminal. Date-only due dates become overdue after their UTC day ends.
        {' '}Missing history, classifications, dates or action access prevents a complete indicator. Low is not a safety assurance.</p>
    </details>
    {!outlook.locations.length ? <p role="status">Insufficient site history to show planning indicators.</p>
      : !priorities.length ? <p role="status">No High indicator or qualifying urgent driver was observed in the authorized site data. This is not a safety assurance.</p>
      :       <div className="safety-planning-table" role="region" aria-label="Priority site planning outlook" tabIndex={0}>
        <table><thead><tr><th scope="col">Site</th><th scope="col">Planning indicator</th><th scope="col">Observed drivers</th><th scope="col">Preventive advice · Advisory</th></tr></thead>
        <tbody>{visible.map((item) => {
        const color = item.indicator ?? item.observedPriority
        return <tr key={`${item.location.level}-${item.location.id}`}>
          <th scope="row"><strong>{item.location.name}</strong><small>{item.location.level} · {item.location.indicatorSampleSize} classified reports</small></th>
          <td><span className={`safety-indicator-badge${color ? ` safety-indicator-${color.toLowerCase()}` : ''}`}>{item.indicator ?? (item.state === 'incomplete' ? 'Incomplete evidence' : 'Insufficient history')}</span>
            {item.observedPriority && <small>Observed {item.observedPriority} priority—not a complete indicator.</small>}
            {item.reasons.length > 0 && <details><summary>Coverage limitations</summary><ul>{item.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}
          </td>
          <td><ul>{item.drivers.map((driver) => <li key={driver.observation}>{driver.observation}</li>)}</ul></td>
          <td><ul>{item.drivers.map((driver) => <li key={driver.observation}>{driver.advice}</li>)}</ul></td>
        </tr>
      })}</tbody></table></div>}
    {priorities.length > initialPriorityLocationCount && <button type="button" className="button button-outline button-small safety-show-more" aria-expanded={expanded}
      onClick={() => setExpanded((value) => !value)}>
      {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
      {expanded ? 'Show fewer sites' : `Show ${priorities.length - initialPriorityLocationCount} more priority sites`}
    </button>}
    <small className="safety-source-note">Source: authorized shared incident/action aggregates, snapshot {outlook.asOf}.</small>
  </section>
}
