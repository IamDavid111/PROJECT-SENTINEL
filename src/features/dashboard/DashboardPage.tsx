import { lazy, Suspense, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReactNode } from 'react'

import { defaultDashboardFilters, type DashboardActivity, type DashboardFilters, type DashboardIncident, type DashboardMetric, type DashboardPageProps } from './dashboardTypes'
import { useDashboardData } from './useDashboardData'
import { AiSafetySummary } from './AiSafetySummary'
const DashboardCharts = lazy(() => import('./DashboardCharts'))
const SafetyMapCard = lazy(() => import('./SafetyMapCard').then((module) => ({ default: module.SafetyMapCard })))

const filterOptions = {
  site: ['all'],
  department: ['all'],
  severity: ['all', 'low', 'medium', 'high', 'critical'],
  incidentType: ['all'],
  contractor: ['all'],
  shift: ['all', 'day', 'night'],
}

function formatFilterLabel(value: string) {
  if (value === 'all') return 'All'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function DashboardHeader({ userName, organizationName, role }: Pick<DashboardPageProps, 'userName' | 'organizationName' | 'role'>) {
  const greeting = new Date().getHours() < 12 ? 'Good Morning' : new Date().getHours() < 18 ? 'Good Afternoon' : 'Good Evening'
  return <div className="dashboard-header"><div><div className="eyebrow">OPERATIONAL SAFETY OVERVIEW</div><h2>{greeting}, {userName}</h2><p>Monitor what requires attention across your safety operation.</p></div><div className="dashboard-context"><strong>{organizationName}</strong><span>{role}</span><span>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div></div>
}

function DashboardFilters({ filters, onChange, onReset }: { filters: DashboardFilters; onChange: (key: keyof DashboardFilters, value: string) => void; onReset: () => void }) {
  const fields: { key: keyof DashboardFilters; label: string; options: string[] }[] = [
    { key: 'site', label: 'Site', options: filterOptions.site },
    { key: 'department', label: 'Department', options: filterOptions.department },
    { key: 'dateRange', label: 'Date range', options: ['7d', '30d', '90d', 'all'] },
    { key: 'severity', label: 'Severity', options: filterOptions.severity },
    { key: 'incidentType', label: 'Incident type', options: filterOptions.incidentType },
    { key: 'contractor', label: 'Contractor', options: filterOptions.contractor },
    { key: 'shift', label: 'Shift', options: filterOptions.shift },
  ]
  return <div className="dashboard-filters"><div className="dashboard-filters-heading"><div><strong>Dashboard filters</strong><span>Filters are applied to available organization data.</span></div><button type="button" onClick={onReset}>Clear filters</button></div><div className="dashboard-filter-grid">{fields.map((field) => <label key={field.key}>{field.label}<select value={filters[field.key]} onChange={(event) => onChange(field.key, event.target.value)}>{field.options.map((option) => <option key={option} value={option}>{field.key === 'dateRange' ? formatFilterLabel(option.replace('d', ' days')) : formatFilterLabel(option)}</option>)}</select></label>)}</div></div>
}

function EmptyState({ message, action }: { message: string; action?: string }) {
  return <div className="dashboard-empty"><span aria-hidden="true">○</span><strong>{message}</strong>{action && <a href="#report-incident">{action}</a>}</div>
}

function KpiCard({ metric }: { metric: DashboardMetric }) {
  return <article className={`dashboard-kpi tone-${metric.tone}`}><span className="dashboard-kpi-icon" aria-hidden="true">{metric.icon}</span><span>{metric.label}</span><strong>{metric.value}</strong><a href={metric.href}>View details →</a></article>
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
  const snapshot = useDashboardData(supabase, organizationId, filters)
  const updateFilter = (key: keyof DashboardFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }))
  return <div className="dashboard-page"><DashboardHeader userName={userName} organizationName={organizationName} role={role} /><DashboardFilters filters={filters} onChange={updateFilter} onReset={() => setFilters(defaultDashboardFilters)} />{snapshot.isLoading && <div className="dashboard-loading">Loading operational dashboard data...</div>}{snapshot.isError && <div className="auth-message error">Unable to load dashboard data. Please try again.</div>}{snapshot.data && <><DashboardKpiGrid metrics={snapshot.data.metrics} /><Suspense fallback={<div className="dashboard-loading">Loading analytics modules...</div>}><section className="dashboard-charts-section"><div className="dashboard-section-heading"><div><div className="eyebrow">ANALYTICS</div><h3>Operational performance and risk</h3></div></div><DashboardCharts data={snapshot.data} /></section><SafetyMapCard sites={snapshot.data.sites} /></Suspense><DashboardOperationalGrid activities={snapshot.data.activities} recentIncidents={snapshot.data.recentIncidents} hasOperationalData={snapshot.data.hasOperationalData} /><DashboardBottomGrid activities={snapshot.data.activities} canReportIncident={canReportIncident} canCreateInspection={canCreateInspection} canCreateCorrectiveAction={canCreateCorrectiveAction} canStartAudit={canStartAudit} canViewReports={canViewReports} /><AiSafetySummary organizationId={organizationId} role={role} hasAuthorizedQhseData={snapshot.data.hasOperationalData} /></>}</div>
}
