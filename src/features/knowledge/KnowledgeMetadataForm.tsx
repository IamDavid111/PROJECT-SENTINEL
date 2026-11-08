import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Alert, Button, Field, FileUpload, FormActions, FormFull, FormGrid, Input, Select, Textarea } from '../../components/ui'
import type { FileUploadItem } from '../../components/ui'
import {
  knowledgeAccessScopes, knowledgeConfidentialityLevels, knowledgeDocumentTypes, knowledgeMaxFileSize,
} from '../../../supabase/functions/knowledge-service/contracts'
import { resolveKnowledgeMimeType, type KnowledgeMetadataInput, type KnowledgeVersion } from './knowledgeService'
import { formatLabel } from './knowledgeFormat'

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

export function KnowledgeMetadataForm({ mode, version, currentUserId, sites, people, inactiveSiteIds = [], pending, error, onSubmit, onCancel }: {
  mode: 'create' | 'version' | 'edit'
  version?: KnowledgeVersion | null
  currentUserId: string
  sites: Array<{ id: string; name: string }>
  people: Array<{ id: string; full_name: string }>
  inactiveSiteIds?: string[]
  pending: boolean
  error?: string
  onSubmit: (metadata: KnowledgeMetadataInput, file: File | null) => void
  onCancel: () => void
}) {
  const idPrefix = useId()
  const defaults = toFormValues(version)
  if (mode !== 'edit' && defaults.ownerId === currentUserId) defaults.ownerId = ''
  const form = useForm<MetadataFormValues>({ resolver: zodResolver(metadataFormSchema), defaultValues: defaults })
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const needsFile = mode !== 'edit'
  const errors = form.formState.errors
  const files: FileUploadItem[] = file
    ? [{ id: 'knowledge-document-file', name: file.name, size: file.size, type: file.type }]
    : []

  const submit = form.handleSubmit((values) => {
    if (needsFile) {
      if (!file) return setFileError('Select a document file.')
      if (!resolveKnowledgeMimeType(file)) return setFileError('Upload a PDF, Word, Excel (.xlsx) or plain-text document.')
      if (file.size > knowledgeMaxFileSize) return setFileError('Files must be 100 MB or smaller.')
    }
    onSubmit(toMetadata(values), file)
  })

  return <form className="grid gap-5" onSubmit={submit} noValidate>
    <FormGrid>
      <FormFull>
        <Field label="Title" htmlFor={`${idPrefix}-title`} required error={errors.title?.message}>
          <Input id={`${idPrefix}-title`} {...form.register('title')} />
        </Field>
      </FormFull>
      <Field label="Document type" htmlFor={`${idPrefix}-type`} required>
        <Select id={`${idPrefix}-type`} {...form.register('documentType')}>
          {knowledgeDocumentTypes.map((type) => <option key={type} value={type}>{formatLabel(type)}</option>)}
        </Select>
      </Field>
      <Field label="Owner" htmlFor={`${idPrefix}-owner`}>
        <Select id={`${idPrefix}-owner`} {...form.register('ownerId')}>
          {mode === 'edit' ? <option value="">Keep current owner</option> : <option value="">Me (uploader)</option>}
          {people.filter((person) => mode === 'edit' || person.id !== currentUserId)
            .map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
        </Select>
      </Field>
      <FormFull>
        <Field label="Description" htmlFor={`${idPrefix}-description`}>
          <Textarea id={`${idPrefix}-description`} rows={3} {...form.register('description')} />
        </Field>
      </FormFull>
      <Field label="Access scope" htmlFor={`${idPrefix}-scope`} required>
        <Select id={`${idPrefix}-scope`} {...form.register('accessScope')}>
          {knowledgeAccessScopes.map((scope) => <option key={scope} value={scope}>{formatLabel(scope)}</option>)}
        </Select>
      </Field>
      <Field label="Site" htmlFor={`${idPrefix}-site`} error={errors.siteId?.message}>
        <Select id={`${idPrefix}-site`} {...form.register('siteId')}>
          <option value="">All sites</option>
          {sites.map((site) => <option key={site.id} value={site.id} disabled={inactiveSiteIds.includes(site.id)}>{site.name}</option>)}
        </Select>
      </Field>
      <Field label="Department" htmlFor={`${idPrefix}-department`}>
        <Input id={`${idPrefix}-department`} {...form.register('department')} />
      </Field>
      <Field label="Confidentiality" htmlFor={`${idPrefix}-confidentiality`} required>
        <Select id={`${idPrefix}-confidentiality`} {...form.register('confidentiality')}>
          {knowledgeConfidentialityLevels.map((level) => <option key={level} value={level}>{formatLabel(level)}</option>)}
        </Select>
      </Field>
      <Field label="Effective date" htmlFor={`${idPrefix}-effective`}>
        <Input id={`${idPrefix}-effective`} type="date" {...form.register('effectiveDate')} />
      </Field>
      <Field label="Review date" htmlFor={`${idPrefix}-review`}>
        <Input id={`${idPrefix}-review`} type="date" {...form.register('reviewDate')} />
      </Field>
      <Field label="Expiry date" htmlFor={`${idPrefix}-expiry`}>
        <Input id={`${idPrefix}-expiry`} type="date" {...form.register('expiryDate')} />
      </Field>
      {needsFile && <FormFull>
        <Field
          label="Document file"
          required
          hint="PDF, DOC, DOCX, XLSX, or TXT up to 100 MB."
          error={fileError}
        >
          <FileUpload
            files={files}
            onFilesSelected={(selected) => { setFile(selected[0] ?? null); setFileError('') }}
            onRemove={() => { setFile(null); setFileError('') }}
            accept=".pdf,.doc,.docx,.xlsx,.txt"
            maxSizeMb={100}
            variant="compact"
            label="Attach a document"
            disabled={pending}
          />
        </Field>
      </FormFull>}
    </FormGrid>
    {error && <Alert tone="danger">{error}</Alert>}
    <FormActions>
      <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending}>Cancel</Button>
      <Button type="submit" size="sm" loading={pending}>
        {pending ? 'Saving...' : mode === 'edit' ? 'Save draft metadata' : mode === 'version' ? 'Upload new version' : 'Upload document'}
      </Button>
    </FormActions>
  </form>
}
