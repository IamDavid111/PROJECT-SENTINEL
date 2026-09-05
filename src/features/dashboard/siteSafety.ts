export type SiteSafetyStatus = 'normal' | 'warning' | 'critical' | 'unknown'

export type SiteSafetyInputs = {
  recentIncidents?: number
  highSeverityIncidents?: number
  overdueCorrectiveActions?: number
  inspectionFindings?: number
  riskAssessments?: number
  complianceIssues?: number
}

export type SafetySite = {
  id: string
  name: string
  latitude: number
  longitude: number
  status: SiteSafetyStatus
  statusLabel: string
}

export function calculateSiteSafetyStatus(input: SiteSafetyInputs): SiteSafetyStatus {
  const values = Object.values(input).filter((value): value is number => typeof value === 'number')
  if (!values.length || values.every((value) => value === 0)) return 'unknown'
  if ((input.highSeverityIncidents || 0) > 0 || (input.complianceIssues || 0) > 0) return 'critical'
  if ((input.overdueCorrectiveActions || 0) > 0 || (input.inspectionFindings || 0) > 0) return 'warning'
  return 'normal'
}

export function getSiteStatusLabel(status: SiteSafetyStatus) {
  return status === 'unknown' ? 'No data' : status.charAt(0).toUpperCase() + status.slice(1)
}
