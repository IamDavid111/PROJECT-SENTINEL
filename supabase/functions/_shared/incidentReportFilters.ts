const severityAliases: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
  low: 'low', lowrisk: 'low', lowseverity: 'low',
  medium: 'medium', mediumrisk: 'medium', mediumseverity: 'medium',
  high: 'high', highrisk: 'high', highseverity: 'high',
  critical: 'critical', criticalrisk: 'critical', criticalseverity: 'critical',
}
const incidentStatuses = ['draft', 'submitted', 'under_review', 'investigation', 'corrective_action', 'pending_verification', 'closed'] as const
const incidentStatusAliases: Record<string, (typeof incidentStatuses)[number]> = {
  draft: 'draft', draftreport: 'draft', savedraft: 'draft', submitted: 'submitted', underreview: 'under_review', investigation: 'investigation',
  correctiveaction: 'corrective_action', pendingverification: 'pending_verification', closed: 'closed', resolved: 'closed',
}

function normalizeLabel(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z0-9]/g, '') : ''
}

export function normalizeIncidentSeverity(value: unknown) {
  return severityAliases[normalizeLabel(value)] ?? null
}

export function matchesIncidentSeverity(value: unknown, selected: unknown) {
  const severity = normalizeIncidentSeverity(value)
  return severity !== null && severity === normalizeIncidentSeverity(selected)
}

export function normalizeIncidentStatus(status: unknown) {
  const normalized = normalizeLabel(status)
  return incidentStatusAliases[normalized] ?? (typeof status === 'string' ? status.trim() : '')
}

export function normalizeIncidentReportType(reportType: unknown) {
  return normalizeLabel(reportType) === 'nearmiss' ? 'near_miss' : normalizeLabel(reportType)
}

export function incidentSeverityFilterPatterns(selected: unknown) {
  const severity = normalizeIncidentSeverity(selected)
  if (severity) return [severity, `${severity}%risk`, `${severity}%severity`]
  const exact = typeof selected === 'string' ? selected.trim().toLowerCase() : ''
  return exact ? [exact] : []
}

export function isDraftIncidentStatus(status: unknown) {
  return normalizeIncidentStatus(status) === 'draft'
}

export function isClosedIncidentStatus(status: unknown) {
  return normalizeIncidentStatus(status) === 'closed'
}

export function isOpenIncidentStatus(status: unknown, includeDrafts = false) {
  return !isClosedIncidentStatus(status) && (includeDrafts || !isDraftIncidentStatus(status))
}

export function openIncidentStatuses(includeDrafts = false) {
  return incidentStatuses.filter((status) => isOpenIncidentStatus(status, includeDrafts))
}

export function isUnfinishedCorrectiveActionStatus(status: unknown) {
  return !['verified', 'closed', 'resolved', 'complete', 'completed'].includes(normalizeLabel(status))
}

export function isActionDueNotPassed(dueDate: unknown, asOf: Date) {
  if (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return false
  const parsed = new Date(`${dueDate}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dueDate) return false
  return dueDate >= asOf.toISOString().slice(0, 10)
}
