import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'

import { createInspection, downloadQhseFile, getInspectionWorkspace, validateQhseFile } from './inspectionActionService'
import type { InspectionRecord, QhsePerson, QhseSite } from './inspectionActionService'

function localDateTime() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

export function InspectionWorkspace({ supabase }: { supabase: SupabaseClient }) {
  const queryClient = useQueryClient()
  const [sites, setSites] = useState<QhseSite[]>([])
  const [people, setPeople] = useState<QhsePerson[]>([])
  const [inspections, setInspections] = useState<InspectionRecord[]>([])
  const [siteId, setSiteId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [findings, setFindings] = useState('')
  const [inspectionDate, setInspectionDate] = useState(localDateTime)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [organizationId, setOrganizationId] = useState('')

  const refresh = async () => {
    const data = await getInspectionWorkspace(supabase)
    setOrganizationId(data.organizationId)
    setSites(data.sites)
    setPeople(data.people)
    setInspections(data.inspections)
    setSiteId((current) => current || data.sites[0]?.id || '')
  }

  useEffect(() => {
    let active = true
    void getInspectionWorkspace(supabase).then((data) => {
      if (!active) return
      setOrganizationId(data.organizationId)
      setSites(data.sites)
      setPeople(data.people)
      setInspections(data.inspections)
      setSiteId(data.sites[0]?.id || '')
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load inspections.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [supabase])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      validateQhseFile(file)
      const result = await createInspection(supabase, { siteId, title, description, findings, inspectionDate, file })
      await refresh()
      if (organizationId) await queryClient.invalidateQueries({ queryKey: ['dashboard', organizationId] })
      setTitle('')
      setDescription('')
      setFindings('')
      setInspectionDate(localDateTime())
      setFile(null)
      setMessage(result.uploadWarning || 'Inspection logged successfully.')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to log this inspection.')
    } finally {
      setBusy(false)
    }
  }

  const siteName = (id: string) => sites.find((site) => site.id === id)?.name || 'Site unavailable'
  const inspectorName = (id: string) => people.find((person) => person.id === id)?.full_name || 'Organization user'

  return <div className="incident-form-page">
    <div className="incident-form-header"><div><div className="eyebrow">OPERATIONS &amp; QHSE</div><h2>Log Inspection</h2><p>Record an inspection and its findings for an organization site.</p></div><div className="incident-form-header-actions"><a className="button button-outline button-small" href="#dashboard">Dashboard</a></div></div>
    {error && <div className="auth-message error" role="alert">{error}</div>}
    {message && <div className="auth-message success" role="status">{message}</div>}
    <form className="incident-form" onSubmit={(event) => void submit(event)}>
      <section className="incident-form-section">
        <div className="incident-form-section-heading"><div><h3>Inspection details</h3><p>Required fields are validated before the inspection is saved.</p></div></div>
        <div className="incident-form-grid">
          <label>Site *<select value={siteId} onChange={(event) => setSiteId(event.target.value)} required><option value="">Select a site</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
          <label>Inspection date and time *<input type="datetime-local" value={inspectionDate} onChange={(event) => setInspectionDate(event.target.value)} required /></label>
          <label className="incident-form-wide">Inspection title *<input value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={160} required /></label>
          <label className="incident-form-wide">Inspection description *<textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} required /></label>
          <label className="incident-form-wide">Findings and conclusions *<textarea rows={5} value={findings} onChange={(event) => setFindings(event.target.value)} required /></label>
          <label className="incident-form-wide">Optional photo or file<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} />{file && <small>{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB maximum 10 MB</small>}</label>
        </div>
      </section>
      <div className="incident-form-actions"><button className="button button-green button-large" type="submit" disabled={busy || loading || !sites.length}>{busy ? 'Saving inspection...' : 'Log inspection'}</button></div>
    </form>
    <section className="my-reports-page">
      <div className="my-reports-header"><div><div className="eyebrow">INSPECTION REGISTER</div><h2>Recent inspections</h2><p>{inspections.length} recent records</p></div></div>
      {loading ? <div className="workspace-empty">Loading inspections...</div> : inspections.length ? <div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>Inspection</th><th>Site</th><th>Inspector</th><th>Inspection date</th><th>Created</th><th>File</th></tr></thead><tbody>
        {inspections.map((inspection) => <tr key={inspection.id}><td><strong>{inspection.inspection_title}</strong><small className="report-subline">{inspection.description}</small></td><td>{siteName(inspection.site_id)}</td><td>{inspectorName(inspection.inspected_by)}</td><td>{new Date(inspection.inspection_date).toLocaleString()}</td><td>{new Date(inspection.created_at).toLocaleDateString()}</td><td>{inspection.file_storage_path && inspection.file_name ? <button className="button button-outline button-small" type="button" onClick={() => void downloadQhseFile(supabase, inspection.file_storage_path!, inspection.file_name!).catch((downloadError: unknown) => setError(downloadError instanceof Error ? downloadError.message : 'Unable to download file.'))}>Download</button> : 'None'}</td></tr>)}
      </tbody></table></div> : <div className="workspace-empty">No inspections have been logged yet.</div>}
    </section>
  </div>
}