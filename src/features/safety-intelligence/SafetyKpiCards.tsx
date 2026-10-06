import { Children, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import type { SafetySnapshot } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'

// Round for presentation only; the server already assigned the band using the unrounded score.
const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 1 })
const signed = (value: number) => `${value > 0 ? '+' : ''}${number(value)}`

function Card({ title, value, children, band }: {
  title: string; value: ReactNode; children: ReactNode; band?: 'High' | 'Medium' | 'Low' | null;
}) {
  const content = Children.toArray(children)
  return <article className={`dashboard-kpi safety-kpi${band ? ` safety-risk-${band.toLowerCase()}` : ''}`}>
    <h3>{title}</h3>
    <strong className="safety-kpi-value">{value}</strong>
    <Sparkles className="safety-kpi-icon" size={18} aria-hidden="true" />
    <div className="safety-kpi-description">{content.slice(0, 2)}</div>
    {content.length > 2 && <details className="safety-kpi-details"><summary>Evidence and calculation</summary>
      <div>{content.slice(2)}</div></details>}
  </article>
}

function Reasons({ reasons }: { reasons: string[] }) {
  return reasons.length ? <ul className="safety-kpi-reasons">{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null
}

export function SafetyKpiCards({ snapshot }: { snapshot: SafetySnapshot }) {
  const { metrics, coverage, dataQuality } = snapshot
  const { risk, highRisk, nearMiss, category, resolution } = metrics
  const hasReports = category.denominator > 0
  const complete = (source: SafetySnapshot['coverage'][number]['source']) => coverage.some((entry) => entry.source === source && entry.complete)
  const riskAvailable = risk.state === 'available' && risk.score !== null && risk.band !== null
  // Partial counts can be useful if labeled; a missing metric must never become an invented zero.
  const highKnown = hasReports && (highRisk.state === 'available' || highRisk.state === 'incomplete')
  // Only canonical rankings are used; never infer "highest" from a truncated or unknown cohort.
  const location = snapshot.locations.find((entry) => entry.level === 'site' && entry.highRiskCount > 0)
  const locationAvailable = Boolean(location && complete('incidents') && complete('sites'))
  const actionCoverage = coverage.find((entry) => entry.source === 'actions')
  // A closure delegate may see all incidents without being allowed to see every linked action.
  const actionsComplete = actionCoverage?.complete && actionCoverage.access === 'organization'
  const trendAvailable = nearMiss.state === 'available'
  // A zero baseline has no meaningful percent change; more reporting is not proof of more danger.
  const trend = !trendAvailable ? 'Unavailable'
    : nearMiss.percentageChange !== null ? `${signed(nearMiss.percentageChange)}%`
      : nearMiss.direction === 'new_reporting' ? 'New reporting' : 'No reports'
  const direction = nearMiss.direction === 'up' || nearMiss.direction === 'new_reporting' ? '↑'
    : nearMiss.direction === 'down' ? '↓' : '→'
  return <div className="safety-kpi-grid" aria-label="Safety Intelligence metrics">
    <Card title="AI Risk Level" value={riskAvailable && risk.score !== null ? `${number(risk.score)} / 100` : 'Insufficient data'} band={riskAvailable ? risk.band : null}>
      {riskAvailable && <span>{risk.band} · Deterministic reported-event index</span>}
      {!riskAvailable && <span>{risk.state === 'incomplete' ? 'Incomplete coverage' : 'Deterministic index unavailable'}</span>}
      <small>{risk.sampleSize} classified reports. Not ML or accident probability.</small>
      {riskAvailable && <small>Band uses the unrounded score.</small>}
      <small>Point change unavailable: {risk.comparisonReason}</small>
      <Reasons reasons={risk.reasons} />
    </Card>
    <Card title="High-Risk Incidents" value={highKnown ? number(highRisk.count) : 'Unavailable'}>
      <span>{snapshot.filters.days}-day reported-event window</span>
      {highKnown && <small>{number(highRisk.openCount)} still open</small>}
      {highKnown && highRisk.state === 'incomplete' && <small>Known counts only; incomplete coverage.</small>}
      {!hasReports && <small>No eligible reports in this window.</small>}
      <Reasons reasons={highRisk.reasons} />
    </Card>
    <Card title="Near-Miss Trend" value={trend}>
      {trendAvailable && <span>{direction} {nearMiss.direction === 'down' ? 'Reporting decreased' : nearMiss.direction === 'up' || nearMiss.direction === 'new_reporting' ? 'Reporting increased' : 'Reporting unchanged'}</span>}
      <small>{!trendAvailable && 'Known counts only: '}{nearMiss.currentCount} current / {nearMiss.previousCount} previous comparable month-to-date reports.</small>
      {trendAvailable && nearMiss.percentageChange === null && <small>Percentage unavailable: previous period had no reports.</small>}
      <small>Reporting direction does not establish a change in danger.</small>
      <small>UTC month-to-date: {snapshot.windows.nearMissCurrent.start} to {snapshot.windows.nearMissCurrent.end}; previous: {snapshot.windows.nearMissPrevious.start} to {snapshot.windows.nearMissPrevious.end}. Ends excluded.</small>
      <Reasons reasons={nearMiss.reasons} />
    </Card>
    <Card title="Most Common Reported Category" value={category.state === 'available' && category.label ? category.label : 'Unavailable'}>
      {category.state === 'available' && category.share !== null && <span>{number(category.share)}% of {category.denominator} reported events</span>}
      <small>{dataQuality.uncategorized} uncategorized reports. Categories are not a verified hazard taxonomy.</small>
      <Reasons reasons={category.reasons} />
    </Card>
    <Card title="Highest Risk Site" value={locationAvailable ? location?.name : 'Unavailable'}>
      {locationAvailable && location && <>
        <span>{number(location.highRiskCount)} High/Critical incidents · {number(location.count)} total incidents</span>
        <small>{actionsComplete && !location.invalidActionDueDates
          ? `${number(location.overdueActions)} overdue corrective actions`
          : `${number(location.overdueActions)} known overdue actions; ${!actionCoverage?.complete ? 'action retrieval incomplete' : location.invalidActionDueDates ? 'some actions have missing or invalid due dates' : 'caller-visible action coverage only'}.`}</small>
      </>}
      {!locationAvailable && <small>{!hasReports ? 'No eligible reports in this window.' : 'Complete incident and site retrieval is required for a reliable ranking.'}</small>}
      {dataQuality.unassignedFacility > 0 && <small>{dataQuality.unassignedFacility} reports lack an available site assignment and are excluded from site rankings.</small>}
      <small>Ranked by High/Critical count, open Critical, open High, then event count.</small>
      <small>Overdue actions describe the current authorized backlog, including older reports.</small>
    </Card>
    <Card title="Average Resolution Time" value={resolution.state === 'available' && resolution.averageDays !== null ? `${number(resolution.averageDays)} days` : 'Unavailable'}>
      <span>{resolution.sampleSize} valid closures in this window</span>
      <small>{resolution.changeDays !== null && resolution.state === 'available'
        ? `${signed(resolution.changeDays)} days versus previous period (${resolution.previousSampleSize} closures).`
        : 'Previous-period comparison unavailable.'}</small>
      <small>Reported timestamp to trusted closure timestamp; grouped by closure date.</small>
      <small>{resolution.legacyClosedWithoutEvidence} legacy closures without evidence; {resolution.invalidDurations} invalid durations excluded.</small>
      <Reasons reasons={resolution.reasons} />
    </Card>
  </div>
}
