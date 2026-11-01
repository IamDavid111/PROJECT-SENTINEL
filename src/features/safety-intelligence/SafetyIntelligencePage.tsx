import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState, type ReactNode } from 'react'
import type { SafetyFilters, SafetyScope } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { buildDepartmentOptions, buildSeverityOptions, buildShiftOptions } from '../../lib/companyFilterOptions'
import { incidentReportTypes, incidentStatuses } from '../incidents/incidentTypes'
import { SafetyIntelligenceError } from './safetyIntelligenceService'
import { useSafetyIntelligence } from './useSafetyIntelligence'
import { SafetyKpiCards } from './SafetyKpiCards'
import { IncidentTrendChart } from './IncidentTrendChart'
import { SafetyLocations } from './SafetyLocations'
import { SafetyPlanningOutlook } from './SafetyPlanningOutlook'
import { SafetyAssistant } from '../ai/SafetyAssistant'
import { ExecutiveAnalyticsExport } from './ExecutiveAnalyticsExport'
import { Alert, Badge, Button, FilterBar, Icon, PageHeader, SegmentedControl, Select, Skeleton } from '../../components/ui'

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-[180px] gap-1 text-[11px] font-medium text-muted">
      {label}
      {children}
    </label>
  )
}

export function SafetyIntelligencePage({ client, scope, canViewKnowledge = false, canExportAnalytics = false, view = 'assistant' }: {
  client: SupabaseClient
  scope: SafetyScope
  canViewKnowledge?: boolean
  canExportAnalytics?: boolean
  view?: 'assistant' | 'executive-analytics'
}) {
  // Changing the window selects a separate authorized snapshot/cache entry, not locally filtered demo values.
  const [days, setDays] = useState<30 | 90 | 'all'>(90)
  const [trendPeriod, setTrendPeriod] = useState<30 | 90 | 'all' | 'reporting'>('reporting')
  const [dateBasis, setDateBasis] = useState<'occurred' | 'reported'>('reported')
  const [department, setDepartment] = useState('all')
  const [shift, setShift] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [reportTypeFilter, setReportTypeFilter] = useState('all')
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([])
  const [shiftOptions, setShiftOptions] = useState<string[]>([])
  const [severityOptions, setSeverityOptions] = useState<string[]>([])
  const [exporting, setExporting] = useState(false)
  const setReportingPeriod = (period: 30 | 90 | 'all') => {
    setTrendPeriod(period)
    setDays(period)
  }
  const resetAnalyticsFilters = () => {
    setDateBasis('reported')
    setDepartment('all')
    setShift('all')
    setStatusFilter('all')
    setSeverityFilter('all')
    setReportTypeFilter('all')
    setDays(90)
    setTrendPeriod('reporting')
  }
  const filters: SafetyFilters = {
    days,
    ...(trendPeriod !== 'reporting' ? { trendDays: trendPeriod } : {}),
    dateBasis,
    ...(department !== 'all' ? { department } : {}),
    ...(shift !== 'all' ? { shift } : {}),
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(severityFilter !== 'all' ? { severity: severityFilter } : {}),
    ...(reportTypeFilter !== 'all' ? { reportType: reportTypeFilter } : {}),
  }
  const snapshot = useSafetyIntelligence(client, scope, filters, view === 'executive-analytics')
  const data = snapshot.data
  const formatOption = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
  // Option lists come from company settings (same source as the Dashboard), not
  // from the analytics snapshot, so they are populated before data loads.
  useEffect(() => {
    let active = true
    const loadSettings = () => {
      void client.from('company_settings')
        .select('departments, severity_levels, working_hours')
        .eq('organization_id', scope.organizationId)
        .maybeSingle()
        .then(({ data: settings }) => {
          if (!active) return
          setDepartmentOptions(buildDepartmentOptions(settings?.departments).filter((value) => value !== 'all'))
          setShiftOptions(buildShiftOptions(settings?.working_hours).filter((value) => value !== 'all'))
          setSeverityOptions(buildSeverityOptions(settings?.severity_levels).filter((value) => value !== 'all'))
        })
    }
    void loadSettings()
    window.addEventListener('company-settings-updated', loadSettings)
    return () => {
      active = false
      window.removeEventListener('company-settings-updated', loadSettings)
    }
  }, [client, scope.organizationId])

  if (view === 'assistant') {
    return <SafetyAssistant key={`${scope.organizationId}:${scope.userId}`} client={client} scope={scope}
      snapshot={!snapshot.isError ? data : undefined} canViewKnowledge={canViewKnowledge} />
  }

  const selectedWindow = trendPeriod === 'reporting' ? String(days) : String(trendPeriod)
  const filtersDisabled = snapshot.isFetching || exporting
  const coverageEntry = data?.coverage.find((source) => source.source === 'incidents')
  const coverageComplete = coverageEntry?.complete === true
  const hasReports = data ? data.metrics.category.denominator > 0 : false
  const snapshotTone = !coverageComplete ? 'warning' : !hasReports ? 'info' : 'success'
  const snapshotMessage = !coverageComplete
    ? 'Authorized incident retrieval is incomplete. Complete intelligence results are unavailable.'
    : !hasReports
      ? 'No authorized reported events in this window. There is not enough data to show intelligence results.'
      : 'Authorized operational data is connected.'

  return <div className="grid gap-5">
    <PageHeader
      eyebrow="Operational intelligence"
      title="Executive Analytics"
      description="Understand reported patterns and prioritize preventive action. Indicators use deterministic calculations."
      actions={
        <>
          <SegmentedControl
            label="Reporting window"
            value={selectedWindow}
            onChange={(value) => setReportingPeriod(value === 'all' ? 'all' : Number(value) as 30 | 90)}
            options={[
              { value: '30', label: '30 days', disabled: filtersDisabled },
              { value: '90', label: '90 days', disabled: filtersDisabled },
              { value: 'all', label: 'All time', disabled: filtersDisabled },
            ]}
          />
          <Button variant="outline" size="sm" onClick={() => void snapshot.refetch()} loading={snapshot.isFetching}>
            <Icon name="refresh" size={15} />
            Refresh
          </Button>
          {canExportAnalytics && <ExecutiveAnalyticsExport client={client} scope={scope} filters={filters}
            disabled={snapshot.isPending || snapshot.isError || snapshot.isFetching || !data} onBusy={setExporting}
            refresh={async () => {
              const result = await snapshot.refetch({ throwOnError: true })
              if (!result.data) throw new Error('No authorized analytics snapshot is available for export.')
              return result.data
            }} />}
        </>
      }
    />

    <FilterBar
      actions={<Button variant="ghost" size="sm" onClick={resetAnalyticsFilters} disabled={filtersDisabled}>Clear filters</Button>}
    >
      <FilterField label="Window by">
        <SegmentedControl
          label="Window date basis"
          value={dateBasis}
          onChange={(value) => setDateBasis(value as 'occurred' | 'reported')}
          options={[
            { value: 'reported', label: 'Reported', disabled: filtersDisabled },
            { value: 'occurred', label: 'Occurred', disabled: filtersDisabled },
          ]}
        />
      </FilterField>
      <FilterField label="Department">
        <Select value={department} disabled={filtersDisabled} onChange={(event) => setDepartment(event.target.value)}>
          <option value="all">All departments</option>
          {departmentOptions.map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      </FilterField>
      <FilterField label="Shift">
        <Select value={shift} disabled={filtersDisabled} onChange={(event) => setShift(event.target.value)}>
          <option value="all">All shifts</option>
          {shiftOptions.map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      </FilterField>
      <FilterField label="Status">
        <Select value={statusFilter} disabled={filtersDisabled} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All status</option>
          <option value="open">Open</option>
          {incidentStatuses.map((status) => <option key={status} value={status}>{formatOption(status)}</option>)}
        </Select>
      </FilterField>
      <FilterField label="Severity">
        <Select value={severityFilter} disabled={filtersDisabled} onChange={(event) => setSeverityFilter(event.target.value)}>
          <option value="all">All severity</option>
          {severityOptions.map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      </FilterField>
      <FilterField label="Report type">
        <Select value={reportTypeFilter} disabled={filtersDisabled} onChange={(event) => setReportTypeFilter(event.target.value)}>
          <option value="all">All types</option>
          {incidentReportTypes.map((type) => <option key={type} value={type}>{formatOption(type)}</option>)}
        </Select>
      </FilterField>
    </FilterBar>

    {snapshot.isPending ? (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
        <span className="sr-only" role="status">Loading authorized operational data...</span>
        {Array.from({ length: 10 }).map((_, index) => <Skeleton key={index} className="h-28 w-full" />)}
      </div>
    ) : snapshot.isError ? (
      <Alert tone="danger" title="Analytics unavailable">
        <p>{snapshot.error.message}</p>
        {snapshot.error instanceof SafetyIntelligenceError && <p className="text-xs">Request reference: {snapshot.error.requestId}</p>}
        <p className="mt-1">No intelligence results are displayed. Use Refresh to retry.</p>
      </Alert>
    ) : data && <>
      <section className="border-y border-line py-4" aria-label="Snapshot coverage">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={data.scope.visibility === 'organization' ? 'success' : 'info'}>
            {data.scope.visibility === 'organization' ? 'Organization coverage' : 'My reports'}
          </Badge>
          <span className="text-sm text-muted">
            {data.filters.days === 'all' ? 'All Time' : `${data.filters.days}-day reporting window`} · Snapshot: {data.asOf} (UTC)
          </span>
        </div>
        <Alert tone={snapshotTone} className="mt-3">{snapshotMessage}</Alert>
        <details className="mt-3 rounded-xl border border-line bg-surface-soft/40 px-4 py-3 text-sm text-muted">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-foreground [&::-webkit-details-marker]:hidden">
            <Icon name="info" size={15} className="text-brand" />
            Snapshot coverage and reporting methodology
          </summary>
          <div className="mt-2 grid gap-1.5">
            <p>Reporting: {data.windows.reporting.start} to {data.windows.reporting.end} (end excluded). Resolution uses closure dates; near misses use comparable month-to-date periods.</p>
            <p>Read-only and advisory. AI does not change official safety records.</p>
          </div>
        </details>
      </section>

      {/* Cards are rendered only from a validated successful server snapshot, never a fallback dataset. */}
      <SafetyKpiCards snapshot={data} />
      <IncidentTrendChart snapshot={data} />
      <SafetyLocations snapshot={data} />
      <SafetyPlanningOutlook snapshot={data} />
    </>}
  </div>
}
