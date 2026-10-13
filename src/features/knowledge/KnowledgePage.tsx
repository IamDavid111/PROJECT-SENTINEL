import type { SupabaseClient } from '@supabase/supabase-js'
import { useMemo, useState } from 'react'
import { Archive, ArchiveRestore, Check, Download, FilePlus2, FileText, Pencil, RefreshCw, Send, Upload, X } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { knowledgeDocumentTypes } from '../../../supabase/functions/knowledge-service/contracts'
import {
  approveAndProcessKnowledgeVersion, downloadKnowledgeVersion, knowledgeActions, retryKnowledgeUpload, uploadKnowledgeVersion,
  KnowledgeServiceError, type KnowledgeDocument, type KnowledgeListItem, type KnowledgeMetadataInput, type KnowledgeVersion,
} from './knowledgeService'
import { KnowledgeMetadataForm } from './KnowledgeMetadataForm'
import { currentKnowledgeVersion, formatFileSize, formatLabel, selectClass } from './knowledgeFormat'
import {
  useKnowledgeDirectory, useKnowledgeDocument, useKnowledgeDocuments, useKnowledgeMutation, type KnowledgeScope,
} from './useKnowledge'

const statuses = ['draft', 'pending_review', 'approved', 'rejected', 'superseded'] as const
const statusTone: Record<KnowledgeVersion['approval_status'], string> = {
  draft: 'bg-slate-100 text-slate-700',
  pending_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
  superseded: 'bg-slate-100 text-slate-500',
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.'
const isPast = (date: string | null) => Boolean(date && date < new Date().toISOString().slice(0, 10))

function StatusBadge({ status }: { status: KnowledgeVersion['approval_status'] }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone[status]}`}>{formatLabel(status)}</span>
}

function DateLine({ label, value, warnWhenPast }: { label: string; value: string | null; warnWhenPast?: boolean }) {
  const overdue = warnWhenPast && isPast(value)
  return <div><dt className="text-xs text-[var(--muted)]">{label}</dt>
    <dd className={`text-sm ${overdue ? 'font-semibold text-red-600' : 'text-[var(--text)]'}`}>{value ?? '—'}{overdue && ' (past due)'}</dd></div>
}

export function KnowledgePage({ client, scope }: { client: SupabaseClient; scope: KnowledgeScope }) {
  const list = useKnowledgeDocuments(client, scope)
  const directory = useKnowledgeDirectory(client, scope.organizationId)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [lifecycleFilter, setLifecycleFilter] = useState<'active' | 'archived' | ''>('active')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const canManage = list.data?.capabilities.canManage === true
  const people = useMemo(() => new Map((directory.data?.people ?? []).map((person) => [person.id, person.full_name])), [directory.data])

  const create = useKnowledgeMutation(scope.organizationId, (input: { metadata: KnowledgeMetadataInput; file: File }) =>
    uploadKnowledgeVersion(client, input))

  // Client-side filtering over metadata the server already authorized; this is not semantic search or RAG.
  const documents = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (list.data?.documents ?? []).filter((document) => {
      const version = document.currentVersion
      if (lifecycleFilter && document.lifecycle_status !== lifecycleFilter) return false
      if (typeFilter && version?.document_type !== typeFilter) return false
      if (statusFilter && version?.approval_status !== statusFilter) return false
      if (!term) return true
      return [version?.title, version?.description, version?.department, version?.original_filename, people.get(version?.owner_id ?? '')]
        .some((value) => value?.toLowerCase().includes(term))
    })
  }, [list.data, search, typeFilter, statusFilter, lifecycleFilter, people])

  return <div className="grid gap-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="eyebrow">KNOWLEDGE MANAGEMENT</div>
        <h2 className="text-2xl font-semibold text-[var(--text)]">QHSE Documents</h2>
        <p className="text-sm text-[var(--muted)]">Controlled policies, procedures and standards with version history and approval.</p></div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => void list.refetch()} disabled={list.isFetching}>
          <RefreshCw aria-hidden="true" />{list.isFetching ? 'Refreshing...' : 'Refresh'}</Button>
        {canManage && <Button size="sm" onClick={() => { setCreating(true); create.reset() }}><Upload aria-hidden="true" />Upload document</Button>}
      </div>
    </div>

    {creating && canManage && <Card><CardHeader><CardTitle>Upload a new QHSE document</CardTitle>
      <p className="text-sm text-[var(--muted)]">The first version starts as a draft until it is submitted and approved.</p></CardHeader>
      <CardContent><KnowledgeMetadataForm mode="create" currentUserId={scope.userId} sites={directory.data?.sites ?? []} people={directory.data?.people ?? []}
        pending={create.isPending} error={create.error ? errorMessage(create.error) : undefined} onCancel={() => setCreating(false)}
        onSubmit={(metadata, file) => file && create.mutate({ metadata, file }, {
          onSuccess: (result) => { setCreating(false); setSelectedId(result.documentId) },
          onError: (error) => { if (error instanceof KnowledgeServiceError && error.documentId) setSelectedId(error.documentId) },
        })} /></CardContent></Card>}

    <Card><CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-sm font-semibold sm:col-span-2 lg:col-span-1">Search
        <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title, owner, department, file" /></label>
      <label className="grid gap-1 text-sm font-semibold">Document type<select className={selectClass} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
        <option value="">All types</option>{knowledgeDocumentTypes.map((type) => <option key={type} value={type}>{formatLabel(type)}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-semibold">Status<select className={selectClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
        <option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-semibold">Lifecycle<select className={selectClass} value={lifecycleFilter}
        onChange={(event) => setLifecycleFilter(event.target.value as typeof lifecycleFilter)}>
        <option value="active">Active</option><option value="archived">Archived</option><option value="">All</option></select></label>
    </CardContent></Card>

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <section aria-label="QHSE document list" className="grid content-start gap-3">
        {list.isPending ? <p role="status">Loading authorized documents...</p>
          : list.isError ? <div className="auth-message error" role="alert">{errorMessage(list.error)}
            {list.error instanceof KnowledgeServiceError && list.error.requestId && <small> Reference: {list.error.requestId}</small>}</div>
          : documents.length === 0 ? <div className="workspace-panel"><p>{list.data.documents.length === 0
            ? 'No QHSE documents are available to you yet.' : 'No documents match the current filters.'}</p></div>
          : documents.map((document) => <DocumentRow key={document.id} document={document} owner={people.get(document.currentVersion?.owner_id ?? '')}
            selected={document.id === selectedId} onSelect={() => setSelectedId(document.id)} />)}
      </section>
      <section aria-label="Document detail">
        {selectedId ? <DocumentDetail key={selectedId} client={client} scope={scope} documentId={selectedId}
          sites={directory.data?.sites ?? []} people={directory.data?.people ?? []} onClose={() => setSelectedId(null)} />
          : <div className="workspace-panel"><p>Select a document to view its details and version history.</p></div>}
      </section>
    </div>
  </div>
}

function DocumentRow({ document, owner, selected, onSelect }: { document: KnowledgeListItem; owner?: string; selected: boolean; onSelect: () => void }) {
  const version = document.currentVersion
  const newer = document.latestVersion && document.latestVersion.id !== version?.id ? document.latestVersion : null
  return <button type="button" onClick={onSelect} aria-pressed={selected}
    className={`grid w-full gap-2 rounded-2xl border bg-[var(--surface)] p-4 text-left shadow-sm transition hover:border-[#16A34A] ${selected ? 'border-[#16A34A] ring-2 ring-[#16A34A]/20' : 'border-[var(--line)]'}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2 font-semibold text-[var(--text)]"><FileText size={16} aria-hidden="true" />
        <span className="truncate">{version?.title ?? 'Untitled document (no visible version)'}</span></span>
      <span className="flex gap-1.5">{document.lifecycle_status === 'archived' && <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Archived</span>}
        {version && <StatusBadge status={version.approval_status} />}</span>
    </div>
    {version && <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
      <span>{formatLabel(version.document_type)}</span><span>v{version.version_number}</span>
      <span>Owner: {owner ?? 'Unknown'}</span>
      {version.review_date && <span className={isPast(version.review_date) ? 'font-semibold text-red-600' : ''}>Review: {version.review_date}</span>}
      {version.expiry_date && <span className={isPast(version.expiry_date) ? 'font-semibold text-red-600' : ''}>Expires: {version.expiry_date}</span>}
    </div>}
    {newer && <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
      <span>Newer version: v{newer.version_number}</span><StatusBadge status={newer.approval_status} />
    </div>}
  </button>
}

type Panel = { kind: 'version' } | { kind: 'edit'; version: KnowledgeVersion } | { kind: 'reject'; version: KnowledgeVersion } | null

function DocumentDetail({ client, scope, documentId, sites, people, onClose }: {
  client: SupabaseClient; scope: KnowledgeScope; documentId: string
  sites: Array<{ id: string; name: string }>; people: Array<{ id: string; full_name: string }>; onClose: () => void
}) {
  const detail = useKnowledgeDocument(client, scope, documentId)
  const [panel, setPanel] = useState<Panel>(null)
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState('')
  const action = useKnowledgeMutation(scope.organizationId, async (run: () => Promise<unknown>) => run())
  const names = new Map(people.map((person) => [person.id, person.full_name]))
  const siteNames = new Map(sites.map((site) => [site.id, site.name]))

  if (detail.isPending) return <div className="workspace-panel" role="status">Loading document...</div>
  if (detail.isError) return <div className="auth-message error" role="alert">{errorMessage(detail.error)}</div>

  const { document, versions, capabilities } = detail.data
  const latest = versions[0] ?? null
  const current = currentKnowledgeVersion(versions)
  const newer = latest && latest.id !== current?.id ? latest : null
  // Workflow state only narrows which server-authorized actions are offered; the server still enforces each one.
  const canEdit = capabilities.canManage && document.lifecycle_status === 'active'
  const perform = (message: string | ((result: unknown) => string), run: () => Promise<unknown>) => {
    setNotice('')
    action.mutate(run, { onSuccess: (result) => { setNotice(typeof message === 'function' ? message(result) : message); setPanel(null); setReason('') } })
  }

  return <Card>
    <CardHeader className="gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><CardTitle className="break-words">{current?.title ?? 'Untitled document'}</CardTitle>
          <p className="text-sm text-[var(--muted)]">{document.lifecycle_status === 'archived' ? `Archived ${document.archived_at?.slice(0, 10) ?? ''}` : 'Active'}
            {current && ` · ${formatLabel(current.document_type)} · v${current.version_number}`}</p>
          {newer && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <span>Newer version: v{newer.version_number}</span><StatusBadge status={newer.approval_status} />
          </div>}</div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close document detail"><X aria-hidden="true" /></Button>
      </div>
      {capabilities.canManage && <div className="flex flex-wrap gap-2">
        {canEdit && <Button size="sm" variant="outline" onClick={() => { setPanel({ kind: 'version' }); action.reset() }}><FilePlus2 aria-hidden="true" />New version</Button>}
        {document.lifecycle_status === 'active'
          ? <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => window.confirm('Archive this document? Drafts will be frozen until it is restored.')
            && perform('Document archived.', () => knowledgeActions.archive(client, document.id))}><Archive aria-hidden="true" />Archive</Button>
          : <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => perform('Document restored.', () => knowledgeActions.restore(client, document.id))}>
            <ArchiveRestore aria-hidden="true" />Restore</Button>}
      </div>}
    </CardHeader>
    <CardContent className="grid gap-5">
      {notice && <div className="auth-message success" role="status">{notice}</div>}
      {action.isError && <div className="auth-message error" role="alert">{errorMessage(action.error)}</div>}

      {current && <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div><dt className="text-xs text-[var(--muted)]">Owner</dt><dd className="text-sm">{names.get(current.owner_id) ?? 'Unknown'}</dd></div>
        <div><dt className="text-xs text-[var(--muted)]">Current status</dt><dd><StatusBadge status={current.approval_status} /></dd></div>
        <div><dt className="text-xs text-[var(--muted)]">Access</dt><dd className="text-sm">{formatLabel(current.access_scope)} · {formatLabel(current.confidentiality)}</dd></div>
        <DateLine label="Effective" value={current.effective_date} />
        <DateLine label="Review" value={current.review_date} warnWhenPast />
        <DateLine label="Expiry" value={current.expiry_date} warnWhenPast />
        <div><dt className="text-xs text-[var(--muted)]">Site</dt><dd className="text-sm">{current.site_id ? siteNames.get(current.site_id) ?? 'Restricted site' : 'All sites'}</dd></div>
        <div><dt className="text-xs text-[var(--muted)]">Department</dt><dd className="text-sm">{current.department ?? '—'}</dd></div>
        {current.description && <div className="col-span-full"><dt className="text-xs text-[var(--muted)]">Description</dt><dd className="whitespace-pre-wrap text-sm">{current.description}</dd></div>}
      </dl>}

      {panel?.kind === 'version' && <div className="rounded-2xl border border-[var(--line)] p-4"><h4 className="mb-3 font-semibold">Upload a new version</h4>
        <p className="mb-3 text-xs text-[var(--muted)]">Earlier versions are preserved. The new version starts as a draft.</p>
        <KnowledgeMetadataForm mode="version" version={latest} currentUserId={scope.userId} sites={sites} people={people} pending={action.isPending}
          error={action.isError ? errorMessage(action.error) : undefined} onCancel={() => setPanel(null)}
          onSubmit={(metadata, file) => file && perform('New draft version uploaded.', () => uploadKnowledgeVersion(client, { documentId: document.id, metadata, file }))} /></div>}

      {panel?.kind === 'edit' && <div className="rounded-2xl border border-[var(--line)] p-4"><h4 className="mb-3 font-semibold">Edit draft v{panel.version.version_number} metadata</h4>
        <KnowledgeMetadataForm mode="edit" version={panel.version} currentUserId={scope.userId} sites={sites} people={people} pending={action.isPending}
          error={action.isError ? errorMessage(action.error) : undefined} onCancel={() => setPanel(null)}
          onSubmit={(metadata) => perform('Draft metadata saved.', () => knowledgeActions.updateMetadata(client, panel.version.id, metadata))} /></div>}

      {panel?.kind === 'reject' && <form className="grid gap-2 rounded-2xl border border-[var(--line)] p-4" onSubmit={(event) => {
        event.preventDefault()
        if (reason.trim()) perform('Version rejected.', () => knowledgeActions.reject(client, panel.version.id, reason.trim()))
      }}>
        <label className="grid gap-1 text-sm font-semibold">Rejection reason for v{panel.version.version_number} *
          <textarea required maxLength={2000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)}
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm" /></label>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setPanel(null)}>Cancel</Button>
          <Button type="submit" variant="danger" size="sm" disabled={action.isPending || !reason.trim()}>Reject version</Button></div>
      </form>}

      <div><h4 className="mb-2 font-semibold">Version history</h4>
        {versions.length === 0 ? <p className="text-sm text-[var(--muted)]">No versions are visible to you.</p>
          : <ol className="grid gap-2">{versions.map((version) => <VersionItem key={version.id} version={version} document={document}
            canEdit={canEdit} canApprove={capabilities.canApprove && document.lifecycle_status === 'active'} pending={action.isPending}
            onDownload={() => { setNotice(''); action.mutate(() => downloadKnowledgeVersion(client, version)) }}
            onEdit={() => { setPanel({ kind: 'edit', version }); action.reset() }}
            onSubmit={() => perform('Submitted for approval.', () => knowledgeActions.submit(client, version.id))}
            onApprove={() => window.confirm(`Approve v${version.version_number}? It becomes the controlled version.`)
              && perform(String, () => approveAndProcessKnowledgeVersion(client, version.id))}
            onReject={() => { setPanel({ kind: 'reject', version }); setReason(''); action.reset() }}
            onRetryUpload={(file) => perform('File uploaded.', () => retryKnowledgeUpload(client, version, file))} />)}</ol>}
      </div>
    </CardContent>
  </Card>
}

function VersionItem({ version, document, canEdit, canApprove, pending, onDownload, onEdit, onSubmit, onApprove, onReject, onRetryUpload }: {
  version: KnowledgeVersion; document: KnowledgeDocument; canEdit: boolean; canApprove: boolean; pending: boolean
  onDownload: () => void; onEdit: () => void; onSubmit: () => void; onApprove: () => void; onReject: () => void; onRetryUpload: (file: File) => void
}) {
  const draft = version.approval_status === 'draft'
  return <li className="grid gap-2 rounded-xl border border-[var(--line)] p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-semibold">v{version.version_number} · {version.title}</span><StatusBadge status={version.approval_status} />
    </div>
    <p className="text-xs text-[var(--muted)]">{version.original_filename} · {formatFileSize(version.file_size)} · created {version.created_at.slice(0, 10)}
      {version.approved_at && ` · approved ${version.approved_at.slice(0, 10)}`}{version.rejected_at && ` · rejected ${version.rejected_at.slice(0, 10)}`}
      {!version.uploaded_at && ' · file not uploaded'}</p>
    {version.rejection_reason && <p className="text-xs text-red-700">Reason: {version.rejection_reason}</p>}
    <div className="flex flex-wrap gap-2">
      {version.uploaded_at && <Button size="sm" variant="ghost" disabled={pending} onClick={onDownload}><Download aria-hidden="true" />Download</Button>}
      {canEdit && draft && <Button size="sm" variant="ghost" disabled={pending} onClick={onEdit}><Pencil aria-hidden="true" />Edit metadata</Button>}
      {canEdit && draft && !version.uploaded_at && <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-soft)]">
        <Upload size={16} aria-hidden="true" />Upload file<input type="file" hidden accept=".pdf,.doc,.docx,.xlsx,.txt"
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onRetryUpload(file) }} /></label>}
      {canEdit && draft && version.uploaded_at && <Button size="sm" variant="outline" disabled={pending} onClick={onSubmit}><Send aria-hidden="true" />Submit for approval</Button>}
      {canApprove && version.approval_status === 'pending_review' && document.lifecycle_status === 'active' && <>
        <Button size="sm" disabled={pending} onClick={onApprove}><Check aria-hidden="true" />Approve</Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={onReject}><X aria-hidden="true" />Reject</Button></>}
    </div>
  </li>
}
