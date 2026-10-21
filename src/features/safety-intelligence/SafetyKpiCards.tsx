import { Children, type ReactNode } from 'react'
import { Activity, AlertTriangle, CheckCircle2, ClipboardCheck, Clock, ListChecks, MapPin, ShieldCheck, Sparkles, Tags, TrendingUp, type LucideIcon } from 'lucide-react'
import type { SafetySnapshot } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'

// Round for presentation only; the server already assigned the band using the unrounded score.
const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 1 })
const signed = (value: number) => `${value > 0 ? '+' : ''}${number(value)}`

function Card({ title, value, children, band, tone = 'blue', icon: Icon = Sparkles }: {
  title: string; value: ReactNode; children: ReactNode; band?: 'High' | 'Medium' | 'Low' | null;
  tone?: 'teal' | 'blue' | 'green' | 'amber' | 'red'; icon?: LucideIcon;
}) {
  const content = Children.toArray(children)
  return <article className={`dashboard-kpi safety-kpi safety-kpi-${tone}${band ? ` safety-risk-${band.toLowerCase()}` : ''}`}>
    <h3>{title}</h3>
    <strong className="safety-kpi-value">{value}</strong>
    <Icon className="safety-kpi-icon" size={18} aria-hidden="true" />
    <div className="safety-kpi-description">{content.slice(0, 2)}</div>
  </article>
}

function Reasons({ reasons }: { reasons: string[] }) {
  return reasons.length ? <ul className="safety-kpi-reasons">{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null
}

export function SafetyKpiCards({ snapshot }: { snapshot: SafetySnapshot }) {
  const { metrics, coverage, dataQuality } = snapshot
  const { risk, highRisk, nearMiss, category, resolution } = metrics
  const { incidentCounts, outstandingActions } = metrics
  const allTime = snapshot.filters.days === 'all'
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
    : allTime ? number(nearMiss.currentCount)
    : nearMiss.percentageChange !== null ? `${signed(nearMiss.percentageChange)}%`
      : nearMiss.direction === 'new_reporting' ? 'New reporting' : 'No reports'
  const direction = nearMiss.direction === 'up' || nearMiss.direction === 'new_reporting' ? '↑'
    : nearMiss.direction === 'down' ? '↓' : '→'
  return <div className="safety-kpi-grid" aria-label="Safety Intelligence metrics">
    {(['total', 'open', 'closed'] as const).map((kind) => <Card key={kind}
      tone={kind === 'total' ? 'blue' : kind === 'open' ? 'amber' : 'green'}
      icon={kind === 'total' ? Activity : kind === 'open' ? AlertTriangle : CheckCircle2}
      title={`${kind === 'total' ? 'Total' : kind === 'open' ? 'Open' : 'Closed'} Incidents`}
      value={incidentCounts ? number(incidentCounts[kind]) : 'Unavailable'}>
      {incidentCounts?.state === 'incomplete' && <span>Known counts only</span>}
      <small>{kind === 'total' ? 'Incident reports only; excludes drafts and other report types.'
        : kind === 'open' ? 'Current nonterminal status of incidents reported in this window.'
          : 'Currently closed incidents reported in this window; not closures during the window.'}</small>
      {incidentCounts?.state === 'incomplete' && <small>Known counts only; incomplete reporting coverage.</small>}
      {!incidentCounts && <small>The deployed snapshot endpoint does not yet provide incident counts.</small>}
      {incidentCounts && <Reasons reasons={incidentCounts.reasons} />}
    </Card>)}
    <Card title="AI Risk Level" icon={ShieldCheck} tone={riskAvailable ? risk.band === 'High' ? 'red' : risk.band === 'Medium' ? 'amber' : 'green' : 'teal'} value={riskAvailable && risk.score !== null ? `${number(risk.score)} / 100` : 'Insufficient data'} band={riskAvailable ? risk.band : null}>
      {riskAvailable && <span>{risk.band} · Deterministic reported-event index</span>}
      {!riskAvailable && <span>{risk.state === 'incomplete' ? 'Incomplete coverage' : 'Deterministic index unavailable'}</span>}
      <small>{risk.sampleSize} classified reports. Not ML or accident probability.</small>
    </Card>
    <Card title="High-Risk Incidents" tone="red" icon={AlertTriangle} value={highKnown ? number(highRisk.count) : 'Unavailable'}>
      {highKnown && <small>{number(highRisk.openCount)} still open</small>}
      {highKnown && highRisk.state === 'incomplete' && <small>Known counts only; incomplete coverage.</small>}
      {!hasReports && <small>No eligible reports in this window.</small>}
      <Reasons reasons={highRisk.reasons} />
    </Card>
    <Card title="Near-Miss Trend" tone="teal" icon={TrendingUp} value={trend}>
      {trendAvailable && <span>{allTime ? 'Submitted near-miss reports' : `${direction} ${nearMiss.direction === 'down' ? 'Reporting decreased' : nearMiss.direction === 'up' || nearMiss.direction === 'new_reporting' ? 'Reporting increased' : 'Reporting unchanged'}`}</span>}
      <small>{allTime ? 'No comparable previous period exists for the full historical dataset.' : <>{!trendAvailable && 'Known counts only: '}{nearMiss.currentCount} current / {nearMiss.previousCount} previous comparable month-to-date reports.</>}</small>
      {!trendAvailable && <small>Reporting direction does not establish a change in danger.</small>}
    </Card>
    <Card title="Most Common Reported Category" tone="blue" icon={Tags} value={category.state === 'available' && category.label ? category.label : 'Unavailable'}>
      {category.state === 'available' && category.share !== null && <span>{number(category.share)}% of {category.denominator} reported events</span>}
      <small>{dataQuality.uncategorized} uncategorized reports. Categories are not a verified hazard taxonomy.</small>
      <Reasons reasons={category.reasons} />
    </Card>
    <Card title="Highest Risk Site" tone="red" icon={MapPin} value={locationAvailable ? location?.name : 'Unavailable'}>
      {locationAvailable && location && <>
        <span>{number(location.highRiskCount)} High/Critical incidents · {number(location.count)} total incidents</span>
        <small>{actionsComplete && !location.invalidActionDueDates
          ? `${number(location.overdueActions)} overdue corrective actions`
          : `${number(location.overdueActions)} known overdue actions; ${!actionCoverage?.complete ? 'action retrieval incomplete' : location.invalidActionDueDates ? 'some actions have missing or invalid due dates' : 'caller-visible action coverage only'}.`}</small>
      </>}
      {!locationAvailable && <small>{!hasReports ? 'No eligible reports in this window.' : 'Complete incident and site retrieval is required for a reliable ranking.'}</small>}
      {dataQuality.unassignedFacility > 0 && <small>{dataQuality.unassignedFacility} reports lack an available site assignment and are excluded from site rankings.</small>}
      <small>Ranked by High/Critical count, open Critical, open High, then event count.</small>
    </Card>
    <Card title="Average Resolution Time" tone="teal" icon={Clock} value={resolution.state === 'available' && resolution.averageDays !== null ? `${number(resolution.averageDays)} days` : 'Unavailable'}>
      <span>{resolution.sampleSize} valid closures in this window</span>
      <small>{resolution.changeDays !== null && resolution.state === 'available'
        ? `${signed(resolution.changeDays)} days versus previous period (${resolution.previousSampleSize} closures).`
        : 'Previous-period comparison unavailable.'}</small>
    </Card>
    <Card title="Corrective Action On-Time Closure" tone="blue" icon={ClipboardCheck} value="Unavailable">
      <span>Actual corrective-action closure dates are not recorded.</span>
      <small>Not an overall regulatory compliance score.</small>
    </Card>
    <Card title="Outstanding Actions" tone="amber" icon={ListChecks} value={outstandingActions ? number(outstandingActions.count) : 'Unavailable'}>
      <span>Current authorized backlog{outstandingActions?.state === 'incomplete' ? ' · Known counts only' : ''}
        {actionCoverage?.access === 'caller_visible' ? ' · Caller-visible actions only' : ''}</span>
      <small>Excludes verified and closed actions; pending verification and rejected/rework actions remain outstanding.</small>
    </Card>
  </div>
}
