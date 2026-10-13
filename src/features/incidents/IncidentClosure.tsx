import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  closeIncident, getIncidentClosureCandidates,
  incidentClosureInputSchema, searchIncidentClosureCandidates, setIncidentClosureDelegate,
} from './incidentClosureService'
import type { IncidentSummary } from './incidentTypes'
import { invalidateSafetyIntelligence } from '../safety-intelligence/safetyIntelligenceQueryKeys'

export function IncidentClosureSettings({ client, organizationId, userId }: {
  client: SupabaseClient; organizationId: string; userId: string;
}) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const candidates = useQuery({
    queryKey: ['incident-closure-candidates', organizationId, userId],
    queryFn: () => getIncidentClosureCandidates(client),
  })
  const update = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => setIncidentClosureDelegate(client, id, enabled),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['incident-closure-candidates'] }),
        queryClient.invalidateQueries({ queryKey: ['incident-closure-access'] }),
        invalidateSafetyIntelligence(queryClient, organizationId),
      ])
    },
  })
  const matches = searchIncidentClosureCandidates(candidates.data || [], search)
  return <section className="workspace-panel">
    <div className="eyebrow">INCIDENT AUTHORIZATION</div>
    <h3>Who can close incidents?</h3>
    <p>Super Administrators always have access. Search for an existing user in your organization by name to grant or revoke closure access. Delegates can view all organization incidents. Changing their role requires delegation again.</p>
    <label>Search organization users<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type a user's name..." autoComplete="off" /></label>
    {candidates.isPending ? <p>Loading users...</p> : candidates.isError ? <div className="auth-message error" role="alert">{candidates.error.message}<button type="button" className="button button-outline button-small" onClick={() => void candidates.refetch()}>Retry</button></div> :
      !search.trim() ? <p role="status">Type a name to find users in your organization.</p> :
      !matches.length ? <p role="status">No matching users found in your organization.</p> :
      <div className="shift-config-list">{matches.map((candidate) => <label className="preference-row" key={candidate.user_id}>
        <span><strong>{candidate.full_name}</strong><small>{candidate.role} · {candidate.account_status}</small></span>
        <input type="checkbox" aria-label={`Allow ${candidate.full_name} to close incidents`}
          checked={candidate.role === 'Super Administrator' || candidate.delegated}
          disabled={update.isPending || candidate.role === 'Super Administrator' || (candidate.account_status !== 'active' && !candidate.delegated)}
          onChange={(event) => update.mutate({ id: candidate.user_id, enabled: event.target.checked })} />
      </label>)}</div>}
    {update.isError && <div className="auth-message error" role="alert">{update.error.message}</div>}
    {update.isSuccess && <div className="auth-message success" role="status">Closure delegation saved.</div>}
  </section>
}

export function IncidentClosureForm({ client, incident, onDismiss }: {
  client: SupabaseClient; incident: IncidentSummary; onDismiss: () => void;
}) {
  const formRef = useRef<HTMLElement>(null)
  useEffect(() => { formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }, [])
  const [rootCause, setRootCause] = useState('')
  const [correctiveAction, setCorrectiveAction] = useState('')
  const [actionCompleted, setActionCompleted] = useState(false)
  const [validationError, setValidationError] = useState('')
  const queryClient = useQueryClient()
  const closure = useMutation({
    mutationFn: async () => {
      const parsed = incidentClosureInputSchema.safeParse({ rootCause, correctiveAction, actionCompleted })
      if (!parsed.success) throw new Error(parsed.error.issues[0].message)
      await closeIncident(client, incident.id, parsed.data)
    },
    onSuccess: async () => {
      // Status, closure evidence, activity history and dashboard counts change in one transaction.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['incidents'] }),
        queryClient.invalidateQueries({ queryKey: ['incident-closure', incident.organizationId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', incident.organizationId] }),
        invalidateSafetyIntelligence(queryClient, incident.organizationId),
      ])
      onDismiss()
    },
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setValidationError('')
    const parsed = incidentClosureInputSchema.safeParse({ rootCause, correctiveAction, actionCompleted })
    if (!parsed.success) { setValidationError(parsed.error.issues[0].message); return }
    closure.mutate()
  }
  return <section ref={formRef} className="workspace-panel" aria-label={`Close incident ${incident.referenceNumber}`}>
    <h3>Close incident {incident.referenceNumber}</h3>
    <p>{incident.title}</p>
    <p>A root cause and completed corrective action are required. Linked corrective actions must already be verified or closed. An investigation is not required.</p>
    <form className="settings-form" onSubmit={submit}>
      <label>Root cause<textarea value={rootCause} onChange={(event) => setRootCause(event.target.value)} required minLength={3} maxLength={5000} rows={3} disabled={closure.isPending} /></label>
      <label>Completed corrective action<textarea value={correctiveAction} onChange={(event) => setCorrectiveAction(event.target.value)} required minLength={3} maxLength={5000} rows={3} disabled={closure.isPending} /></label>
      <label className="preference-row"><span>I confirm this corrective action has been completed.</span><input type="checkbox" checked={actionCompleted} onChange={(event) => setActionCompleted(event.target.checked)} required disabled={closure.isPending} /></label>
      {(validationError || closure.isError) && <div className="auth-message error" role="alert">{validationError || closure.error?.message}</div>}
      <div className="incident-management-actions">
        <button type="button" className="button button-outline button-small" onClick={onDismiss} disabled={closure.isPending}>Cancel</button>
        <button type="submit" className="button button-green button-small" disabled={closure.isPending}>{closure.isPending ? 'Closing...' : 'Confirm closure'}</button>
      </div>
    </form>
  </section>
}
