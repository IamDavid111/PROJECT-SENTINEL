import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { Alert, Button, Card, Spinner } from '../../components/ui'
import {
  deletePolicyObjective,
  downloadPolicyObjectiveDocument,
  getPolicyObjectivesCapabilities,
  listPolicyObjectives,
  removePolicyObjectiveDocument,
  savePolicyObjective,
  setPolicyObjectiveDocument,
  uploadPolicyObjectiveDocument,
  validatePolicyObjectiveDocument,
  type PolicyObjectiveDraft,
  type PolicyObjectiveRecord,
  type PolicyObjectiveType,
} from './policyObjectivesService'

const EMPTY_DRAFT: PolicyObjectiveDraft = {
  item_type: 'policy',
  title: '',
  description: '',
  performance_target: '',
  baseline_value: '',
}

const DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.xlsx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain'

export function PolicyObjectivesSettingsSection({ client, organizationId }: {
  client: SupabaseClient
  organizationId: string
}) {
  const [records, setRecords] = useState<PolicyObjectiveRecord[]>([])
  const [canView, setCanView] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingType, setSavingType] = useState<PolicyObjectiveType | null>(null)
  const [editingRecords, setEditingRecords] = useState<Partial<Record<PolicyObjectiveType, PolicyObjectiveRecord>>>({})
  const [drafts, setDrafts] = useState<Record<PolicyObjectiveType, PolicyObjectiveDraft>>({
    policy: { ...EMPTY_DRAFT, item_type: 'policy' },
    objective: { ...EMPTY_DRAFT, item_type: 'objective' },
  })
  const [files, setFiles] = useState<Partial<Record<PolicyObjectiveType, File>>>({})
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const reload = useCallback(async () => {
    try {
      const capabilities = await getPolicyObjectivesCapabilities(client, organizationId)
      setCanView(capabilities.canView)
      setCanManage(capabilities.canManage)
      if (capabilities.canView || capabilities.canManage) {
        setRecords(await listPolicyObjectives(client, organizationId))
      } else {
        setRecords([])
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load Policy and Objectives settings.')
    } finally {
      setLoading(false)
    }
  }, [client, organizationId])

  useEffect(() => {
    void reload()
  }, [reload])

  const resetForm = (type: PolicyObjectiveType) => {
    setEditingRecords((current) => ({ ...current, [type]: undefined }))
    setDrafts((current) => ({ ...current, [type]: { ...EMPTY_DRAFT, item_type: type } }))
    setFiles((current) => ({ ...current, [type]: undefined }))
  }

  const beginEdit = (record: PolicyObjectiveRecord) => {
    setEditingRecords((current) => ({ ...current, [record.item_type]: record }))
    setDrafts((current) => ({ ...current, [record.item_type]: {
      item_type: record.item_type,
      title: record.title,
      description: record.description,
      performance_target: record.performance_target,
      baseline_value: record.baseline_value,
    } }))
    setFiles((current) => ({ ...current, [record.item_type]: undefined }))
    setError('')
    setMessage('')
  }

  const updateDraft = <K extends keyof PolicyObjectiveDraft>(type: PolicyObjectiveType, key: K, value: PolicyObjectiveDraft[K]) => {
    setDrafts((current) => ({ ...current, [type]: { ...current[type], [key]: value } }))
  }

  const save = async (type: PolicyObjectiveType) => {
    const draft = drafts[type]
    const file = files[type]
    const editingRecord = editingRecords[type]
    if (!draft.title.trim()) {
      setError(`Enter an HSSE ${type} title.`)
      return
    }
    try {
      if (file) validatePolicyObjectiveDocument(file)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Supporting document is invalid.')
      return
    }
    setSavingType(type)
    setError('')
    setMessage('')
    let saved: PolicyObjectiveRecord | null = null
    let cleanupWarning = ''
    let documentMetadataSaved = !file
    try {
      saved = await savePolicyObjective(client, organizationId, draft, editingRecord?.id)
      if (file) {
        const uploaded = await uploadPolicyObjectiveDocument(client, organizationId, saved.id, file)
        try {
          await setPolicyObjectiveDocument(client, organizationId, saved.id, uploaded)
        } catch (caught) {
          await removePolicyObjectiveDocument(client, uploaded.path)
          throw caught
        }
        documentMetadataSaved = true
        if (editingRecord?.document_path) {
          try {
            await removePolicyObjectiveDocument(client, editingRecord.document_path)
          } catch {
            cleanupWarning = ' The previous supporting document could not be removed.'
          }
        }
      }
      resetForm(type)
      setMessage(`${editingRecord ? `HSSE ${type} updated successfully.` : `HSSE ${type} uploaded successfully.`}${cleanupWarning}`)
      await reload()
    } catch (caught) {
      if (saved && !editingRecord && file && !documentMetadataSaved) {
        try {
          await deletePolicyObjective(client, saved)
        } catch {
          setError('The document upload failed and the new record could not be cleaned up. Retry or contact your administrator.')
          return
        }
      }
      setError(caught instanceof Error ? caught.message : 'Unable to save the policy or objective.')
    } finally {
      setSavingType(null)
    }
  }

  const removeDocument = async (record: PolicyObjectiveRecord) => {
    if (!record.document_path) return
    setError('')
    setMessage('')
    try {
      await setPolicyObjectiveDocument(client, organizationId, record.id, null)
      await removePolicyObjectiveDocument(client, record.document_path)
      if (editingRecords[record.item_type]?.id === record.id) {
        setEditingRecords((current) => ({ ...current, [record.item_type]: { ...record, document_path: null, document_name: null } }))
      }
      setMessage('Supporting document removed.')
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to remove the supporting document.')
    }
  }

  const removeRecord = async (record: PolicyObjectiveRecord) => {
    if (!window.confirm(`Delete “${record.title}” and its supporting document?`)) return
    setError('')
    setMessage('')
    try {
      await deletePolicyObjective(client, record)
      if (editingRecords[record.item_type]?.id === record.id) resetForm(record.item_type)
      setMessage('Policy or objective deleted.')
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete the policy or objective.')
    }
  }

  const downloadDocument = async (record: PolicyObjectiveRecord) => {
    setError('')
    try {
      const { blob, filename } = await downloadPolicyObjectiveDocument(client, record)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to download the supporting document.')
    }
  }

  if (loading) {
    return (
      <Card className="flex items-center gap-3 p-6" role="status">
        <Spinner size={18} fill="currentColor" className="text-brand" label="Loading Policy and Objectives settings" />
        <span className="text-sm text-muted">Loading Policy and Objectives…</span>
      </Card>
    )
  }

  if (error && !canView && !canManage) {
    return <Alert tone="danger">{error}</Alert>
  }

  if (!canView && !canManage) {
    return <Alert tone="warning">You don't have access to Policy and Objectives settings.</Alert>
  }

  return (
    <div className="grid gap-5">
      <Card className="grid gap-4 p-5 sm:p-6">
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground">Policy and Objectives</h2>
          <p className="mt-1 text-sm leading-6 text-muted">Approved organizational HSSE policies, objectives, performance targets, and baselines.</p>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}
        {message && <Alert tone="success">{message}</Alert>}

        {canManage && (
          <div className="grid gap-4 border-t border-line pt-4 md:grid-cols-2">
            {(['policy', 'objective'] as const).map((type) => {
              const draft = drafts[type]
              const editingRecord = editingRecords[type]
              const title = type === 'policy' ? 'HSSE Policy' : 'HSSE Objectives'
              const isSaving = savingType === type
              return (
                <form key={type} className="grid content-start gap-4 rounded-card border border-line p-4" onSubmit={(event) => { event.preventDefault(); void save(type) }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{editingRecord ? `Edit ${title}` : `Upload ${title}`}</h3>
                    {editingRecord && <Button type="button" size="sm" variant="ghost" onClick={() => resetForm(type)}>Cancel edit</Button>}
                  </div>
                  <label className="grid gap-1.5 text-sm font-medium text-foreground">
                    {type === 'policy' ? 'Policy title' : 'Objective title'}
                    <input
                      value={draft.title}
                      onChange={(event) => updateDraft(type, 'title', event.target.value)}
                      maxLength={200}
                      required
                      className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                      disabled={savingType !== null}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium text-foreground">
                    Description
                    <textarea
                      value={draft.description}
                      onChange={(event) => updateDraft(type, 'description', event.target.value)}
                      rows={3}
                      className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                      disabled={savingType !== null}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-sm font-medium text-foreground">
                      Performance target
                      <input value={draft.performance_target} onChange={(event) => updateDraft(type, 'performance_target', event.target.value)} maxLength={500} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/40" disabled={savingType !== null} />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium text-foreground">
                      Baseline value
                      <input value={draft.baseline_value} onChange={(event) => updateDraft(type, 'baseline_value', event.target.value)} maxLength={500} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/40" disabled={savingType !== null} />
                    </label>
                  </div>
                  <label className="grid gap-1.5 text-sm font-medium text-foreground">
                    Supporting document
                    <input type="file" accept={DOCUMENT_ACCEPT} onChange={(event) => setFiles((current) => ({ ...current, [type]: event.target.files?.[0] }))} className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground" disabled={savingType !== null} />
                    <span className="text-xs text-muted">PDF, Word, spreadsheet, or text file up to 100 MB. Selecting a file replaces the current attachment.</span>
                    {editingRecord?.document_name && (
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        Current file: {editingRecord.document_name}
                        <button type="button" className="font-medium text-danger underline underline-offset-2" disabled={savingType !== null} onClick={() => void removeDocument(editingRecord)}>Remove file</button>
                      </span>
                    )}
                  </label>
                  <Button type="submit" loading={isSaving} disabled={savingType !== null && !isSaving}>
                    {editingRecord ? `Save ${title}` : `Upload ${title}`}
                  </Button>
                </form>
              )
            })}
          </div>
        )}
      </Card>

      <div className="grid gap-3">
        <h3 className="text-sm font-semibold text-foreground">Approved records</h3>
        {records.length === 0 && <p className="text-sm text-muted">No approved policies or objectives have been added.</p>}
        {records.map((record) => (
          <Card key={record.id} className="grid gap-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-dark">
                  {record.item_type === 'policy' ? 'HSSE Policy' : 'HSSE Objective'} · Approved
                </span>
                <h4 className="text-base font-semibold text-foreground">{record.title}</h4>
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => beginEdit(record)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => void removeRecord(record)}>Delete</Button>
                </div>
              )}
            </div>
            {record.description && <p className="whitespace-pre-wrap text-sm leading-6 text-muted">{record.description}</p>}
            {(record.performance_target || record.baseline_value) && (
              <dl className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
                {record.performance_target && <div><dt className="text-xs font-medium text-muted">Performance target</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-foreground">{record.performance_target}</dd></div>}
                {record.baseline_value && <div><dt className="text-xs font-medium text-muted">Baseline value</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-foreground">{record.baseline_value}</dd></div>}
              </dl>
            )}
            {record.document_path && record.document_name && (
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                <span className="min-w-0 truncate text-sm text-muted">{record.document_name}</span>
                <Button size="sm" variant="outline" onClick={() => void downloadDocument(record)}>Download</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}