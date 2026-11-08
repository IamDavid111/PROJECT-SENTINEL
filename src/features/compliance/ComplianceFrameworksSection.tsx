import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { Alert, Button, Card, Select, Spinner } from '../../components/ui'
import { DOCUMENT_UPLOAD_ACCEPT } from '../../lib/documentUpload'
import {
  getLegalComplianceCapabilities,
  activateLegalComplianceRenewal,
  abandonLegalComplianceRenewal,
  beginLegalComplianceRenewal,
  listLegalComplianceObligations,
  removeLegalComplianceDocument,
  saveLegalComplianceObligation,
  setLegalComplianceDocument,
  softDeleteLegalComplianceObligation,
  uploadLegalComplianceDocument,
  validateLegalComplianceDocument,
  type ComplianceCategory,
  type ComplianceScopeType,
  type ComplianceStatus,
  type LegalComplianceDraft,
  type LegalComplianceObligation,
} from './legalComplianceService'

const EMPTY_DRAFT: LegalComplianceDraft = {
  obligation_name: '',
  category: 'license',
  issuing_authority: '',
  scope_type: 'organization',
  site_id: null,
  department: null,
  issue_date: '',
  expiry_date: '',
  responsible_person_id: '',
  compliance_status: 'not_assessed',
}

export function ComplianceFrameworksSection({ client, organizationId, userId }: {
  client: SupabaseClient
  organizationId: string
  userId: string
}) {
  const [records, setRecords] = useState<LegalComplianceObligation[]>([])
  const [people, setPeople] = useState<Array<{ id: string; full_name: string }>>([])
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([])
  const [draft, setDraft] = useState<LegalComplianceDraft>(EMPTY_DRAFT)
  const [file, setFile] = useState<File | null>(null)
  const [editingRecord, setEditingRecord] = useState<LegalComplianceObligation | null>(null)
  const [renewingRecord, setRenewingRecord] = useState<LegalComplianceObligation | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const reload = useCallback(async () => {
    try {
      const permissions = await getLegalComplianceCapabilities(client, organizationId)
      setCanManage(permissions.canManage)
      if (!permissions.canManage) {
        setRecords([])
        return
      }
      const [obligations, peopleResponse, sitesResponse] = await Promise.all([
        listLegalComplianceObligations(client, organizationId),
        client.from('profiles').select('id, full_name').eq('organization_id', organizationId).eq('account_status', 'active').order('full_name'),
        client.from('sites').select('id, name').eq('organization_id', organizationId).order('name'),
      ])
      setRecords(obligations)
      setPeople((peopleResponse.data || []) as Array<{ id: string; full_name: string }>)
      setSites((sitesResponse.data || []) as Array<{ id: string; name: string }>)
      if (peopleResponse.error || sitesResponse.error) throw peopleResponse.error || sitesResponse.error
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load Compliance Frameworks.')
    } finally {
      setLoading(false)
    }
  }, [client, organizationId])

  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) void reload() })
    return () => { active = false }
  }, [reload])

  const resetForm = () => {
    setDraft(EMPTY_DRAFT)
    setFile(null)
    setEditingRecord(null)
    setRenewingRecord(null)
  }

  const editRecord = (record: LegalComplianceObligation) => {
    setEditingRecord(record)
    setRenewingRecord(null)
    setDraft({
      obligation_name: record.obligation_name,
      category: record.category,
      issuing_authority: record.issuing_authority,
      scope_type: record.scope_type,
      site_id: record.site_id,
      department: record.department,
      issue_date: record.active_version.issue_date,
      expiry_date: record.active_version.expiry_date || '',
      responsible_person_id: record.active_version.responsible_person_id,
      compliance_status: record.active_version.compliance_status,
    })
    setFile(null)
    setError('')
    setMessage('')
  }

  const renewRecord = (record: LegalComplianceObligation) => {
    setEditingRecord(null)
    setRenewingRecord(record)
    setDraft({
      obligation_name: record.obligation_name,
      category: record.category,
      issuing_authority: record.issuing_authority,
      scope_type: record.scope_type,
      site_id: record.site_id,
      department: record.department,
      issue_date: record.active_version.issue_date,
      expiry_date: record.active_version.expiry_date || '',
      responsible_person_id: record.active_version.responsible_person_id,
      compliance_status: record.active_version.compliance_status,
    })
    setFile(null)
    setError('')
    setMessage('')
  }

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!draft.obligation_name.trim() || !draft.issuing_authority.trim() || !draft.issue_date || !draft.responsible_person_id) {
      setError('Complete the obligation name, issuing authority, issue date, and responsible person.')
      return
    }
    if (draft.scope_type === 'site' && !draft.site_id) {
      setError('Select a site for this obligation.')
      return
    }
    if (draft.scope_type === 'department' && !draft.department?.trim()) {
      setError('Enter a department for this obligation.')
      return
    }
    if (draft.expiry_date && draft.expiry_date < draft.issue_date) {
      setError('Expiry date cannot be earlier than the issue date.')
      return
    }
    try {
      if (file) validateLegalComplianceDocument(file)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Supporting document is invalid.')
      return
    }

    setSaving(true)
    let saved: LegalComplianceObligation | null = null
    let cleanupWarning = ''
    let renewalVersionId: string | null = null
    let renewalDocumentPath: string | null = null
    let renewalActivated = false
    let replacementDocumentPath: string | null = null
    let replacementDocumentSaved = !file
    try {
      if (renewingRecord) {
        if (!file) throw new Error('Upload the renewed license, permit, approval, or certificate before saving the renewal.')
        const renewal = await beginLegalComplianceRenewal(client, organizationId, renewingRecord.id, draft)
        renewalVersionId = renewal.id
        const uploaded = await uploadLegalComplianceDocument(client, organizationId, renewingRecord.id, renewal.id, file)
        renewalDocumentPath = uploaded.path
        await setLegalComplianceDocument(client, organizationId, renewal.id, uploaded, userId)
        await activateLegalComplianceRenewal(client, organizationId, renewingRecord.id, renewal.id)
        renewalActivated = true
        resetForm()
        setMessage(`${draft.obligation_name} renewed successfully. Version ${renewal.version_number} is now active.`)
        await reload()
        return
      }

      const replacementDocument = file && editingRecord
        ? await uploadLegalComplianceDocument(client, organizationId, editingRecord.id, editingRecord.active_version.id, file)
        : undefined
      replacementDocumentPath = replacementDocument?.path ?? null
      saved = await saveLegalComplianceObligation(client, organizationId, userId, draft, editingRecord?.id, replacementDocument)
      if (file) {
        const uploaded = replacementDocument
          ?? await uploadLegalComplianceDocument(client, organizationId, saved.id, saved.active_version.id, file)
        replacementDocumentPath = uploaded.path
        if (!editingRecord) {
          await setLegalComplianceDocument(client, organizationId, saved.active_version.id, uploaded, userId)
        }
        replacementDocumentSaved = true
        if (editingRecord?.active_version.document_path) {
          try {
            await removeLegalComplianceDocument(client, editingRecord.active_version.document_path)
          } catch {
            cleanupWarning = ' The previous document could not be removed.'
          }
        }
      }
      resetForm()
      setMessage(`${editingRecord ? 'Obligation updated' : 'Obligation created'} successfully.${cleanupWarning}`)
      await reload()
    } catch (caught) {
      if (renewalVersionId && !renewalActivated) {
        if (renewalDocumentPath) {
          try {
            await removeLegalComplianceDocument(client, renewalDocumentPath)
          } catch {
            cleanupWarning = ' The uploaded renewal file could not be removed; contact your Super Admin.'
          }
        }
        try {
          await abandonLegalComplianceRenewal(client, organizationId, renewingRecord!.id, renewalVersionId)
        } catch {
          cleanupWarning += ' The unfinished renewal could not be closed; contact your Super Admin.'
        }
      }
      if (replacementDocumentPath && !replacementDocumentSaved) {
        try {
          await removeLegalComplianceDocument(client, replacementDocumentPath)
        } catch {
          cleanupWarning += ' The uploaded replacement file could not be removed; contact your Super Admin.'
        }
      }
      if (saved && !editingRecord && file && !replacementDocumentSaved) {
        try {
          await softDeleteLegalComplianceObligation(client, organizationId, saved.id)
        } catch {
          setError('The upload failed and the new obligation could not be cleaned up. Contact your Super Admin.')
          return
        }
      }
      setError(`${caught instanceof Error ? caught.message : 'Unable to save the obligation.'}${cleanupWarning}`)
    } finally {
      setSaving(false)
    }
  }

  const deleteRecord = async (record: LegalComplianceObligation) => {
    if (!window.confirm(`Delete “${record.obligation_name}”?`)) return
    setError('')
    setMessage('')
    try {
      await softDeleteLegalComplianceObligation(client, organizationId, record.id)
      if (editingRecord?.id === record.id) resetForm()
      setMessage('Obligation deleted.')
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete the obligation.')
    }
  }

  const downloadActiveDocument = async (record: LegalComplianceObligation) => {
    if (!record.active_version.document_path) return
    const { data, error: downloadError } = await client.storage.from('legal-compliance-documents').download(record.active_version.document_path)
    if (downloadError || !data) {
      setError(downloadError?.message || 'Unable to download the supporting document.')
      return
    }
    const url = URL.createObjectURL(data)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = record.active_version.document_name || 'compliance-document'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  if (loading) return <Card className="flex items-center gap-3 p-6"><Spinner size={18} fill="currentColor" className="text-brand" label="Loading Compliance Frameworks" /><span className="text-sm text-muted">Loading Compliance Frameworks…</span></Card>
  if (error && !canManage) return <Alert tone="danger">{error}</Alert>
  if (!canManage) return <Alert tone="warning">You don't have permission, contact your Super Admin</Alert>

  return (
    <div className="grid gap-5">
      <Card className="grid gap-4 p-5 sm:p-6">
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground">Compliance Frameworks</h2>
          <p className="mt-1 text-sm leading-6 text-muted">Manage organization legal and compliance obligations and their supporting documents.</p>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        {message && <Alert tone="success">{message}</Alert>}
        <form className="grid gap-4 border-t border-line pt-4" onSubmit={(event) => void save(event)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">{renewingRecord ? `Renew ${renewingRecord.obligation_name}` : editingRecord ? 'Edit obligation' : 'Add obligation'}</h3>
            {(editingRecord || renewingRecord) && <Button type="button" size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-1.5 text-sm font-medium text-foreground">Obligation name
              <input required maxLength={200} value={draft.obligation_name} onChange={(event) => setDraft((current) => ({ ...current, obligation_name: event.target.value }))} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-foreground" disabled={saving || Boolean(renewingRecord)} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">Category
              <Select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as ComplianceCategory }))} disabled={saving || Boolean(renewingRecord)}>
                <option value="license">License</option><option value="permit">Permit</option><option value="approval">Approval</option><option value="certification">Certification</option><option value="other">Other</option>
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">Issuing authority
              <input required maxLength={200} value={draft.issuing_authority} onChange={(event) => setDraft((current) => ({ ...current, issuing_authority: event.target.value }))} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-foreground" disabled={saving || Boolean(renewingRecord)} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">Organization / site / department
              <Select value={draft.scope_type} onChange={(event) => setDraft((current) => ({ ...current, scope_type: event.target.value as ComplianceScopeType, site_id: null, department: null }))} disabled={saving || Boolean(renewingRecord)}>
                <option value="organization">Organization</option><option value="site">Site</option><option value="department">Department</option>
              </Select>
            </label>
            {draft.scope_type === 'site' && <label className="grid gap-1.5 text-sm font-medium text-foreground">Site
              <Select value={draft.site_id || ''} onChange={(event) => setDraft((current) => ({ ...current, site_id: event.target.value || null }))} disabled={saving || Boolean(renewingRecord)}>
                <option value="">Select site</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </Select>
            </label>}
            {draft.scope_type === 'department' && <label className="grid gap-1.5 text-sm font-medium text-foreground">Department
              <input required maxLength={160} value={draft.department || ''} onChange={(event) => setDraft((current) => ({ ...current, department: event.target.value }))} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-foreground" disabled={saving || Boolean(renewingRecord)} />
            </label>}
            <label className="grid gap-1.5 text-sm font-medium text-foreground">Issue date
              <input required type="date" value={draft.issue_date} onChange={(event) => setDraft((current) => ({ ...current, issue_date: event.target.value }))} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-foreground" disabled={saving} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">Expiry date (optional)
              <input type="date" value={draft.expiry_date} onChange={(event) => setDraft((current) => ({ ...current, expiry_date: event.target.value }))} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-foreground" disabled={saving} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">Responsible person
              <Select value={draft.responsible_person_id} onChange={(event) => setDraft((current) => ({ ...current, responsible_person_id: event.target.value }))} disabled={saving}>
                <option value="">Select responsible person</option>{people.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.id}</option>)}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">Compliance status
              <Select value={draft.compliance_status} onChange={(event) => setDraft((current) => ({ ...current, compliance_status: event.target.value as ComplianceStatus }))} disabled={saving}>
                <option value="not_assessed">Not assessed</option><option value="compliant">Compliant</option><option value="non_compliant">Non-compliant</option><option value="under_review">Under review</option>
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground sm:col-span-2">Supporting document {renewingRecord ? '(required for renewal)' : '(optional)'}
              <input type="file" accept={DOCUMENT_UPLOAD_ACCEPT} onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground" disabled={saving} />
              <span className="text-xs text-muted">Images, documents, spreadsheets, presentations, or text files up to 20 MB.</span>
              {!renewingRecord && editingRecord?.active_version.document_name && <span className="text-xs text-muted">Current file: {editingRecord.active_version.document_name}</span>}
              {renewingRecord && <span className="text-xs text-muted">The renewal is saved as a new version; previous versions and documents are retained.</span>}
            </label>
          </div>
          <div><Button type="submit" loading={saving}>{renewingRecord ? 'Upload and activate renewal' : editingRecord ? 'Save changes' : 'Create obligation'}</Button></div>
        </form>
      </Card>

      <section className="grid gap-3">
        <h3 className="text-sm font-semibold text-foreground">Obligations</h3>
        {!records.length && <Card className="p-5 text-sm text-muted">No legal or compliance obligations have been added.</Card>}
        {records.map((record) => (
          <Card key={record.id} className="grid gap-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-1">
                <h4 className="text-base font-semibold text-foreground">{record.obligation_name}</h4>
                <p className="text-sm text-muted">{record.category[0].toUpperCase() + record.category.slice(1)} · {record.issuing_authority}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => editRecord(record)}>Edit</Button>
                <Button size="sm" variant="outline" onClick={() => renewRecord(record)}>Renew</Button>
                <Button size="sm" variant="ghost" onClick={() => void deleteRecord(record)}>Delete</Button>
              </div>
            </div>
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-muted">Scope</dt><dd className="text-foreground">{record.scope_type === 'site' ? sites.find((site) => site.id === record.site_id)?.name || 'Site' : record.scope_type === 'department' ? record.department : 'Organization'}</dd></div>
              <div><dt className="text-xs text-muted">Issue date</dt><dd className="text-foreground">{record.active_version.issue_date}</dd></div>
              <div><dt className="text-xs text-muted">Expiry date</dt><dd className="text-foreground">{record.active_version.expiry_date || 'No expiry'}</dd></div>
              <div><dt className="text-xs text-muted">Responsible person</dt><dd className="text-foreground">{people.find((person) => person.id === record.active_version.responsible_person_id)?.full_name || 'Organization member'}</dd></div>
              <div><dt className="text-xs text-muted">Compliance status</dt><dd className="text-foreground">{record.active_version.compliance_status.replaceAll('_', ' ')}</dd></div>
              <div><dt className="text-xs text-muted">Supporting document</dt><dd className="text-foreground">{record.active_version.document_name || 'None'}</dd></div>
            </dl>
            {record.active_version.document_path && <Button size="sm" variant="outline" className="w-fit" onClick={() => void downloadActiveDocument(record)}>Download document</Button>}
          </Card>
        ))}
      </section>
    </div>
  )
}