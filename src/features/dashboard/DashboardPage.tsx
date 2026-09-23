import { lazy, Suspense, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { defaultDashboardFilters, type DashboardActivity, type DashboardFilters, type DashboardIncident, type DashboardMetric, type DashboardPageProps } from './dashboardTypes'
import { invalidateDashboardData, useDashboardData } from './useDashboardData'
import { AiSafetySummary } from './AiSafetySummary'
const DashboardCharts = lazy(() => import('./DashboardCharts'))
const SafetyMapCard = lazy(() => import('./SafetyMapCard').then((module) => ({ default: module.SafetyMapCard })))

const fallbackFilterOptions = {
  site: ['all'],
  department: ['all'],
  severity: ['all', 'low', 'medium', 'high', 'critical'],
  incidentType: ['all', 'Near Miss', 'Unsafe Condition', 'Unsafe Act', 'Environmental Incident', 'Slip/Trip/Fall'],
  shift: ['all', 'Day', 'Night'],
}

function normalizeIncidentCategoryName(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ')
  const legacyMap: Record<string, string> = {
    'near miss': 'Near Miss',
    'near-miss': 'Near Miss',
    'unsafe condition': 'Unsafe Condition',
    'unsafe act': 'Unsafe Act',
    'environmental incident': 'Environmental Incident',
    'environmental event': 'Environmental Incident',
    'slip trip fall': 'Slip/Trip/Fall',
    'slip/trip/fall': 'Slip/Trip/Fall',
  }
  return legacyMap[normalized] || value.trim()
}

function buildIncidentCategoryOptions(value: unknown): string[] {
  const candidate = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? ((value as Record<string, unknown>).items as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).categories as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).incident_categories as unknown[] | undefined)
        ?? []
      : []
  const names = candidate.flatMap((entry) => {
    const rawName = typeof entry === 'string' ? entry : entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).name === 'string' ? (entry as Record<string, unknown>).name as string : ''
    if (!rawName || (typeof entry === 'object' && entry !== null && 'active' in entry && (entry as Record<string, unknown>).active === false)) return []
    const name = normalizeIncidentCategoryName(rawName)
    return name ? [name] : []
  })
  return names.length ? ['all', ...names] : fallbackFilterOptions.incidentType
}

function buildSeverityOptions(value: unknown): string[] {
  const candidate = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? ((value as Record<string, unknown>).items as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).levels as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).severity_levels as unknown[] | undefined)
        ?? []
      : []

  const names = candidate.flatMap((entry) => {
    if (typeof entry === 'string') {
      const name = entry.trim()
      return name && name !== 'all' ? [name] : []
    }
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    return name && name.toLowerCase() !== 'all' && item.active !== false ? [name] : []
  })

  return ['all', ...names]
}

function buildDepartmentOptions(value: unknown): string[] {
  const candidate = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? ((value as Record<string, unknown>).items as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).departments as unknown[] | undefined)
        ?? []
      : []
  const names = candidate.flatMap((entry) => {
    const rawName = typeof entry === 'string' ? entry : entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).name === 'string' ? (entry as Record<string, unknown>).name as string : ''
    if (!rawName || (typeof entry === 'object' && entry !== null && 'active' in entry && (entry as Record<string, unknown>).active === false)) return []
    return rawName.trim() ? [rawName.trim()] : []
  })
  return ['all', ...names]
}

type DashboardShift = { name: string; start: string; end: string; active: boolean }

function buildShiftSettings(value: unknown): DashboardShift[] {
  const candidate = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).shifts) ? (value as Record<string, unknown>).shifts as unknown[] : []
  return candidate.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name || item.active === false) return []
    return [{ name, start: typeof item.start === 'string' ? item.start : '07:00', end: typeof item.end === 'string' ? item.end : '19:00', active: true }]
  })
}

function buildShiftOptions(value: unknown): string[] {
  return ['all', ...buildShiftSettings(value).map((shift) => shift.name)]
}

function buildSiteOptions(value: unknown): string[] {
  const candidate = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? ((value as Record<string, unknown>).sites as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).operational_sites as unknown[] | undefined)
        ?? []
      : []

  const names = candidate.flatMap((entry) => {
    if (typeof entry === 'string') {
      const name = entry.trim()
      return name ? [name] : []
    }
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    return name && item.active !== false ? [name] : []
  })

  return ['all', ...names]
}

function formatFilterLabel(value: string) {
  if (value === 'all') return 'All'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function DashboardHeader({ userName, organizationName, role }: Pick<DashboardPageProps, 'userName' | 'organizationName' | 'role'>) {
  const greeting = new Date().getHours() < 12 ? 'Good Morning' : new Date().getHours() < 18 ? 'Good Afternoon' : 'Good Evening'
  return <div className="dashboard-header"><div><div className="eyebrow">OPERATIONAL SAFETY OVERVIEW</div><h2>{greeting}, {userName}</h2><p>Monitor what requires attention across your safety operation.</p></div><div className="dashboard-context"><strong>{organizationName}</strong><span>{role}</span><span>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div></div>
}

function DashboardFilters({ filters, onChange, onReset, options }: { filters: DashboardFilters; onChange: (key: keyof DashboardFilters, value: string) => void; onReset: () => void; options: typeof fallbackFilterOptions }) {
  const fields: { key: keyof DashboardFilters; label: string; options: string[] }[] = [
    { key: 'site', label: 'Site', options: options.site },
    { key: 'department', label: 'Department', options: options.department },
    { key: 'dateRange', label: 'Date range', options: ['7d', '30d', '90d', 'all'] },
    { key: 'severity', label: 'Severity', options: options.severity },
    { key: 'incidentType', label: 'Incident category', options: options.incidentType },
    { key: 'shift', label: 'Shift', options: options.shift },
  ]
  return <div className="dashboard-filters"><div className="dashboard-filters-heading"><div><strong>Dashboard filters</strong><span>Filters are applied to available organization data.</span></div><button type="button" onClick={onReset}>Clear filters</button></div><div className="dashboard-filter-grid">{fields.map((field) => <label key={field.key}>{field.label}<select value={filters[field.key]} onChange={(event) => onChange(field.key, event.target.value)}>{field.options.map((option) => <option key={option} value={option}>{field.key === 'dateRange' ? formatFilterLabel(option.replace('d', ' days')) : formatFilterLabel(option)}</option>)}</select></label>)}</div></div>
}

function EmptyState({ message, action, actionHref = '#report-incident' }: { message: string; action?: string; actionHref?: string }) {
  return <div className="dashboard-empty"><span aria-hidden="true">○</span><strong>{message}</strong>{action && <a href={actionHref}>{action}</a>}</div>
}

function KpiCard({ metric }: { metric: DashboardMetric }) {
  return <article className={`dashboard-kpi tone-${metric.tone}`}><span className="dashboard-kpi-icon" aria-hidden="true">{metric.icon}</span><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small><a href={metric.href}>View details →</a></article>
}

function DashboardKpiGrid({ metrics }: { metrics: DashboardMetric[] }) {
  return <section><div className="dashboard-section-heading"><div><div className="eyebrow">CRITICAL ISSUES</div><h3>Safety at a glance</h3></div></div><div className="dashboard-kpi-grid">{metrics.map((metric) => <KpiCard key={metric.key} metric={metric} />)}</div></section>
}

function DashboardCard({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <article className="dashboard-card"><div className="dashboard-card-heading"><div><div className="eyebrow">{eyebrow}</div><h3>{title}</h3></div></div>{children}</article>
}

function DashboardOperationalGrid({ activities, recentIncidents, hasOperationalData }: { activities: DashboardActivity[]; recentIncidents: DashboardIncident[]; hasOperationalData: boolean }) {
  return <div className="dashboard-operational-grid"><DashboardCard eyebrow="TODAY'S ACTIVITIES" title="Recent activity">{activities.length ? <div className="dashboard-activity-list">{activities.slice(0, 5).map((activity) => <div key={activity.id}><span>{new Date(activity.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><strong>{activity.activity}</strong><small>{activity.location}</small></div>)}</div> : <EmptyState message="No recent activity recorded." action="Report the first incident" />}</DashboardCard><DashboardCard eyebrow="PERFORMANCE" title="Safety performance">{hasOperationalData ? <EmptyState message="Performance metrics will appear here." /> : <EmptyState message="No performance data available yet." />}</DashboardCard><DashboardCard eyebrow="INCIDENT INTELLIGENCE" title="Recent incidents">{recentIncidents.length ? <div className="dashboard-activity-list">{recentIncidents.map((incident) => <div key={incident.id}><span>{incident.referenceNumber}</span><strong><a href={`#incident-detail?id=${incident.id}`}>{incident.title}</a></strong><small>{incident.location || 'Location not set'} · {incident.severity || 'Severity not set'}</small></div>)}</div> : <EmptyState message="No incidents recorded yet." action="Start by reporting your first incident" />}</DashboardCard><DashboardCard eyebrow="RISK" title="Risk overview"><EmptyState message="Risk data will appear when incidents and assessments exist." /></DashboardCard><DashboardCard eyebrow="COMPLIANCE" title="Inspection and audit performance"><EmptyState message="No inspection or audit records available yet." /></DashboardCard></div>
}

function DashboardBottomGrid({ activities, canReportIncident, canCreateInspection, canCreateCorrectiveAction, canStartAudit, canViewReports }: { activities: DashboardActivity[]; canReportIncident: boolean; canCreateInspection: boolean; canCreateCorrectiveAction: boolean; canStartAudit: boolean; canViewReports: boolean }) {
  return <div className="dashboard-bottom-grid"><DashboardCard eyebrow="RECENT ACTIVITIES" title="Audit trail"><div className="dashboard-activity-list">{activities.length ? activities.slice(0, 8).map((activity) => <div key={activity.id}><span>{new Date(activity.createdAt).toLocaleDateString()}</span><strong>{activity.activity}</strong><small>{activity.userName} · {activity.location}</small></div>) : <EmptyState message="No activity has been recorded yet." />}</div><a className="dashboard-card-link" href="#activity-log">View activity log →</a></DashboardCard><DashboardCard eyebrow="QUICK ACTIONS" title="What needs to happen next"><div className="dashboard-quick-actions">{canReportIncident && <a className="primary-action" href="#report-incident">＋ Report incident</a>}{canCreateInspection && <a href="#inspections">Create inspection</a>}{canCreateCorrectiveAction && <a href="#corrective-actions">Create corrective action</a>}{canStartAudit && <a href="#audits">Start audit</a>}{canViewReports && <a href="#reports">View reports</a>}</div></DashboardCard><NotificationPanel activities={activities} /></div>
}

function NotificationPanel({ activities }: { activities: DashboardActivity[] }) {
  const notificationActivities = activities.filter((activity) => /incident|overdue|inspection|audit/i.test(activity.activity)).slice(0, 4)
  return <DashboardCard eyebrow="NOTIFICATIONS" title="Operational alerts"><div className="notification-list">{notificationActivities.length ? notificationActivities.map((activity) => <div key={activity.id}><strong>{activity.activity}</strong><small>{activity.location} · {new Date(activity.createdAt).toLocaleDateString()}</small></div>) : <EmptyState message="No new operational notifications." />}</div><div className="notification-placeholder"><strong>Permit alerts</strong><span>Coming with Permit-to-Work module.</span></div></DashboardCard>
}

export function DashboardPage({ organizationId, organizationName, userName, role, canReportIncident, canCreateInspection, canCreateCorrectiveAction, canStartAudit, canViewReports, supabase }: DashboardPageProps & { supabase: SupabaseClient }) {
  const [filters, setFilters] = useState(defaultDashboardFilters)
  const [filterOptions, setFilterOptions] = useState(fallbackFilterOptions)
  const [shiftSettings, setShiftSettings] = useState<DashboardShift[]>([])
  const [shiftStart, setShiftStart] = useState('07:00')
  const [shiftEnd, setShiftEnd] = useState('19:00')
  const queryClient = useQueryClient()
  const snapshot = useDashboardData(supabase, organizationId, filters)

  useEffect(() => {
    if (!organizationId) return

    let active = true
    const loadSettings = async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('working_hours, departments, operational_sites, emergency_contacts, severity_levels, incident_categories')
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (!active) return
      const configuredShifts = buildShiftSettings(data?.working_hours)
      setShiftSettings(configuredShifts)
      setFilterOptions((current) => ({
        ...current,
        shift: data?.working_hours ? buildShiftOptions(data.working_hours) : current.shift,
        department: data?.departments ? buildDepartmentOptions(data.departments) : current.department,
        site: data?.operational_sites ? buildSiteOptions(data.operational_sites) : current.site,
        severity: data?.severity_levels ? buildSeverityOptions(data.severity_levels) : current.severity,
        incidentType: data?.incident_categories ? buildIncidentCategoryOptions(data.incident_categories) : current.incidentType,
      }))
    }
    const handleSettingsUpdated = () => {
      void loadSettings()
      void invalidateDashboardData(queryClient, organizationId)
    }
    void loadSettings()
    window.addEventListener('company-settings-updated', handleSettingsUpdated)

    return () => {
      active = false
      window.removeEventListener('company-settings-updated', handleSettingsUpdated)
    }
  }, [organizationId, queryClient, supabase])

  const updateFilter = (key: keyof DashboardFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }))
    if (key === 'shift') {
      const selectedShift = shiftSettings.find((shift) => shift.name === value)
      if (selectedShift) {
        setShiftStart(selectedShift.start)
        setShiftEnd(selectedShift.end)
      }
    }
  }
  const resetFilters = () => {
    setFilters(defaultDashboardFilters)
    setShiftStart('07:00')
    setShiftEnd('19:00')
  }
  return <div className="dashboard-page"><DashboardHeader userName={userName} organizationName={organizationName} role={role} /><DashboardFilters filters={filters} options={filterOptions} onChange={updateFilter} onReset={resetFilters} />{filters.shift !== 'all' && <div className="dashboard-shift-times"><strong>{filters.shift} shift timing</strong><label>Start time<input type="time" value={shiftStart} onChange={(event) => setShiftStart(event.target.value)} /></label><label>End time<input type="time" value={shiftEnd} onChange={(event) => setShiftEnd(event.target.value)} /></label></div>}{snapshot.isLoading && <div className="dashboard-loading">Loading operational dashboard data...</div>}{snapshot.isError && <div className="auth-message error">Unable to load dashboard data. Please try again.</div>}{snapshot.data && <><DashboardKpiGrid metrics={snapshot.data.metrics} /><Suspense fallback={<div className="dashboard-loading">Loading analytics modules...</div>}><section className="dashboard-charts-section"><div className="dashboard-section-heading"><div><div className="eyebrow">ANALYTICS</div><h3>Operational performance and risk</h3></div></div><DashboardCharts data={snapshot.data} /></section><SafetyMapCard sites={snapshot.data.sites} /></Suspense><DashboardOperationalGrid activities={snapshot.data.activities} recentIncidents={snapshot.data.recentIncidents} hasOperationalData={snapshot.data.hasOperationalData} /><DashboardBottomGrid activities={snapshot.data.activities} canReportIncident={canReportIncident} canCreateInspection={canCreateInspection} canCreateCorrectiveAction={canCreateCorrectiveAction} canStartAudit={canStartAudit} canViewReports={canViewReports} /><AiSafetySummary organizationId={organizationId} role={role} hasAuthorizedQhseData={snapshot.data.hasOperationalData} /></>}</div>
}
