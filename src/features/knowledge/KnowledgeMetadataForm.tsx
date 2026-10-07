import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import {
  knowledgeAccessScopes, knowledgeConfidentialityLevels, knowledgeDocumentTypes, knowledgeMaxFileSize,
} from '../../../supabase/functions/knowledge-service/contracts'
import { resolveKnowledgeMimeType, type KnowledgeMetadataInput, type KnowledgeVersion } from './knowledgeService'
import { formatLabel, selectClass } from './knowledgeFormat'

const labelClass = 'grid gap-1.5 text-sm font-semibold text-[var(--text)]'
const errorClass = 'text-xs font-medium text-red-600'

const optionalDate = z.union([z.literal(''), z.iso.date()])
// Mirrors the server contract for early feedback only; the knowledge service re-validates every field.
const metadataFormSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(240),
  documentType: z.enum(knowledgeDocumentTypes),
  description: z.string().max(4000),
  siteId: z.string(),
  department: z.string().trim().max(120),
  ownerId: z.string(),
  effectiveDate: optionalDate,
  reviewDate: optionalDate,
  expiryDate: optionalDate,
  confidentiality: z.enum(knowledgeConfidentialityLevels),
  accessScope: z.enum(knowledgeAccessScopes),
}).refine((value) => value.accessScope !== 'site' || value.siteId, {
  path: ['siteId'], message: 'Select a site for site-scoped documents.',
})
type MetadataFormValues = z.infer<typeof metadataFormSchema>

function toFormValues(version?: KnowledgeVersion | null): MetadataFormValues {
  return {
    title: version?.title ?? '',
    documentType: version?.document_type ?? 'procedure',
    description: version?.description ?? '',
    siteId: version?.site_id ?? '',
    department: version?.department ?? '',
    ownerId: version?.owner_id ?? '',
    effectiveDate: version?.effective_date ?? '',
    reviewDate: version?.review_date ?? '',
    expiryDate: version?.expiry_date ?? '',
    confidentiality: version?.confidentiality ?? 'internal',
    accessScope: version?.access_scope ?? 'organization',
  }
}

function toMetadata(values: MetadataFormValues): KnowledgeMetadataInput {
  return {
    title: values.title.trim(),
    documentType: values.documentType,
    description: values.description.trim() || null,
    siteId: values.siteId || null,
    department: values.department.trim() || null,
    // An empty owner lets the server default to the uploading user.
    ...(values.ownerId ? { ownerId: values.ownerId } : {}),
    effectiveDate: values.effectiveDate || null,
    reviewDate: values.reviewDate || null,
    expiryDate: values.expiryDate || null,
    confidentiality: values.confidentiality,
    accessScope: values.accessScope,
  }
}

export function KnowledgeMetadataForm({ mode, version, currentUserId, sites, people, pending, error, onSubmit, onCancel }: {
  mode: 'create' | 'version' | 'edit'
  version?: KnowledgeVersion | null
  currentUserId: string
  sites: Array<{ id: string; name: string }>
  people: Array<{ id: string; full_name: string }>
  pending: boolean
  error?: string
  onSubmit: (metadata: KnowledgeMetadataInput, file: File | null) => void
  onCancel: () => void
}) {
  const defaults = toFormValues(version)
  if (mode !== 'edit' && defaults.ownerId === currentUserId) defaults.ownerId = ''
  const form = useForm<MetadataFormValues>({ resolver: zodResolver(metadataFormSchema), defaultValues: defaults })
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const needsFile = mode !== 'edit'
  const errors = form.formState.errors

  const submit = form.handleSubmit((values) => {
    if (needsFile) {
      if (!file) return setFileError('Select a document file.')
      if (!resolveKnowledgeMimeType(file)) return setFileError('Upload a PDF, Word, Excel (.xlsx) or plain-text document.')
      if (file.size > knowledgeMaxFileSize) return setFileError('Files must be 100 MB or smaller.')
    }
    onSubmit(toMetadata(values), file)
  })

  return <form className="grid gap-4" onSubmit={submit} noValidate>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={`${labelClass} sm:col-span-2`}>Title *<Input {...form.register('title')} />
        {errors.title && <span className={errorClass} role="alert">{errors.title.message}</span>}</label>
      <label className={labelClass}>Document type *<select className={selectClass} {...form.register('documentType')}>
        {knowledgeDocumentTypes.map((type) => <option key={type} value={type}>{formatLabel(type)}</option>)}</select></label>
      <label className={labelClass}>Owner<select className={selectClass} {...form.register('ownerId')}>
        {mode === 'edit' ? <option value="">Keep current owner</option> : <option value="">Me (uploader)</option>}
        {people.filter((person) => mode === 'edit' || person.id !== currentUserId)
          .map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label>
      <label className={`${labelClass} sm:col-span-2`}>Description<textarea rows={3}
        className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
        {...form.register('description')} /></label>
      <label className={labelClass}>Access scope<select className={selectClass} {...form.register('accessScope')}>
        {knowledgeAccessScopes.map((scope) => <option key={scope} value={scope}>{formatLabel(scope)}</option>)}</select></label>
      <label className={labelClass}>Site<select className={selectClass} {...form.register('siteId')}>
        <option value="">All sites</option>
        {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>
        {errors.siteId && <span className={errorClass} role="alert">{errors.siteId.message}</span>}</label>
      <label className={labelClass}>Department<Input {...form.register('department')} /></label>
      <label className={labelClass}>Confidentiality<select className={selectClass} {...form.register('confidentiality')}>
        {knowledgeConfidentialityLevels.map((level) => <option key={level} value={level}>{formatLabel(level)}</option>)}</select></label>
      <label className={labelClass}>Effective date<Input type="date" {...form.register('effectiveDate')} /></label>
      <label className={labelClass}>Review date<Input type="date" {...form.register('reviewDate')} /></label>
      <label className={labelClass}>Expiry date<Input type="date" {...form.register('expiryDate')} /></label>
      {needsFile && <label className={`${labelClass} sm:col-span-2`}>Document file * (PDF, DOC, DOCX, XLSX, TXT; max 100 MB)
        <Input type="file" accept=".pdf,.doc,.docx,.xlsx,.txt" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setFileError('') }} />
        {fileError && <span className={errorClass} role="alert">{fileError}</span>}</label>}
    </div>
    {error && <div className="auth-message error" role="alert">{error}</div>}
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending}>Cancel</Button>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving...' : mode === 'edit' ? 'Save draft metadata' : mode === 'version' ? 'Upload new version' : 'Upload document'}
      </Button>
    </div>
  </form>
}
