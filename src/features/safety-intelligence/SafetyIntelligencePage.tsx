import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
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
import { BookOpen, RefreshCw, ShieldCheck, MessageSquare } from 'lucide-react'
import { KnowledgePage } from '../knowledge/KnowledgePage'
import { ExecutiveAnalyticsExport } from './ExecutiveAnalyticsExport'

type SafetyTab = 'assistant' | 'knowledge' | null

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
  const [activeTab, setActiveTab] = useState<SafetyTab>(null)
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
  // Never display cached successful data after a failed permission/retrieval refresh.
  return <div className="safety-intelligence-page">
    {view === 'assistant' && <nav className="safety-section-links" aria-label="AI Safety Assistant sections">
      <button type="button" aria-pressed={activeTab === 'assistant'} onClick={() => setActiveTab('assistant')}>
        <MessageSquare size={16} aria-hidden="true" />AI Safety Assistant
      </button>
      {canViewKnowledge && <button type="button" aria-pressed={activeTab === 'knowledge'} onClick={() => setActiveTab('knowledge')}>
        <BookOpen size={16} aria-hidden="true" />QHSE Knowledge
      </button>}
    </nav>}
    {view === 'executive-analytics' && <section className="safety-intelligence-section" id="executive-analytics-content" aria-labelledby="safety-intelligence-title">
      <div className="safety-section-heading">
        <div><div className="eyebrow">OPERATIONAL INTELLIGENCE</div>
          <h2 id="safety-intelligence-title">Executive Analytics</h2>
          <p>Understand reported patterns and prioritize preventive action. Indicators use deterministic calculations.</p>
        </div>
        <div className="safety-window-toggle" role="group" aria-label="Reporting window">
          {([30, 90, 'all'] as const).map((window) => <button type="button" key={window}
            className="button button-outline button-small" aria-pressed={(trendPeriod === 'reporting' ? days : trendPeriod) === window}
            disabled={snapshot.isFetching || exporting}
            onClick={() => setReportingPeriod(window)}>{window === 'all' ? 'All Time' : `${window} days`}</button>)}
        </div>
        <button type="button" className="button button-outline button-small" disabled={snapshot.isFetching || exporting} onClick={() => void snapshot.refetch()}>
          <RefreshCw size={15} aria-hidden="true" />
          {snapshot.isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
        {canExportAnalytics && <ExecutiveAnalyticsExport client={client} scope={scope} filters={filters}
          disabled={snapshot.isPending || snapshot.isError || snapshot.isFetching || !data} onBusy={setExporting}
          refresh={async () => {
            const result = await snapshot.refetch({ throwOnError: true })
            if (!result.data) throw new Error('No authorized analytics snapshot is available for export.')
            return result.data
          }} />}
      </div>
      <div className="safety-filter-card">
        <div className="safety-filter-card-heading">
          <div><strong>Analytics filters</strong><span>Applies to the KPIs, trend and export.</span></div>
          <button type="button" onClick={resetAnalyticsFilters} disabled={snapshot.isFetching || exporting}>Clear filters</button>
        </div>
        <div className="safety-filter-inline">
          <span>Window by</span>
          <div className="safety-window-toggle" role="group" aria-label="Window date basis">
            {(['reported', 'occurred'] as const).map((basis) => <button type="button" key={basis}
              className="button button-outline button-small" aria-pressed={dateBasis === basis}
              disabled={snapshot.isFetching || exporting}
              onClick={() => setDateBasis(basis)}>{basis === 'reported' ? 'Reported date' : 'Occurred date'}</button>)}
          </div>
        </div>
        <div className="safety-filter-grid">
          <label>Department<select value={department} disabled={snapshot.isFetching || exporting} onChange={(event) => setDepartment(event.target.value)}><option value="all">All departments</option>{departmentOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label>Shift<select value={shift} disabled={snapshot.isFetching || exporting} onChange={(event) => setShift(event.target.value)}><option value="all">All shifts</option>{shiftOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label>Status<select value={statusFilter} disabled={snapshot.isFetching || exporting} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All status</option><option value="open">Open</option>{incidentStatuses.map((status) => <option key={status} value={status}>{formatOption(status)}</option>)}</select></label>
          <label>Severity<select value={severityFilter} disabled={snapshot.isFetching || exporting} onChange={(event) => setSeverityFilter(event.target.value)}><option value="all">All severity</option>{severityOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label>Report type<select value={reportTypeFilter} disabled={snapshot.isFetching || exporting} onChange={(event) => setReportTypeFilter(event.target.value)}><option value="all">All types</option>{incidentReportTypes.map((type) => <option key={type} value={type}>{formatOption(type)}</option>)}</select></label>
        </div>
      </div>
      {snapshot.isPending ? <p role="status" aria-live="polite">Loading authorized operational data...</p>
        : snapshot.isError ? <div className="auth-message error" role="alert">
          <p>{snapshot.error.message}</p>
          {snapshot.error instanceof SafetyIntelligenceError && <small>Request reference: {snapshot.error.requestId}</small>}
          <p>No intelligence results are displayed. Use Refresh to retry.</p>
        </div>
        : data && <>
        <div className="safety-snapshot-status" role="status">
          <p className="safety-coverage-line"><ShieldCheck size={14} aria-hidden="true" /><strong>{data.scope.visibility === 'organization' ? 'Organization coverage' : 'My reports'}</strong>
            {' · '}{data.filters.days === 'all' ? 'All Time' : `${data.filters.days}-day reporting window`}{' · '}Snapshot: {data.asOf} (UTC)</p>
          {!data.coverage.find((source) => source.source === 'incidents')?.complete
            ? <p>Authorized incident retrieval is incomplete. Complete intelligence results are unavailable.</p>
            : data.metrics.category.denominator === 0
              ? <p>No authorized reported events in this window. There is not enough data to show intelligence results.</p>
              : <p>Authorized operational data is connected.</p>}
          <details className="safety-methodology"><summary>Snapshot coverage and reporting methodology</summary>
            <p>Reporting: {data.windows.reporting.start} to {data.windows.reporting.end} (end excluded). Resolution uses closure dates; near misses use comparable month-to-date periods.</p>
            <p>Read-only and advisory. AI does not change official safety records.</p>
          </details>
        </div>
        {/* Cards are rendered only from a validated successful server snapshot, never a fallback dataset. */}
        <SafetyKpiCards snapshot={data} />
        <IncidentTrendChart snapshot={data} onPeriodChange={setReportingPeriod} disabled={snapshot.isFetching || exporting} />
        <SafetyLocations snapshot={data} />
        <SafetyPlanningOutlook snapshot={data} />
        </>}
    </section>}
    {activeTab === 'assistant' && <SafetyAssistant key={`${scope.organizationId}:${scope.userId}`} client={client} scope={scope}
      snapshot={!snapshot.isError ? data : undefined} />}
    {activeTab === 'knowledge' && canViewKnowledge && <KnowledgePage key={`${scope.organizationId}:${scope.userId}`} client={client} scope={{
      organizationId: scope.organizationId, userId: scope.userId,
    }} />}
  </div>
}
