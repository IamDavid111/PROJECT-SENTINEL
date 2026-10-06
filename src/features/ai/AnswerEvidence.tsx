import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SafetyScope } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { safetySnapshotSchema } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import type { MessageEvidence } from '../../../supabase/functions/_shared/aiEvidence'
import { resolveAccessibleSources } from './aiEvidenceService'

export function AnswerEvidence({ client, scope, evidence }: {
  client: SupabaseClient; scope: SafetyScope; evidence: MessageEvidence
}) {
  const sources = useQuery({
    queryKey: ['ai-evidence', scope.userId, scope.organizationId, evidence.request_id, evidence.sourceIds],
    queryFn: () => resolveAccessibleSources(client, scope.organizationId, evidence.sourceIds),
    staleTime: 0, gcTime: 0, retry: false, refetchOnMount: 'always', refetchOnWindowFocus: 'always',
  })
  const { refetch } = sources
  useEffect(() => {
    const refresh = () => { void refetch() }
    window.addEventListener('incident-records-updated', refresh)
    return () => window.removeEventListener('incident-records-updated', refresh)
  }, [refetch])
  const checked = !sources.isFetching && !sources.isError ? sources.data : undefined
  return <section className="assistant-evidence" aria-label="Validated supporting records">
    <h5>Validated supporting records</h5>
    <p>Answer snapshot: {evidence.asOf ?? 'Not recorded'} (UTC). Scope: {evidence.visibility ?? 'Not recorded'}.
      {' '}Methodology: {evidence.methodology ?? 'Not recorded'}.</p>
    <p>Historical answer, not a current record. Details below are rechecked against your current access.
      Links open the supporting incident; child record access is checked separately.</p>
    {sources.isFetching ? <p role="status">Rechecking current source permissions...</p>
      : sources.isError ? <p role="alert">{sources.error.message}</p>
        : checked?.length ? <ul>{checked.map((source) => <li key={source.key}>
          <a href={`#incident-detail?id=${encodeURIComponent(source.incidentId)}`}>{source.label}</a>
          <small> · {source.recordType} · Incident reported: {source.date ?? 'Date unavailable'}</small>
        </li>)}</ul> : <p>No currently accessible supporting records to display.</p>}
    {checked && checked.length < evidence.sourceIds.length && <p>Some sources are unavailable or no longer accessible. Their titles and metadata are hidden.</p>}
    {!evidence.sourceIds.length && <p>No record citation was supplied. Aggregate observations are separate from record examples.</p>}
  </section>
}

export function AnswerSections({ evidence }: { evidence: MessageEvidence }) {
  const sections = evidence.presentation
  if (!sections) return <p>Structured sections were not saved for this older answer. Original text is shown above; no evidence metadata is inferred from it.</p>
  return <div className="assistant-answer-sections">
    <section><h5>Observed facts at answer time</h5>
      {sections.observations.length ? sections.observations.map((item) => <div key={item.key}>
        <strong>{metricLabels[item.key]}</strong>
        <p>{describeObservation(item.key, item.value)}</p></div>) : <p>No canonical metric selected for this answer.</p>}</section>
    <section><h5>AI interpretation — advisory</h5><p>{sections.interpretation}</p></section>
    {sections.advice && <section><h5>Advisory recommendations</h5><p>{sections.advice}</p></section>}
    <section><h5>Coverage and limitations</h5><p>{sections.limitations}</p>
      <ul>{sections.serverLimitations.map((text, index) => <li key={index}>{text}</li>)}</ul></section>
  </div>
}

const metricLabels = {
  risk: 'Deterministic risk indicator (not ML)', highRisk: 'High-risk incidents',
  nearMiss: 'Near-miss reporting', category: 'Most common reported category', resolution: 'Reliable resolution time',
}
function describeObservation(key: keyof typeof metricLabels, serialized: string) {
  const metric = safetySnapshotSchema.shape.metrics.shape[key].parse(JSON.parse(serialized))
  const reasons = metric.reasons.join(' ')
  if (metric.state !== 'available') return `${metric.state}: ${reasons || 'Insufficient authorized evidence.'}`
  if ('score' in metric) return `${metric.band}: ${metric.score?.toFixed(2)} / 100. Sample: ${metric.sampleSize}. ${reasons}`
  if ('openCount' in metric) return `${metric.count} high-risk; ${metric.openCount} still open. ${reasons}`
  if ('denominator' in metric) return `${metric.label ?? 'Uncategorized'}: ${metric.count} of ${metric.denominator} reports (${metric.share?.toFixed(1) ?? 'unavailable'}% share). ${reasons}`
  // Remaining supported metrics retain their exact validated fields rather than inventing units or comparison values.
  return Object.entries(metric).filter(([field]) => field !== 'state' && field !== 'reasons')
    .map(([field, value]) => `${field}: ${value === null ? 'unavailable' : JSON.stringify(value)}`).join(' · ')
}
