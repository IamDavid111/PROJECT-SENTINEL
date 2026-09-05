import type { Role } from '../../types'
import type { SafetySite } from './siteSafety'

export type DashboardFilters = {
  site: string
  department: string
  dateRange: '7d' | '30d' | '90d' | 'all'
  severity: string
  incidentType: string
  contractor: string
  shift: string
}

export const defaultDashboardFilters: DashboardFilters = {
  site: 'all',
  department: 'all',
  dateRange: '30d',
  severity: 'all',
  incidentType: 'all',
  contractor: 'all',
  shift: 'all',
}

export type DashboardActivity = {
  id: string
  createdAt: string
  activity: string
  userId: string | null
  userName: string
  location: string
  metadata: Record<string, unknown>
}

export type DashboardMetric = {
  key: string
  label: string
  value: string
  detail: string
  icon: string
  href: string
  available: boolean
  tone: 'green' | 'orange' | 'neutral'
}

export type DashboardTrendPoint = { label: string; incidents: number; nearMisses: number }
export type DashboardDistributionPoint = { name: string; value: number }
export type DashboardComparisonPoint = { name: string; value: number }
export type CorrectiveActionPoint = { status: string; value: number }
export type InspectionSummary = { scheduled: number; completed: number; overdue: number; findings: number }

export type DashboardSnapshot = {
  activities: DashboardActivity[]
  metrics: DashboardMetric[]
  incidentTrend: DashboardTrendPoint[]
  incidentSeverity: DashboardDistributionPoint[]
  incidentTypes: DashboardDistributionPoint[]
  departmentComparison: DashboardComparisonPoint[]
  siteComparison: DashboardComparisonPoint[]
  correctiveActions: CorrectiveActionPoint[]
  inspections: InspectionSummary | null
  sites: SafetySite[]
  configuredIncidentTypes: string[]
  configuredDepartments: string[]
  configuredSites: string[]
  hasOperationalData: boolean
}

export type DashboardPageProps = {
  organizationId: string
  organizationName: string
  userName: string
  role: Role
  canReportIncident: boolean
  canCreateInspection: boolean
  canCreateCorrectiveAction: boolean
  canStartAudit: boolean
  canViewReports: boolean
}
