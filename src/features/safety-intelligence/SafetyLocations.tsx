import type { SafetySnapshot } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { buildSafetyLocationGuidance } from '../../../supabase/functions/_shared/safetyLocationGuidance'
import { MapPin, Lightbulb, Sparkles } from 'lucide-react'

export function SafetyLocations({ snapshot }: { snapshot: SafetySnapshot }) {
  const guidance = buildSafetyLocationGuidance(snapshot, { includeActionDrivers: false })
  return <section className="safety-locations safety-priority-grid" aria-label="High-Risk Sites & Recommendations">
    <div className="safety-priority-panel">
      <h3 id="safety-locations-title"><MapPin size={18} aria-hidden="true" />Top three high-risk sites</h3>
      <p>Actual authorized High/Critical reports · {snapshot.filters.days === 'all' ? 'All Time' : `Last ${snapshot.filters.days} days`}</p>
      {snapshot.dataQuality.unassignedFacility > 0 && <p>{snapshot.dataQuality.unassignedFacility} reports lack an available site assignment and are excluded from site rankings.</p>}
      {guidance.state !== 'available' ? <p role="status">{guidance.reasons.join(' ')}</p>
        : <ol className="safety-ranked-list">{guidance.locations.map(({ location }, index) => {
          const totalHighCritical = location.openCriticalCount + location.openHighCount
          return <li key={`${location.level}-${location.id}`}>
            <div className="safety-ranked-row"><span className="safety-rank">{index + 1}</span>
              <div><h4>{location.name}</h4><small>{location.openCriticalCount} open critical, {location.openHighCount} open high</small></div>
              <div className="safety-ranked-total"><span className="safety-total-pill">{totalHighCritical}</span></div>
            </div>
         
         {/* removed the details section for now, as it was causing confusion and clutter in the UI. We can revisit adding a more user-friendly way to show evidence and ranking details in the future. */}
            {/* <details><summary>Evidence and ranking details</summary>
              <p>{location.highRiskCount} High/Critical incidents · {location.count} total incidents</p>
              {evidence.length ? <ul>{evidence.map((item) => <li key={item.id}>
                <a href={`#incident-detail?id=${encodeURIComponent(item.id)}`}>{item.label}</a><p>{item.excerpt}</p>
              </li>)}</ul> : <p>Record excerpts are unavailable in this bounded snapshot. Guidance uses the authorized aggregate counts.</p>}
              {snapshot.evidenceTruncated && <small>Evidence examples are bounded and may be incomplete; aggregate counts are separate.</small>}
            // </details> */}
            
          </li>
        })}</ol>}

         {/* removed the details section for now, as it was causing confusion and clutter in the UI. We can revisit adding a more user-friendly way to show evidence and ranking details in the future.  */}
      {/* <details className="safety-methodology"><summary>How sites are ranked</summary>
        <p>Ranked by High/Critical count, open Critical, open High, then total reports. Ties use site name and ID.</p>
        <p>Sites use the same source as incident reporting. Reports without an available site are excluded.</p>
      </details> */}

    </div>
    <div className="safety-priority-panel">
      <h3><Lightbulb size={18} aria-hidden="true" />Advisory recommendations</h3>
      <p>Deterministic guidance—not AI-generated. Advisory only; no records are changed.</p>
      {guidance.state !== 'available' ? <p>No supported recommendations to display. Complete classified site evidence is required.</p>
        : <ul className="safety-recommendation-list">{guidance.locations.map(({ location, recommendations }) =>
          <li key={`${location.level}-${location.id}`}><Sparkles size={17} aria-hidden="true" /><div>
            <strong>{location.name}</strong>
            <p>{recommendations[0]?.advice}</p>
            <details><summary>Why this recommendation · {recommendations.length} supported {recommendations.length === 1 ? 'driver' : 'drivers'}</summary>
              {recommendations.map((item) => <div key={item.source}><strong>{item.driver}</strong>
                <p>{item.advice}</p><small>Source: authorized {item.source === 'incident_counts' ? 'incident' : 'corrective-action'} aggregate, snapshot {snapshot.asOf}.</small></div>)}
            </details>
          </div></li>)}</ul>}
    </div>
  </section>
}
