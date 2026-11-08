import { lazy, Suspense, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'

import { Alert } from '../../components/ui/alert'
import { Skeleton } from '../../components/ui/skeleton'
import { cn } from '../../lib/utils'
import { buildDepartmentOptions, buildSeverityOptions, buildShiftOptions, buildShiftSettings, type CompanyShift } from '../../lib/companyFilterOptions'
import { normalizeIncidentCategoryName } from '../../lib/incidentCategory'
import { companySettingsEventMatchesOrganization, companySettingsUpdatedEvent } from '../../lib/companySettingsSync'
import { AiSafetySummary } from './AiSafetySummary'
import { DashboardCommandStrip, type DashboardStripStat } from './DashboardCommandStrip'
import { DashboardFilterBar } from './DashboardFilterBar'
import { ActionRegister, IncidentRegister } from './DashboardRegisters'
import { RecentIncidentsCard } from './RecentIncidentsCard'
import { invalidateDashboardData, useDashboardData } from './useDashboardData'
import { defaultDashboardFilters, type DashboardFilterOptions, type DashboardFilters, type DashboardPageProps } from './types'

const IncidentTrendChart = lazy(() => import('./DashboardCharts').then((module) => ({ default: module.IncidentTrendChart })))
const IncidentSeverityChart = lazy(() => import('./DashboardCharts').then((module) => ({ default: module.IncidentSeverityChart })))
const IncidentTypeChart = lazy(() => import('./DashboardCharts').then((module) => ({ default: module.IncidentTypeChart })))
const DashboardComparisons = lazy(() => import('./DashboardCharts').then((module) => ({ default: module.DashboardComparisons })))
const SafetyMapCard = lazy(() => import('./SafetyMapCard').then((module) => ({ default: module.SafetyMapCard })))

const fallbackFilterOptions: DashboardFilterOptions = {
  site: ['all'],
  department: ['all'],
  severity: ['all'],
  incidentType: ['all'],
  shift: ['all'],
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

function ChartSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('rounded-card', className)} />
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <ChartSkeleton className="h-[360px] xl:col-span-7" />
      <ChartSkeleton className="h-[360px] xl:col-span-5" />
      <ChartSkeleton className="h-[520px] xl:col-span-7" />
      <ChartSkeleton className="h-[520px] xl:col-span-5" />
      <ChartSkeleton className="h-[300px] xl:col-span-4" />
      <ChartSkeleton className="h-[300px] xl:col-span-4" />
      <ChartSkeleton className="h-[300px] xl:col-span-4" />
    </div>
  )
}

// This page combines the filtered metrics with filter choices from organization settings.
export function DashboardPage({ organizationId, currentUserId, organizationName, userName, role, canCreateCorrectiveAction, supabase }: DashboardPageProps & { supabase: SupabaseClient }) {
  const [filters, setFilters] = useState<DashboardFilters>(defaultDashboardFilters)
  const [filterOptions, setFilterOptions] = useState<DashboardFilterOptions>(fallbackFilterOptions)
  const [filtersOpen, setFiltersOpen] = useState(false)
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
    const handleSettingsUpdated = (event: Event) => {
      if (!companySettingsEventMatchesOrganization(event, organizationId)) return
      void loadSettings()
      void invalidateDashboardData(queryClient, organizationId)
    }
    void loadSettings()
    window.addEventListener(companySettingsUpdatedEvent, handleSettingsUpdated)

    return () => {
      active = false
      window.removeEventListener(companySettingsUpdatedEvent, handleSettingsUpdated)
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

  const metrics = snapshot.data?.metrics ?? []
  const actionMetrics = snapshot.data?.actionMetrics ?? []
  const metricByKey = new Map(metrics.map((metric) => [metric.key, metric]))
  const actionByKey = new Map(actionMetrics.map((metric) => [metric.key, metric]))
  const openActions = ['open-corrective-actions', 'open-preventive-actions', 'open-investigations']
    .reduce((total, key) => total + Number(actionByKey.get(key)?.value ?? 0), 0)
  const actionHref = canCreateCorrectiveAction ? '#corrective-actions' : '#assigned-actions'
  const windowLabel = filters.dateRange === 'all' ? 'All time' : `${filters.dateRange.replace('d', '')} days`
  const statValue = (key: string) => metricByKey.get(key)?.value ?? '—'

  const stats: DashboardStripStat[] = [
    { key: 'open-incidents', label: 'Open incidents', value: statValue('open-incidents'), hint: 'Submitted, not yet closed', href: '#incidents' },
    { key: 'open-high-risk', label: 'High-risk open', value: statValue('open-high-risk-incidents'), hint: 'High or critical severity', href: '#incidents', tone: 'danger' },
    { key: 'near-misses', label: 'Near misses', value: statValue('near-misses'), hint: 'Reported in this window', href: '#incidents?reportType=near_miss' },
    { key: 'open-actions', label: 'Open actions', value: actionMetrics.length ? String(openActions) : '—', hint: 'Corrective, preventive, investigation', href: actionHref },
  ]

  return (
    <div className="grid -mt-6 gap-5">
      <section className="border-y border-line">
        <DashboardCommandStrip
          userName={userName}
          organizationName={organizationName}
          role={role}
          stats={stats}
        />
        <DashboardFilterBar
          filters={filters}
          options={filterOptions}
          open={filtersOpen}
          onChange={updateFilter}
          onReset={resetFilters}
          onToggle={() => setFiltersOpen((current) => !current)}
          shiftStart={shiftStart}
          shiftEnd={shiftEnd}
          onShiftStart={setShiftStart}
          onShiftEnd={setShiftEnd}
        />
      </section>

      {settingsError && <Alert tone="danger">{settingsError}</Alert>}
      {snapshot.isLoading && <DashboardSkeleton />}
      {snapshot.isError && <Alert tone="danger">Unable to load dashboard data. Please try again.</Alert>}

      {snapshot.data && (
        <>
          <div className="grid gap-5 xl:grid-cols-12">
            <div className="min-w-0 xl:col-span-7">
              <Suspense fallback={<ChartSkeleton className="h-[360px]" />}>
                <IncidentTrendChart data={snapshot.data.incidentTrend} />
              </Suspense>
            </div>
            <div className="min-w-0 xl:col-span-5">
              <RecentIncidentsCard incidents={snapshot.data.recentIncidents} />
            </div>

            <div className="min-w-0 xl:col-span-7">
              <Suspense fallback={<ChartSkeleton className="h-[620px]" />}>
                <SafetyMapCard sites={snapshot.data.sites} />
              </Suspense>
            </div>
            <div className="grid min-w-0 gap-5 xl:col-span-5">
              <Suspense fallback={<ChartSkeleton className="h-[280px]" />}>
                <IncidentSeverityChart data={snapshot.data.incidentSeverity} />
              </Suspense>
              <Suspense fallback={<ChartSkeleton className="h-[300px]" />}>
                <IncidentTypeChart data={snapshot.data.incidentTypes} configuredTypes={snapshot.data.configuredIncidentTypes} />
              </Suspense>
            </div>

            <div className="min-w-0 xl:col-span-4">
              <IncidentRegister metrics={metrics} windowLabel={windowLabel} />
            </div>
            <div className="min-w-0 xl:col-span-4">
              <ActionRegister metrics={actionMetrics} actionHref={actionHref} windowLabel={windowLabel} />
            </div>
            <div className="min-w-0 xl:col-span-4">
              <Suspense fallback={<ChartSkeleton className="h-[300px]" />}>
                <DashboardComparisons
                  department={snapshot.data.departmentComparison}
                  site={snapshot.data.siteComparison}
                  configuredDepartments={snapshot.data.configuredDepartments}
                  configuredSites={snapshot.data.configuredSites}
                />
              </Suspense>
            </div>
          </div>

          <AiSafetySummary organizationId={organizationId} role={role} hasAuthorizedQhseData={snapshot.data.hasOperationalData} />
        </>
      )}
    </div>
  )
}
