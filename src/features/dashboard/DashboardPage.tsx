import { lazy, Suspense, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ArrowRight } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

import { defaultDashboardFilters, type DashboardFilters, type DashboardMetric, type DashboardPageProps } from './dashboardTypes'
import { buildDepartmentOptions, buildSeverityOptions, buildShiftOptions, buildShiftSettings, type CompanyShift } from '../../lib/companyFilterOptions'
import { invalidateDashboardData, useDashboardData } from './useDashboardData'
import { AiSafetySummary } from './AiSafetySummary'
const DashboardCharts = lazy(() => import('./DashboardCharts'))
const SafetyMapCard = lazy(() => import('./SafetyMapCard').then((module) => ({ default: module.SafetyMapCard })))

const fallbackFilterOptions = {
  site: ['all'],
  department: ['all'],
  severity: ['all'],
  incidentType: ['all'],
  shift: ['all'],
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
    { key: 'dateBasis', label: 'Window by', options: ['occurred', 'reported'] },
    { key: 'severity', label: 'Severity', options: options.severity },
    { key: 'incidentType', label: 'Incident category', options: options.incidentType },
    { key: 'shift', label: 'Shift', options: options.shift },
  ]
  return <div className="dashboard-filters"><div className="dashboard-filters-heading"><div><strong>Dashboard filters</strong><span>Filters are applied to available organization data.</span></div><button type="button" onClick={onReset}>Clear filters</button></div><div className="dashboard-filter-grid">{fields.map((field) => <label key={field.key}>{field.label}<select value={filters[field.key]} onChange={(event) => onChange(field.key, event.target.value)}>{field.options.map((option) => <option key={option} value={option}>{field.key === 'dateRange' ? formatFilterLabel(option.replace('d', ' days')) : formatFilterLabel(option)}</option>)}</select></label>)}</div></div>
}

function KpiCard({ metric }: { metric: DashboardMetric }) {
  return <article className={`dashboard-kpi tone-${metric.tone}`}><span className="dashboard-kpi-icon" aria-hidden="true"><metric.icon size={16} /></span><span>{metric.label}</span><strong>{metric.value}</strong><a href={metric.href}>View details <ArrowRight size={12} /></a></article>
}

function DashboardKpiGrid({ metrics, title = 'Safety at a glance', eyebrow = 'CRITICAL ISSUES' }: { metrics: DashboardMetric[]; title?: string; eyebrow?: string }) {
  return <section><div className="dashboard-section-heading"><div><div className="eyebrow">{eyebrow}</div><h3>{title}</h3></div></div><div className="dashboard-kpi-grid">{metrics.map((metric) => <KpiCard key={metric.key} metric={metric} />)}</div></section>
}

// This page combines the filtered metrics with filter choices from organization settings.
export function DashboardPage({ organizationId, currentUserId, organizationName, userName, role, canCreateCorrectiveAction, supabase }: DashboardPageProps & { supabase: SupabaseClient }) {

  const [filters, setFilters] = useState(defaultDashboardFilters)
  const [filterOptions, setFilterOptions] = useState(fallbackFilterOptions)
  const [shiftSettings, setShiftSettings] = useState<CompanyShift[]>([])
  const [shiftStart, setShiftStart] = useState('07:00')
  const [shiftEnd, setShiftEnd] = useState('19:00')
  const [settingsError, setSettingsError] = useState('')
  const queryClient = useQueryClient()
  const snapshot = useDashboardData(supabase, organizationId, filters, currentUserId)

  useEffect(() => {
    if (!organizationId) return

    let active = true
    const loadSettings = async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('working_hours, departments, operational_sites, emergency_contacts, severity_levels, incident_categories')
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (!active) return
      if (error) {
        setSettingsError('Unable to load company configuration for dashboard filters.')
        setShiftSettings([])
        setFilterOptions(fallbackFilterOptions)
        return
      }
      setSettingsError('')
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
    // Company Settings dispatches this event after a save, so refresh filter choices and dashboard data without reloading the page.
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
  const visibleMetrics = snapshot.data?.metrics.map((metric) => !canCreateCorrectiveAction && ['open-actions', 'overdue-actions'].includes(metric.key)
    ? { ...metric, href: '#assigned-actions' }
    : metric)
  return <div className="dashboard-page"><DashboardHeader userName={userName} organizationName={organizationName} role={role} />{settingsError && <div className="auth-message error" role="alert">{settingsError}</div>}<DashboardFilters filters={filters} options={filterOptions} onChange={updateFilter} onReset={resetFilters} />{filters.shift !== 'all' && <div className="dashboard-shift-times"><strong>{filters.shift} shift timing</strong><label>Start time<input type="time" value={shiftStart} onChange={(event) => setShiftStart(event.target.value)} /></label><label>End time<input type="time" value={shiftEnd} onChange={(event) => setShiftEnd(event.target.value)} /></label></div>}{snapshot.isLoading && <div className="dashboard-loading">Loading operational dashboard data...</div>}{snapshot.isError && <div className="auth-message error">Unable to load dashboard data. Please try again.</div>}{snapshot.data && visibleMetrics && <><DashboardKpiGrid metrics={visibleMetrics} /><DashboardKpiGrid metrics={snapshot.data.actionMetrics} title="Actions" eyebrow="ACTION REGISTER" /><Suspense fallback={<div className="dashboard-loading">Loading analytics modules...</div>}><section className="dashboard-charts-section"><div className="dashboard-section-heading"><div><div className="eyebrow">ANALYTICS</div><h3>Operational performance and risk</h3></div></div><DashboardCharts data={snapshot.data} /><SafetyMapCard sites={snapshot.data.sites} /></section></Suspense><AiSafetySummary organizationId={organizationId} role={role} hasAuthorizedQhseData={snapshot.data.hasOperationalData} /></>}</div>
}
