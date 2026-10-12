import type { SupabaseClient } from '@supabase/supabase-js'
import { useState } from 'react'
import type { SafetyScope } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
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
  const [activeTab, setActiveTab] = useState<SafetyTab>(null)
  const [exporting, setExporting] = useState(false)
  const setReportingPeriod = (period: 30 | 90 | 'all') => {
    setTrendPeriod(period)
    setDays(period)
  }
  const filters = { days, ...(trendPeriod !== 'reporting' ? { trendDays: trendPeriod } : {}) }
  const snapshot = useSafetyIntelligence(client, scope, filters, view === 'executive-analytics')
  const data = snapshot.data
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
