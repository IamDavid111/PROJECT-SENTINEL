import { z } from 'zod'
import {
  safetySnapshotSchema, safetyMethodologyVersion,
  type SafetyDataset, type SafetyFilters, type SafetyIncident, type SafetyScope, type SafetySnapshot,
} from './safetyIntelligenceContracts.ts'

const day = 86_400_000
const severityRanks: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 }

export function effectiveSafetySeverity(actual: string | null, potential: string | null): number | null {
  const supplied = [actual, potential].flatMap((value) => value?.trim() ? [value.trim().toLowerCase()] : [])
  if (!supplied.length || supplied.some((value) => !Object.hasOwn(severityRanks, value))) return null
  return Math.max(...supplied.map((value) => severityRanks[value]))
}

const validTimestamp = z.iso.datetime({ offset: true })
function timestamp(value: string | null) {
  if (!value || !validTimestamp.safeParse(value).success) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}
function between(value: string | null, start: number, end: number) {
  const time = timestamp(value)
  return time !== null && time >= start && time < end
}
function isOpen(incident: SafetyIncident) { return incident.status !== 'draft' && incident.status !== 'closed' }
function severity(incident: SafetyIncident) { return effectiveSafetySeverity(incident.severity, incident.potential_severity) }
function isHigh(incident: SafetyIncident) { return (severity(incident) ?? 0) >= 3 }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null }
const iso = (time: number) => new Date(time).toISOString()

export function calculateSafetySnapshot(
  dataset: SafetyDataset, scope: SafetyScope, filters: SafetyFilters, asOf: Date, generatedAt = asOf,
): SafetySnapshot {
  if (!Number.isFinite(asOf.getTime()) || !Number.isFinite(generatedAt.getTime())) throw new Error('Invalid snapshot timestamp.')
  const end = asOf.getTime()
  const start = end - filters.days * day
  const previousStart = start - filters.days * day
  const indicatorStart = end - 90 * day
  const recentStart = end - 14 * day
  const currentMonth = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1)
  const previousMonth = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 1, 1)
  const previousMonthEnd = Math.min(previousMonth + end - currentMonth, currentMonth)
  const windows = {
    reporting: { start: iso(start), end: iso(end) },
    previousResolution: { start: iso(previousStart), end: iso(start) },
    nearMissCurrent: { start: iso(currentMonth), end: iso(end) },
    nearMissPrevious: { start: iso(previousMonth), end: iso(previousMonthEnd) },
    indicator: { start: iso(indicatorStart), end: iso(end) },
    recent: { start: iso(recentStart), end: iso(end) },
  }
  const { rows, coverage } = dataset
  // Pure calculations still verify scope, so future callers cannot accidentally mix tenant datasets.
  for (const collection of Object.values(rows)) {
    if (collection.some((row) => row.organization_id !== scope.organizationId)) throw new Error('Snapshot scope mismatch.')
  }
  const incidents = rows.incidents.filter((row) => row.status !== 'draft'
    && (!scope.siteId || row.site_id === scope.siteId))
  const observed = incidents.filter((row) => {
    const reported = timestamp(row.reported_at)
    return reported === null || reported < end
  })
  const byId = new Map(observed.map((row) => [row.id, row]))
  const actions = rows.actions.filter((row) => byId.has(row.incident_id))
  const sourceComplete = (...sources: SafetyDataset['coverage'][number]['source'][]) =>
    sources.every((source) => coverage.some((entry) => entry.source === source && entry.complete))
  const missingReportedAt = incidents.filter((row) => timestamp(row.reported_at) === null).length
  const futureReportedAt = incidents.filter((row) => (timestamp(row.reported_at) ?? -Infinity) >= end).length
  const selected = observed.filter((row) => between(row.reported_at, start, end))
  const unclassified = selected.filter((row) => severity(row) === null).length
  const uncategorized = selected.filter((row) => !row.incident_category?.trim()).length
  const highRisk = selected.filter(isHigh)
  const openHighRisk = highRisk.filter(isOpen)
  const reportReasons = [
    ...(!sourceComplete('incidents') ? ['Incident retrieval is incomplete.'] : []),
    ...(missingReportedAt ? ['Some authorized reports have missing or invalid reporting timestamps.'] : []),
    ...(futureReportedAt ? ['Reports at or after the snapshot cutoff are excluded.'] : []),
  ]
  const uncertainReporting = !sourceComplete('incidents') || missingReportedAt > 0
  const riskReasons = [
    ...reportReasons,
    ...(unclassified ? ['Some eligible severities require explicit mapping.'] : []),
    ...(selected.length < 10 ? ['At least 10 eligible classified reports are required.'] : []),
  ]
  const riskState = uncertainReporting ? 'incomplete' : unclassified || selected.length < 10 ? 'insufficient' : 'available'
  // Integer weights keep exact 30/60 thresholds stable without rounding the approved index.
  // It describes reported events, not accident probability or exposure.
  const score = riskState === 'available'
    ? (70 * highRisk.length + 30 * openHighRisk.length) / selected.length : null
  const riskBand = score === null ? null : score < 30 ? 'Low' : score < 60 ? 'Medium' : 'High'

  const nearMissCurrent = incidents.filter((row) => row.report_type === 'near_miss' && between(row.reported_at, currentMonth, end)).length
  const nearMissPrevious = incidents.filter((row) => row.report_type === 'near_miss' && between(row.reported_at, previousMonth, previousMonthEnd)).length
  const percentageChange = !uncertainReporting && nearMissPrevious
    ? 100 * (nearMissCurrent - nearMissPrevious) / nearMissPrevious : null
  const direction = nearMissPrevious === 0
    ? nearMissCurrent ? 'new_reporting' : 'no_reports'
    : nearMissCurrent > nearMissPrevious ? 'up' : nearMissCurrent < nearMissPrevious ? 'down' : 'unchanged'
  const categories = new Map<string, number>()
  for (const row of selected) {
    const category = row.incident_category?.trim()
    if (category) categories.set(category, (categories.get(category) ?? 0) + 1)
  }
  const category = [...categories].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]

  const validClosureIds = new Set<string>()
  const durations: number[] = []
  const previousDurations: number[] = []
  let invalidDurations = 0
  for (const closure of rows.closures) {
    const incident = byId.get(closure.incident_id)
    if (!incident || incident.status !== 'closed') continue
    validClosureIds.add(incident.id)
    const closedAt = timestamp(closure.closed_at)
    const reportedAt = timestamp(incident.reported_at)
    if (closedAt === null || reportedAt === null || closedAt < reportedAt) { invalidDurations++; continue }
    if (closedAt >= start && closedAt < end) durations.push((closedAt - reportedAt) / day)
    if (closedAt >= previousStart && closedAt < start) previousDurations.push((closedAt - reportedAt) / day)
  }
  const resolutionComplete = sourceComplete('incidents', 'closures')
  const averageDays = resolutionComplete ? average(durations) : null
  const previousAverageDays = resolutionComplete ? average(previousDurations) : null
  const legacyClosedWithoutEvidence = observed.filter((row) => row.status === 'closed' && !validClosureIds.has(row.id)).length
  const resolutionReasons = [
    ...(!resolutionComplete ? ['Incident or closure retrieval is incomplete.'] : []),
    ...(legacyClosedWithoutEvidence ? ['Legacy closed reports without structured evidence are excluded.'] : []),
    ...(invalidDurations ? ['Missing, invalid or negative closure durations are excluded.'] : []),
    ...(!durations.length ? ['No valid closure durations in this window.'] : []),
  ]

  const location = (level: 'facility' | 'site', id: string, name: string) => {
    const atLocation = observed.filter((row) => row.site_id === id && row.report_type === 'incident')
    const windowReports = atLocation.filter((row) => between(row.reported_at, start, end))
    const indicatorReports = atLocation.filter((row) => between(row.reported_at, indicatorStart, end))
    const locationIds = new Set(atLocation.map((row) => row.id))
    const locationActions = actions.filter((row) => locationIds.has(row.incident_id))
    let invalidActionDueDates = 0
    const overdue = locationActions.filter((row) => {
      if (row.status === 'verified' || row.status === 'closed') return false
      // PostgreSQL due_date is date-only: work becomes overdue after that UTC day finishes.
      const due = row.due_date && /^\d{4}-\d{2}-\d{2}$/.test(row.due_date)
        ? timestamp(`${row.due_date}T00:00:00.000Z`) : null
      if (due === null || iso(due).slice(0, 10) !== row.due_date) { invalidActionDueDates++; return false }
      return due + day <= end
    })
    return {
      level, id, name, count: windowReports.length,
      highRiskCount: windowReports.filter(isHigh).length,
      openHighCount: windowReports.filter((row) => isOpen(row) && severity(row) === 3).length,
      openCriticalCount: windowReports.filter((row) => isOpen(row) && severity(row) === 4).length,
      overdueActions: overdue.length,
      unclassified: indicatorReports.filter((row) => severity(row) === null).length,
      recentHighRiskCount: atLocation.filter((row) => isHigh(row) && between(row.reported_at, recentStart, end)).length,
      indicatorSampleSize: indicatorReports.filter((row) => severity(row) !== null).length,
      backlogOpenCritical: atLocation.filter((row) => isOpen(row) && severity(row) === 4).length,
      backlogOpenHigh: atLocation.filter((row) => isOpen(row) && severity(row) === 3).length,
      backlogUnclassified: atLocation.filter((row) => isOpen(row) && severity(row) === null).length,
      missingReportedAt: atLocation.filter((row) => timestamp(row.reported_at) === null).length,
      overdueCriticalActions: overdue.filter((row) => {
        const parent = byId.get(row.incident_id)
        return parent && severity(parent) === 4
      }).length,
      invalidActionDueDates,
      evidenceIncidentIds: windowReports.filter(isHigh).map((row) => row.id).sort().slice(0, 20),
    }
  }
  const compareLocations = (a: SafetySnapshot['locations'][number], b: SafetySnapshot['locations'][number]) =>
    b.highRiskCount - a.highRiskCount || b.openCriticalCount - a.openCriticalCount
    || b.openHighCount - a.openHighCount || b.count - a.count
    || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  const sites = rows.sites.filter((row) => !scope.siteId || row.id === scope.siteId)
    .map((row) => location('site', row.id, row.name))
  const locations = sites.sort(compareLocations)

  const evidence: SafetySnapshot['evidence'] = []
  let characters = 0
  let evidenceTruncated = false
  const addEvidence = (source: SafetySnapshot['evidence'][number]['source'], id: string, incidentId: string | undefined, label: string, excerpt: string) => {
    const item = { source, id, ...(incidentId ? { incidentId } : {}), label: label.slice(0, 200), excerpt: excerpt.slice(0, 1000) }
    const size = item.label.length + item.excerpt.length
    if (evidence.length >= 80 || characters + size > 24_000) { evidenceTruncated = true; return }
    evidence.push(item)
    characters += size
  }
  const relevant = new Set(observed.filter((row) => isOpen(row) || between(row.reported_at, indicatorStart, end)
    || rows.closures.some((closure) => closure.incident_id === row.id && between(closure.closed_at, previousStart, end)))
    .map((row) => row.id))
  for (const row of observed.filter((row) => relevant.has(row.id)).sort((a, b) => a.id.localeCompare(b.id))) {
    addEvidence('incidents', row.id, row.id, row.reference_number, row.title)
  }
  for (const row of actions.filter((row) => relevant.has(row.incident_id))) addEvidence('actions', row.id, row.incident_id, 'Corrective action', row.title)
  const investigations = rows.investigations.filter((row) => relevant.has(row.incident_id))
  const investigationMap = new Map(investigations.map((row) => [row.id, row]))
  for (const row of investigations) addEvidence('investigations', row.id, row.incident_id, `Investigation (${row.status})`, row.findings_summary ?? '')
  for (const row of rows.causes) {
    const parent = investigationMap.get(row.investigation_id)
    if (parent) addEvidence('causes', row.id, parent.incident_id, `Recorded cause (${parent.status})`, row.root_cause_statement)
  }
  for (const row of rows.findings) {
    const parent = investigationMap.get(row.investigation_id)
    if (parent) addEvidence('findings', row.id, parent.incident_id, 'Recorded finding', row.description)
  }
  for (const row of rows.closures.filter((row) => relevant.has(row.incident_id))) {
    addEvidence('closures', row.incident_id, row.incident_id, 'Human-authored closure evidence', `${row.root_cause}\n${row.corrective_action}`)
  }
  return safetySnapshotSchema.parse({
    methodologyVersion: safetyMethodologyVersion, origin: 'deterministic', authoritative: false,
    generatedAt: generatedAt.toISOString(), asOf: asOf.toISOString(), timezone: 'UTC', scope, filters, windows, coverage,
    dataQuality: {
      missingReportedAt, futureReportedAt, unclassified, uncategorized,
      // Retain the response field for compatibility; facility means the incident form's site.
      unassignedFacility: selected.filter((row) => !row.site_id || !rows.sites.some((site) => site.id === row.site_id)).length,
    },
    metrics: {
      risk: { state: riskState, reasons: riskReasons, score, band: riskBand, sampleSize: selected.length - unclassified, changePoints: null, comparisonReason: 'Historical open-state observations are unavailable.' },
      highRisk: { state: uncertainReporting || unclassified ? 'incomplete' : 'available', reasons: [...reportReasons, ...(unclassified ? ['Unknown severity reports are excluded from known high-risk counts.'] : [])], count: highRisk.length, openCount: openHighRisk.length },
      nearMiss: { state: uncertainReporting ? 'incomplete' : 'available', reasons: reportReasons, currentCount: nearMissCurrent, previousCount: nearMissPrevious, percentageChange, direction },
      category: { state: uncertainReporting ? 'incomplete' : category ? 'available' : 'unavailable', reasons: [...reportReasons, ...(!category ? ['No categorized reports in this window.'] : [])], label: category?.[0] ?? null, count: category?.[1] ?? 0, share: category && !uncertainReporting ? 100 * category[1] / selected.length : null, denominator: selected.length },
      resolution: { state: !resolutionComplete ? 'incomplete' : durations.length ? 'available' : 'insufficient', reasons: resolutionReasons, averageDays, previousAverageDays, changeDays: averageDays !== null && previousAverageDays !== null ? averageDays - previousAverageDays : null, sampleSize: durations.length, previousSampleSize: previousDurations.length, legacyClosedWithoutEvidence, invalidDurations },
    },
    locations, evidence, evidenceTruncated,
    limitations: [
      'Read-only live observations, not a transactionally frozen historical snapshot.',
      'Only caller-authorized records are represented; invisible record totals are not disclosed.',
      'No enforced site assignments; site filters only narrow existing record visibility.',
      'Risk index is deterministic and uncalibrated, not accident probability or machine learning.',
      'Historical risk-score changes are unavailable.',
      'Inspections, operational audits, procedures, regulatory libraries and trained prediction are unavailable.',
      'Location drivers are inputs for later advisory guidance and planning indicators, not predictions.',
      ...(coverage.some((entry) => !entry.complete) ? ['Some sources exceeded retrieval limits; do not interpret partial rankings/counts as complete.'] : []),
      ...(coverage.some((entry) => entry.source === 'actions' && entry.access === 'caller_visible') ? ['Action coverage is caller-visible only; absence does not prove there are no other organization actions.'] : []),
      ...(evidenceTruncated ? ['Evidence excerpts are bounded; they are not the complete aggregate dataset.'] : []),
    ],
  })
}
