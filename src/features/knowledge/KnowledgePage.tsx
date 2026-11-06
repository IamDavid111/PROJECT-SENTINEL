import type { SupabaseClient } from '@supabase/supabase-js'
import { useMemo, useState, type ReactNode } from 'react'
import { knowledgeDocumentTypes } from '../../../supabase/functions/knowledge-service/contracts'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  FilterBar,
  FormActions,
  Icon,
  MasterDetail,
  PageHeader,
  SearchField,
  Select,
  Skeleton,
  StatusBadge,
  Textarea,
  buttonVariants,
} from '../../components/ui'
import { cn } from '../../lib/utils'
import {
  approveAndProcessKnowledgeVersion, downloadKnowledgeVersion, knowledgeActions, retryKnowledgeUpload, uploadKnowledgeVersion,
  KnowledgeServiceError, type KnowledgeDocument, type KnowledgeListItem, type KnowledgeMetadataInput, type KnowledgeVersion,
} from './knowledgeService'
import { KnowledgeMetadataForm } from './KnowledgeMetadataForm'
import { currentKnowledgeVersion, formatFileSize, formatLabel } from './knowledgeFormat'
import {
  useKnowledgeDirectory, useKnowledgeDocument, useKnowledgeDocuments, useKnowledgeMutation, type KnowledgeScope,
} from './useKnowledge'

const statuses = ['draft', 'pending_review', 'approved', 'rejected', 'superseded'] as const

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.'
const isPast = (date: string | null) => Boolean(date && date < new Date().toISOString().slice(0, 10))

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-[180px] gap-1 text-[11px] font-medium text-muted">
      {label}
      {children}
    </label>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-line sm:border-l sm:pl-5 sm:first:border-l-0 sm:first:pl-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
      <span className="font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</span>
    </div>
  )
}

function DateLine({ label, value, warnWhenPast }: { label: string; value: string | null; warnWhenPast?: boolean }) {
  const overdue = warnWhenPast && isPast(value)
  return <div className="grid gap-0.5">
    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
    <dd className={overdue ? 'text-sm font-semibold text-danger' : 'text-sm text-foreground'}>
      {value ?? '—'}{overdue && ' (past due)'}
    </dd>
  </div>
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
  const allDocuments = useMemo(() => list.data?.documents ?? [], [list.data])

  const create = useKnowledgeMutation(scope.organizationId, (input: { metadata: KnowledgeMetadataInput; file: File }) =>
    uploadKnowledgeVersion(client, input))

  // Client-side filtering over metadata the server already authorized; this is not semantic search or RAG.
  const documents = useMemo(() => {
    const term = search.trim().toLowerCase()
    return allDocuments.filter((document) => {
      const version = document.currentVersion
      if (lifecycleFilter && document.lifecycle_status !== lifecycleFilter) return false
      if (typeFilter && version?.document_type !== typeFilter) return false
      if (statusFilter && version?.approval_status !== statusFilter) return false
      if (!term) return true
      return [version?.title, version?.description, version?.department, version?.original_filename, people.get(version?.owner_id ?? '')]
        .some((value) => value?.toLowerCase().includes(term))
    })
  }, [allDocuments, search, typeFilter, statusFilter, lifecycleFilter, people])

  const resetFilters = () => {
    setSearch('')
    setTypeFilter('')
    setStatusFilter('')
    setLifecycleFilter('active')
  }

  const summaryLoading = list.isPending || list.isError
  const activeCount = allDocuments.filter((document) => document.lifecycle_status === 'active').length
  const pendingCount = allDocuments.filter((document) => document.currentVersion?.approval_status === 'pending_review').length
  const archivedCount = allDocuments.filter((document) => document.lifecycle_status === 'archived').length

  return <div className="grid gap-5">
    <PageHeader
      eyebrow="QHSE knowledge"
      title="QHSE Knowledge"
      description="Controlled policies, procedures and standards with version history and approval."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => void list.refetch()} loading={list.isFetching}>
            <Icon name="refresh" size={15} />
            Refresh
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => { setCreating(true); create.reset() }}>
              <Icon name="upload" size={15} />
              Upload document
            </Button>
          )}
        </>
      }
    />

    <section className="border-y border-line">
      <div className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-4">
        <SummaryStat label="Documents" value={summaryLoading ? '—' : String(allDocuments.length)} />
        <SummaryStat label="Active" value={summaryLoading ? '—' : String(activeCount)} />
        <SummaryStat label="Pending review" value={summaryLoading ? '—' : String(pendingCount)} />
        <SummaryStat label="Archived" value={summaryLoading ? '—' : String(archivedCount)} />
      </div>
    </section>

    <FilterBar
      actions={<Button variant="ghost" size="sm" onClick={resetFilters}>Reset filters</Button>}
    >
      <label className="grid min-w-[240px] flex-1 gap-1 text-[11px] font-medium text-muted">
        Search
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Title, owner, department, file"
          label="Search QHSE documents"
        />
      </label>
      <FilterField label="Document type">
        <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="">All types</option>
          {knowledgeDocumentTypes.map((type) => <option key={type} value={type}>{formatLabel(type)}</option>)}
        </Select>
      </FilterField>
      <FilterField label="Status">
        <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">All statuses</option>
          {statuses.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
        </Select>
      </FilterField>
      <FilterField label="Lifecycle">
        <Select
          value={lifecycleFilter}
          onChange={(event) => setLifecycleFilter(event.target.value as typeof lifecycleFilter)}
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="">All</option>
        </Select>
      </FilterField>
    </FilterBar>

    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">Document library</h2>
        <p className="text-sm text-muted">{documents.length} of {allDocuments.length} documents</p>
      </div>
    </div>

    <MasterDetail
      masterClassName="grid content-start gap-3"
      master={
        <section aria-label="QHSE document list" className="grid gap-3">
          {list.isPending && Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
          {list.isError && (
            <Alert tone="danger">
              {errorMessage(list.error)}
              {list.error instanceof KnowledgeServiceError && list.error.requestId && <small> Reference: {list.error.requestId}</small>}
            </Alert>
          )}
          {!list.isPending && !list.isError && documents.length === 0 && (
            <EmptyState
              icon="fileSearch"
              title={allDocuments.length === 0 ? 'No QHSE documents yet' : 'No documents match these filters'}
              description={allDocuments.length === 0
                ? 'Controlled documents you can access will appear here.'
                : 'Try a different type, status, lifecycle, or search term.'}
              action={allDocuments.length === 0 && canManage
                ? <Button size="sm" onClick={() => { setCreating(true); create.reset() }}><Icon name="upload" size={15} />Upload document</Button>
                : allDocuments.length > 0 ? <Button variant="outline" size="sm" onClick={resetFilters}>Reset filters</Button> : undefined}
            />
          )}
          {!list.isPending && !list.isError && documents.map((document) => (
            <DocumentRow
              key={document.id}
              document={document}
              owner={people.get(document.currentVersion?.owner_id ?? '')}
              selected={document.id === selectedId}
              onSelect={() => setSelectedId(document.id)}
            />
          ))}
        </section>
      }
      detail={
        <section aria-label="Document detail">
          {selectedId ? (
            <DocumentDetail
              key={selectedId}
              client={client}
              scope={scope}
              documentId={selectedId}
              sites={directory.data?.sites ?? []}
              activeSites={directory.data?.activeSites ?? []}
              people={directory.data?.people ?? []}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <EmptyState
              icon="fileSearch"
              title="Select a document"
              description="Choose a document to view its details, metadata and version history."
            />
          )}
        </section>
      }
    />

    <Dialog
      open={creating}
      onClose={() => setCreating(false)}
      title="Upload a new QHSE document"
      description="The first version starts as a draft until it is submitted and approved."
      className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"
    >
      <KnowledgeMetadataForm
        mode="create"
        currentUserId={scope.userId}
        sites={directory.data?.activeSites ?? []}
        people={directory.data?.people ?? []}
        pending={create.isPending}
        error={create.error ? errorMessage(create.error) : undefined}
        onCancel={() => setCreating(false)}
        onSubmit={(metadata, file) => file && create.mutate({ metadata, file }, {
          onSuccess: (result) => { setCreating(false); setSelectedId(result.documentId) },
          onError: (error) => { if (error instanceof KnowledgeServiceError && error.documentId) setSelectedId(error.documentId) },
        })}
      />
    </Dialog>
  </div>
}

function DocumentRow({ document, owner, selected, onSelect }: { document: KnowledgeListItem; owner?: string; selected: boolean; onSelect: () => void }) {
  const version = document.currentVersion
  const newer = document.latestVersion && document.latestVersion.id !== version?.id ? document.latestVersion : null
  return <button
    type="button"
    onClick={onSelect}
    aria-pressed={selected}
    className={cn(
      'grid w-full gap-2 rounded-card border bg-surface p-4 text-left shadow-card transition-colors hover:border-brand/40',
      selected ? 'border-brand ring-2 ring-brand/15' : 'border-line',
    )}
  >
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
        <Icon name="fileCheck" size={16} className="text-brand" />
        <span className="truncate">{version?.title ?? 'Untitled document (no visible version)'}</span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        {document.lifecycle_status === 'archived' && <StatusBadge status="archived" />}
        {version && <StatusBadge status={version.approval_status} />}
      </span>
    </div>
    {version && <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <span>{formatLabel(version.document_type)}</span><span>v{version.version_number}</span>
      <span>Owner: {owner ?? 'Unknown'}</span>
      {version.review_date && <span className={isPast(version.review_date) ? 'font-semibold text-danger' : ''}>Review: {version.review_date}</span>}
      {version.expiry_date && <span className={isPast(version.expiry_date) ? 'font-semibold text-danger' : ''}>Expires: {version.expiry_date}</span>}
    </div>}
    {newer && <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <span>Newer version: v{newer.version_number}</span><StatusBadge status={newer.approval_status} />
    </div>}
  </button>
}

type Panel = { kind: 'version' } | { kind: 'edit'; version: KnowledgeVersion } | { kind: 'reject'; version: KnowledgeVersion } | null
type ConfirmAction = { kind: 'archive' } | { kind: 'approve'; version: KnowledgeVersion } | null

function DocumentDetail({ client, scope, documentId, sites, activeSites, people, onClose }: {
  client: SupabaseClient; scope: KnowledgeScope; documentId: string
  sites: Array<{ id: string; name: string }>; activeSites: Array<{ id: string; name: string }>
  people: Array<{ id: string; full_name: string }>; onClose: () => void
}) {
  const detail = useKnowledgeDocument(client, scope, documentId)
  const [panel, setPanel] = useState<Panel>(null)
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const action = useKnowledgeMutation(scope.organizationId, async (run: () => Promise<unknown>) => run())
  const names = new Map(people.map((person) => [person.id, person.full_name]))
  const siteNames = new Map(sites.map((site) => [site.id, site.name]))
  const sitesForVersion = (version: KnowledgeVersion | null) => [
    ...activeSites,
    ...sites.filter((site) => site.id === version?.site_id && !activeSites.some((activeSite) => activeSite.id === site.id)),
  ]
  const inactiveSiteIds = sites.filter((site) => !activeSites.some((activeSite) => activeSite.id === site.id)).map((site) => site.id)

  if (detail.isPending) return <Card><CardContent className="pt-6"><Skeleton className="h-56 w-full" /></CardContent></Card>
  if (detail.isError) return <Alert tone="danger">{errorMessage(detail.error)}</Alert>

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
  const runConfirm = () => {
    if (!confirmAction) return
    if (confirmAction.kind === 'archive') {
      setConfirmAction(null)
      perform('Document archived.', () => knowledgeActions.archive(client, document.id))
      return
    }
    const version = confirmAction.version
    setConfirmAction(null)
    perform(String, () => approveAndProcessKnowledgeVersion(client, version.id))
  }

  return <>
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="break-words">{current?.title ?? 'Untitled document'}</CardTitle>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              <StatusBadge status={document.lifecycle_status} />
              {document.lifecycle_status === 'archived' && document.archived_at && <span>Archived {document.archived_at.slice(0, 10)}</span>}
              {current && <span>{formatLabel(current.document_type)} · v{current.version_number}</span>}
            </div>
            {newer && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>Newer version: v{newer.version_number}</span><StatusBadge status={newer.approval_status} />
            </div>}
          </div>
          <Button variant="ghost" size="icon" aria-label="Close document detail" onClick={onClose}>
            <Icon name="close" size={17} />
          </Button>
        </div>
        {capabilities.canManage && <div className="flex flex-wrap gap-2">
          {canEdit && <Button size="sm" variant="outline" onClick={() => { setPanel({ kind: 'version' }); action.reset() }}><Icon name="fileAdd" size={15} />New version</Button>}
          {document.lifecycle_status === 'active'
            ? <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => setConfirmAction({ kind: 'archive' })}><Icon name="archive" size={15} />Archive</Button>
            : <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => perform('Document restored.', () => knowledgeActions.restore(client, document.id))}>
              <Icon name="archiveRestore" size={15} />Restore
            </Button>}
        </div>}
      </CardHeader>
      <CardContent className="grid gap-5">
        {notice && <Alert tone="success">{notice}</Alert>}
        {action.isError && <Alert tone="danger">{errorMessage(action.error)}</Alert>}

        {current && <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="grid gap-0.5"><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Owner</dt><dd className="text-sm text-foreground">{names.get(current.owner_id) ?? 'Unknown'}</dd></div>
          <div className="grid gap-0.5"><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Current status</dt><dd><StatusBadge status={current.approval_status} /></dd></div>
          <div className="grid gap-0.5"><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Access</dt><dd className="text-sm text-foreground">{formatLabel(current.access_scope)} · {formatLabel(current.confidentiality)}</dd></div>
          <DateLine label="Effective" value={current.effective_date} />
          <DateLine label="Review" value={current.review_date} warnWhenPast />
          <DateLine label="Expiry" value={current.expiry_date} warnWhenPast />
          <div className="grid gap-0.5"><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Site</dt><dd className="text-sm text-foreground">{current.site_id ? siteNames.get(current.site_id) ?? 'Restricted site' : 'All sites'}</dd></div>
          <div className="grid gap-0.5"><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Department</dt><dd className="text-sm text-foreground">{current.department ?? '—'}</dd></div>
          {current.description && <div className="col-span-full grid gap-0.5"><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Description</dt><dd className="whitespace-pre-wrap text-sm text-foreground">{current.description}</dd></div>}
        </dl>}

        {panel?.kind === 'version' && <div className="rounded-xl border border-line bg-surface-soft/40 p-4">
          <h3 className="font-display text-base font-semibold text-foreground">Upload a new version</h3>
          <p className="mt-1 text-xs text-muted">Earlier versions are preserved. The new version starts as a draft.</p>
          <div className="mt-4">
            <KnowledgeMetadataForm mode="version" version={latest} currentUserId={scope.userId} sites={sitesForVersion(latest)} inactiveSiteIds={inactiveSiteIds} people={people} pending={action.isPending}
              error={action.isError ? errorMessage(action.error) : undefined} onCancel={() => setPanel(null)}
              onSubmit={(metadata, file) => file && perform('New draft version uploaded.', () => uploadKnowledgeVersion(client, { documentId: document.id, metadata, file }))} />
          </div>
        </div>}

        {panel?.kind === 'edit' && <div className="rounded-xl border border-line bg-surface-soft/40 p-4">
          <h3 className="font-display text-base font-semibold text-foreground">Edit draft v{panel.version.version_number} metadata</h3>
          <div className="mt-4">
            <KnowledgeMetadataForm mode="edit" version={panel.version} currentUserId={scope.userId} sites={sitesForVersion(panel.version)} inactiveSiteIds={inactiveSiteIds} people={people} pending={action.isPending}
              error={action.isError ? errorMessage(action.error) : undefined} onCancel={() => setPanel(null)}
              onSubmit={(metadata) => perform('Draft metadata saved.', () => knowledgeActions.updateMetadata(client, panel.version.id, metadata))} />
          </div>
        </div>}

        {panel?.kind === 'reject' && <form className="grid gap-3 rounded-xl border border-line bg-surface-soft/40 p-4" onSubmit={(event) => {
          event.preventDefault()
          if (reason.trim()) perform('Version rejected.', () => knowledgeActions.reject(client, panel.version.id, reason.trim()))
        }}>
          <Field label={`Rejection reason for v${panel.version.version_number}`} htmlFor="knowledge-rejection-reason" required>
            <Textarea id="knowledge-rejection-reason" required maxLength={2000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <FormActions>
            <Button type="button" variant="outline" size="sm" onClick={() => setPanel(null)}>Cancel</Button>
            <Button type="submit" variant="danger" size="sm" disabled={action.isPending || !reason.trim()}>Reject version</Button>
          </FormActions>
        </form>}

        <div>
          <h3 className="font-display text-base font-semibold text-foreground">Version history</h3>
          {versions.length === 0 ? <p className="mt-1 text-sm text-muted">No versions are visible to you.</p>
            : <ol className="mt-3 grid gap-3">{versions.map((version) => <VersionItem key={version.id} version={version} document={document}
              canEdit={canEdit} canApprove={capabilities.canApprove && document.lifecycle_status === 'active'} pending={action.isPending}
              onDownload={() => { setNotice(''); action.mutate(() => downloadKnowledgeVersion(client, version)) }}
              onEdit={() => { setPanel({ kind: 'edit', version }); action.reset() }}
              onSubmit={() => perform('Submitted for approval.', () => knowledgeActions.submit(client, version.id))}
              onApprove={() => setConfirmAction({ kind: 'approve', version })}
              onReject={() => { setPanel({ kind: 'reject', version }); setReason(''); action.reset() }}
              onRetryUpload={(file) => perform('File uploaded.', () => retryKnowledgeUpload(client, version, file))} />)}</ol>}
        </div>
      </CardContent>
    </Card>

    <ConfirmDialog
      open={Boolean(confirmAction)}
      onClose={() => setConfirmAction(null)}
      onConfirm={runConfirm}
      title={confirmAction?.kind === 'archive' ? 'Archive document' : `Approve v${confirmAction?.kind === 'approve' ? confirmAction.version.version_number : ''}?`}
      description={confirmAction?.kind === 'archive'
        ? 'Drafts will be frozen until the document is restored.'
        : 'This version becomes the controlled version for the document.'}
      confirmLabel={confirmAction?.kind === 'archive' ? 'Archive document' : 'Approve version'}
      tone={confirmAction?.kind === 'archive' ? 'danger' : 'default'}
      loading={action.isPending}
    />
  </>
}

function VersionItem({ version, document, canEdit, canApprove, pending, onDownload, onEdit, onSubmit, onApprove, onReject, onRetryUpload }: {
  version: KnowledgeVersion; document: KnowledgeDocument; canEdit: boolean; canApprove: boolean; pending: boolean
  onDownload: () => void; onEdit: () => void; onSubmit: () => void; onApprove: () => void; onReject: () => void; onRetryUpload: (file: File) => void
}) {
  const draft = version.approval_status === 'draft'
  return <li className="grid gap-2 rounded-xl border border-line bg-surface p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-semibold text-foreground">v{version.version_number} · {version.title}</span><StatusBadge status={version.approval_status} />
    </div>
    <p className="text-xs text-muted">{version.original_filename} · {formatFileSize(version.file_size)} · created {version.created_at.slice(0, 10)}
      {version.approved_at && ` · approved ${version.approved_at.slice(0, 10)}`}{version.rejected_at && ` · rejected ${version.rejected_at.slice(0, 10)}`}
      {!version.uploaded_at && ' · file not uploaded'}</p>
    {version.rejection_reason && <p className="text-xs text-danger">Reason: {version.rejection_reason}</p>}
    <div className="flex flex-wrap gap-2">
      {version.uploaded_at && <Button size="sm" variant="ghost" disabled={pending} onClick={onDownload}><Icon name="download" size={14} />Download</Button>}
      {canEdit && draft && <Button size="sm" variant="ghost" disabled={pending} onClick={onEdit}><Icon name="edit" size={14} />Edit metadata</Button>}
      {canEdit && draft && !version.uploaded_at && <label className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        <Icon name="upload" size={14} />Upload file
        <input type="file" hidden accept=".pdf,.doc,.docx,.xlsx,.txt" onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onRetryUpload(file)
        }} />
      </label>}
      {canEdit && draft && version.uploaded_at && <Button size="sm" variant="outline" disabled={pending} onClick={onSubmit}><Icon name="check" size={14} />Submit for approval</Button>}
      {canApprove && version.approval_status === 'pending_review' && document.lifecycle_status === 'active' && <>
        <Button size="sm" disabled={pending} onClick={onApprove}><Icon name="check" size={14} />Approve</Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={onReject}><Icon name="close" size={14} />Reject</Button></>}
    </div>
  </li>
}
