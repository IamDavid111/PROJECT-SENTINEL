import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'

import { createAction, downloadQhseFile, getActionsWorkspace, resolveAction, reassignAction, validateQhseFile } from './inspectionActionService'
import type { ActionRecord, QhsePerson, QhseSite } from './inspectionActionService'

function localDateTime() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

export function ActionsWorkspace({ supabase, canManage, assignedOnly = false }: { supabase: SupabaseClient; canManage: boolean; assignedOnly?: boolean }) {
  const queryClient = useQueryClient()
  const [actions, setActions] = useState<ActionRecord[]>([])
  const [sites, setSites] = useState<QhseSite[]>([])
  const [people, setPeople] = useState<QhsePerson[]>([])
  const [organizationId, setOrganizationId] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [type, setType] = useState<'preventive' | 'corrective'>('corrective')
  const [description, setDescription] = useState('')
  const [siteId, setSiteId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueAt, setDueAt] = useState(localDateTime)
  const [resolutionAction, setResolutionAction] = useState<string | null>(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const refresh = async () => {
    const data = await getActionsWorkspace(supabase, assignedOnly)
    setOrganizationId(data.organizationId)
    setCurrentUserId(data.userId)
    setActions(data.actions)
    setSites(data.sites)
    setPeople(data.people)
    setSiteId((current) => current || data.sites[0]?.id || '')
    setAssigneeId((current) => current || data.people[0]?.id || '')
  }

  useEffect(() => {
    let active = true
    void getActionsWorkspace(supabase, assignedOnly).then((data) => {
      if (!active) return
      setOrganizationId(data.organizationId)
      setCurrentUserId(data.userId)
      setActions(data.actions)
      setSites(data.sites)
      setPeople(data.people)
      setSiteId(data.sites[0]?.id || '')
      setAssigneeId(data.people[0]?.id || '')
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load actions.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [assignedOnly, supabase])

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const finishMutation = async (successMessage: string) => {
    await refresh()
    if (organizationId) await queryClient.invalidateQueries({ queryKey: ['dashboard', organizationId] })
    setMessage(successMessage)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await createAction(supabase, { type, description, siteId, assigneeId, dueAt })
      await finishMutation('Action created and assigned.')
      setDescription('')
      setDueAt(localDateTime())
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create the action.')
    } finally {
      setBusy(false)
    }
  }

  const reassign = async (action: ActionRecord, nextAssigneeId: string) => {
    setBusy(true)
    setError('')
    try {
      await reassignAction(supabase, action.id, nextAssigneeId)
      await finishMutation('Action reassigned.')
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : 'Unable to reassign the action.')
    } finally {
      setBusy(false)
    }
  }

  const resolve = async (action: ActionRecord) => {
    setBusy(true)
    setError('')
    try {
      validateQhseFile(proofFile)
      await resolveAction(supabase, action, resolutionNotes, proofFile)
      setResolutionAction(null)
      setResolutionNotes('')
      setProofFile(null)
      await finishMutation('Action resolved.')
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : 'Unable to resolve the action.')
    } finally {
      setBusy(false)
    }
  }

  const siteName = (id: string) => sites.find((site) => site.id === id)?.name || 'Site unavailable'
  const personName = (id: string) => people.find((person) => person.id === id)?.full_name || 'Organization user'
  const heading = assignedOnly ? 'Assigned Actions' : 'Actions'

  return <div className="my-reports-page">
    <div className="my-reports-header"><div><div className="eyebrow">OPERATIONS &amp; QHSE</div><h2>{heading}</h2><p>{assignedOnly ? 'Actions assigned to your account.' : 'Create, assign, and track organization actions.'}</p></div>{canManage && <a className="button button-outline button-small" href="#assigned-actions">Assigned Actions</a>}</div>
    {error && <div className="auth-message error" role="alert">{error}</div>}
    {message && <div className="auth-message success" role="status">{message}</div>}
    {canManage && !assignedOnly && <form className="incident-form" onSubmit={(event) => void submit(event)}>
      <section className="incident-form-section"><div className="incident-form-section-heading"><div><h3>Create action</h3><p>Assign the action to an active member of this organization.</p></div></div>
        <div className="incident-form-grid">
          <label>Type *<select value={type} onChange={(event) => setType(event.target.value as 'preventive' | 'corrective')}><option value="preventive">Preventive</option><option value="corrective">Corrective</option></select></label>
          <label>Site *<select value={siteId} onChange={(event) => setSiteId(event.target.value)} required><option value="">Select a site</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
          <label>Assignee *<select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} required><option value="">Select an assignee</option>{people.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label>
          <label>Due date and time *<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required /></label>
          <label className="incident-form-wide">Description *<textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} required /></label>
        </div>
      </section>
      <div className="incident-form-actions"><button className="button button-green button-large" type="submit" disabled={busy || loading || !sites.length || !people.length}>{busy ? 'Saving action...' : 'Create action'}</button></div>
    </form>}
    <section className="my-reports-page">
      <div className="my-reports-header"><div><div className="eyebrow">ACTION REGISTER</div><h2>{assignedOnly ? 'My assigned actions' : 'Organization actions'}</h2><p>{actions.length} actions</p></div></div>
      {loading ? <div className="workspace-empty">Loading actions...</div> : actions.length ? <div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>Type / Description</th><th>Site</th><th>Assignee</th><th>Due</th><th>Status</th><th>Created</th><th>Resolved</th><th>Action</th></tr></thead><tbody>
        {actions.map((action) => {
          const overdue = action.status === 'open' && new Date(action.due_at).getTime() < currentTime
          const canResolve = action.status === 'open' && (canManage || action.assignee_id === currentUserId)
          return <tr key={action.id}>
            <td><strong>{action.type === 'corrective' ? 'Corrective' : 'Preventive'}</strong><small className="report-subline">{action.description}</small>{action.resolution_notes && <small className="report-subline">Resolution: {action.resolution_notes}</small>}</td>
            <td>{siteName(action.site_id)}</td>
            <td>{canManage && !assignedOnly && action.status === 'open' ? <select aria-label={`Assignee for ${action.description}`} value={action.assignee_id} disabled={busy} onChange={(event) => void reassign(action, event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select> : personName(action.assignee_id)}</td>
            <td>{new Date(action.due_at).toLocaleString()}</td>
            <td><span className={`incident-status-badge status-${action.status}`}>{overdue ? 'Overdue' : action.status}</span></td>
            <td>{new Date(action.created_at).toLocaleDateString()}</td>
            <td>{action.resolved_at ? new Date(action.resolved_at).toLocaleString() : '—'}</td>
            <td>{canResolve ? <button className="button button-outline button-small" type="button" onClick={() => { setResolutionAction((current) => current === action.id ? null : action.id); setResolutionNotes(''); setProofFile(null) }}>Resolve Action</button> : action.proof_storage_path && action.proof_file_name ? <button className="button button-outline button-small" type="button" onClick={() => void downloadQhseFile(supabase, action.proof_storage_path!, action.proof_file_name!).catch((downloadError: unknown) => setError(downloadError instanceof Error ? downloadError.message : 'Unable to download proof.'))}>View proof</button> : '—'}</td>
          </tr>
        }).flatMap((row, index) => {
          const action = actions[index]
          return [row, resolutionAction === action.id ? <tr key={`${action.id}-resolve`}><td colSpan={8}><div className="incident-form-grid">
            <label className="incident-form-wide">Resolution notes<textarea rows={3} value={resolutionNotes} onChange={(event) => setResolutionNotes(event.target.value)} /></label>
            <label className="incident-form-wide">Optional photo or proof file<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setProofFile(event.target.files?.[0] || null)} /></label>
            <div className="incident-form-actions"><button className="button button-green button-small" type="button" disabled={busy} onClick={() => void resolve(action)}>{busy ? 'Resolving...' : 'Confirm resolution'}</button></div>
          </div></td></tr> : null]
        })}
      </tbody></table></div> : <div className="workspace-empty">{assignedOnly ? 'No actions are assigned to you.' : 'No actions have been created yet.'}</div>}
    </section>
  </div>
}