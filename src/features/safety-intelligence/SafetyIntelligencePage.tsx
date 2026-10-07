import type { SupabaseClient } from '@supabase/supabase-js'
import { useState } from 'react'
import type { SafetyScope } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { SafetyIntelligenceError } from './safetyIntelligenceService'
import { useSafetyIntelligence } from './useSafetyIntelligence'
import { SafetyKpiCards } from './SafetyKpiCards'
import { SafetyLocations } from './SafetyLocations'
import { SafetyPlanningOutlook } from './SafetyPlanningOutlook'
import { SafetyAssistant } from '../ai/SafetyAssistant'
import { BookOpen, RefreshCw, ShieldCheck, BarChart3, MessageSquare } from 'lucide-react'
import { KnowledgePage } from '../knowledge/KnowledgePage'

type SafetyTab = 'intelligence' | 'assistant' | 'knowledge' | null

export function SafetyIntelligencePage({ client, scope, canViewKnowledge = false }: {
  client: SupabaseClient
  scope: SafetyScope
  canViewKnowledge?: boolean
}) {
  // Changing the window selects a separate authorized snapshot/cache entry, not locally filtered demo values.
  const [days, setDays] = useState<30 | 90>(90)
  const [activeTab, setActiveTab] = useState<SafetyTab>(null)
  const snapshot = useSafetyIntelligence(client, scope, { days })
  const data = snapshot.data
  // Never display cached successful data after a failed permission/retrieval refresh.
  return <div className="safety-intelligence-page">
    <nav className="safety-section-links" aria-label="Safety Intelligence sections">
      <button type="button" aria-pressed={activeTab === 'intelligence'} onClick={() => setActiveTab('intelligence')}>
        <BarChart3 size={16} aria-hidden="true" />AI Safety Intelligence
      </button>
      <button type="button" aria-pressed={activeTab === 'assistant'} onClick={() => setActiveTab('assistant')}>
        <MessageSquare size={16} aria-hidden="true" />AI Safety Assistant
      </button>
      {canViewKnowledge && <button type="button" aria-pressed={activeTab === 'knowledge'} onClick={() => setActiveTab('knowledge')}>
        <BookOpen size={16} aria-hidden="true" />QHSE Knowledge
      </button>}
    </nav>
    {activeTab === 'intelligence' && <section className="safety-intelligence-section" id="safety-intelligence-overview" aria-labelledby="safety-intelligence-title">
      <div className="safety-section-heading">
        <div><div className="eyebrow">OPERATIONAL INTELLIGENCE</div>
          <h2 id="safety-intelligence-title">AI Safety Intelligence</h2>
          <p>Understand reported patterns and prioritize preventive action. Indicators use deterministic calculations.</p>
        </div>
        <div className="safety-window-toggle" role="group" aria-label="Reporting window">
          {([30, 90] as const).map((window) => <button type="button" key={window}
            className="button button-outline button-small" aria-pressed={days === window}
            onClick={() => setDays(window)}>{window} days</button>)}
        </div>
        <button type="button" className="button button-outline button-small" disabled={snapshot.isFetching} onClick={() => void snapshot.refetch()}>
          <RefreshCw size={15} aria-hidden="true" />
          {snapshot.isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
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
            {' · '}{data.filters.days}-day reporting window{' · '}Snapshot: {data.asOf} (UTC)</p>
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
