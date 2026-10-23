import { Children, type ReactNode } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Clock, MapPin, ShieldCheck, Sparkles, Tags, TrendingUp, type LucideIcon } from 'lucide-react'
import type { SafetySnapshot } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'

// Round for presentation only; the server already assigned the band using the unrounded score.
const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 1 })
const signed = (value: number) => `${value > 0 ? '+' : ''}${number(value)}`

function Card({ title, value, children, band, tone = 'blue', icon: Icon = Sparkles }: {
  title: string; value: ReactNode; children: ReactNode; band?: 'High' | 'Medium' | 'Low' | null;
  tone?: 'teal' | 'blue' | 'green' | 'amber' | 'red'; icon?: LucideIcon;
}) {
  const content = Children.toArray(children)
  const bandText = band ? <span className="safety-kpi-band">{band}</span> : null
  return <article className={`dashboard-kpi safety-kpi safety-kpi-${tone}${band ? ` safety-risk-${band.toLowerCase()}` : ''}`}>
    <h3>{title}</h3>
    <strong className="safety-kpi-value">{value}</strong>
    <Icon className="safety-kpi-icon" size={18} aria-hidden="true" />
    <div className="safety-kpi-description">{bandText}{content.slice(0, 2)}</div>
  </article>
}

function Reasons({ reasons }: { reasons: string[] }) {
  return reasons.length ? <ul className="safety-kpi-reasons">{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null
}

export function SafetyKpiCards({ snapshot }: { snapshot: SafetySnapshot }) {
  const { metrics, coverage, dataQuality } = snapshot
  const { risk, highRisk, category, resolution } = metrics
  const { incidentCounts } = metrics
  const hasReports = category.denominator > 0
  const complete = (source: SafetySnapshot['coverage'][number]['source']) => coverage.some((entry) => entry.source === source && entry.complete)
  const riskAvailable = risk.state === 'available' && risk.score !== null && risk.band !== null
  // Partial counts can be useful if labeled; a missing metric must never become an invented zero.
  const highKnown = hasReports && (highRisk.state === 'available' || highRisk.state === 'incomplete')
  // Only canonical rankings are used; never infer "highest" from a truncated or unknown cohort.
  const location = snapshot.locations.find((entry) => entry.level === 'site' && entry.highRiskCount > 0)
  const locationAvailable = Boolean(location && complete('incidents') && complete('sites'))
  return <div className="safety-kpi-grid" aria-label="Safety Intelligence metrics">
    {(['total', 'open', 'closed'] as const).map((kind) => <Card key={kind}
      tone={kind === 'total' ? 'blue' : kind === 'open' ? 'amber' : 'green'}
      icon={kind === 'total' ? Activity : kind === 'open' ? AlertTriangle : CheckCircle2}
      title={`${kind === 'total' ? 'Total' : kind === 'open' ? 'Open' : 'Closed'} Incidents`}
      value={incidentCounts ? number(incidentCounts[kind]) : 'Unavailable'}>
      {incidentCounts?.state === 'incomplete' && <span>Known counts only</span>}
      {incidentCounts?.state === 'incomplete' && <small>Known counts only; incomplete reporting coverage.</small>}
      {!incidentCounts && <small>The deployed snapshot endpoint does not yet provide incident counts.</small>}
      {incidentCounts && <Reasons reasons={incidentCounts.reasons} />}
    </Card>)}
    <Card title="Drafts" icon={CheckCircle2} tone="teal" value={incidentCounts?.drafts !== undefined ? number(incidentCounts.drafts) : 'Unavailable'}>
      {incidentCounts?.state === 'incomplete' && <small>Known counts only; incomplete reporting coverage.</small>}
      {!incidentCounts && <small>The deployed snapshot endpoint does not yet provide incident counts.</small>}
      {incidentCounts && <Reasons reasons={incidentCounts.reasons} />}
    </Card>
    <Card title="AI Risk Level" icon={ShieldCheck} tone={riskAvailable ? risk.band === 'High' ? 'red' : risk.band === 'Medium' ? 'amber' : 'green' : 'teal'} value={riskAvailable && risk.score !== null ? `${number(risk.score)} / 100` : 'Insufficient data'} band={riskAvailable ? risk.band : null}>
      {!riskAvailable && <span>{risk.state === 'incomplete' ? 'Incomplete coverage' : 'Risk index unavailable'}</span>}
      <small>{risk.sampleSize} classified reports. Not ML or accident probability.</small>
    </Card>
    <Card title="High-Risk Incidents" tone="red" icon={AlertTriangle} value={highKnown ? number(highRisk.count) : 'Unavailable'}>
      {highKnown && <small>{number(highRisk.openCount)} still open</small>}
      {highKnown && highRisk.state === 'incomplete' && <small>Known counts only; incomplete coverage.</small>}
      {!hasReports && <small>No eligible reports in this window.</small>}
      <Reasons reasons={highRisk.reasons} />
    </Card>
    <Card title="Near Miss" tone="teal" icon={TrendingUp} value={incidentCounts?.nearMiss !== undefined ? number(incidentCounts.nearMiss) : 'Unavailable'}>
      <small>Near-miss reports in the selected reporting window.</small>
      {incidentCounts?.state === 'incomplete' && <small>Known counts only; incomplete reporting coverage.</small>}
    </Card>
    <Card title="Most Common Reported Category" tone="blue" icon={Tags} value={category.state === 'available' && category.label ? category.label : 'Unavailable'}>
      {category.state === 'available' && category.share !== null && <span>{number(category.share)}% of {category.denominator} reported events</span>}
      <Reasons reasons={category.reasons} />
    </Card>
    <Card title="Highest Risk Site" tone="red" icon={MapPin} value={locationAvailable ? location?.name : 'Unavailable'}>
      {locationAvailable && location && <span>{number(location.highRiskCount)} High/Critical incidents · {number(location.count)} total incidents</span>}
      {!locationAvailable && <small>{!hasReports ? 'No eligible reports in this window.' : 'Complete incident and site retrieval is required for a reliable ranking.'}</small>}
      {dataQuality.unassignedFacility > 0 && <small>{dataQuality.unassignedFacility} reports lack an available site assignment and are excluded from site rankings.</small>}
    </Card>
    <Card title="Average Resolution Time" tone="teal" icon={Clock} value={resolution.state === 'available' && resolution.averageDays !== null ? `${number(resolution.averageDays)} days` : 'Unavailable'}>
      {resolution.state === 'available' && resolution.sampleSize > 0 && <small>{number(resolution.sampleSize)} valid closures in this window</small>}
      {resolution.state === 'incomplete' && <small>Known counts only; incomplete closure coverage.</small>}
      {resolution.state === 'available' && resolution.changeDays !== null && resolution.previousSampleSize > 0 && <small>{signed(resolution.changeDays)} days versus previous period ({resolution.previousSampleSize} closures)</small>}
    </Card>
  </div>
}
