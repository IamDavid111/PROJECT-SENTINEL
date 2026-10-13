import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  knowledgeAccessScopes, knowledgeConfidentialityLevels, knowledgeDocumentTypes,
  type KnowledgeMetadataPatch, type KnowledgeMimeType, type KnowledgeRequest,
} from '../../../supabase/functions/knowledge-service/contracts'
import { resolveKnowledgeMimeType } from './knowledgeFiles'
export { resolveKnowledgeMimeType } from './knowledgeFiles'

const nullableText = z.string().nullable()
export const knowledgeVersionSchema = z.object({
  id: z.string(),
  document_id: z.string(),
  version_number: z.number(),
  document_type: z.enum(knowledgeDocumentTypes),
  title: z.string(),
  description: nullableText,
  site_id: nullableText,
  department: nullableText,
  owner_id: z.string(),
  effective_date: nullableText,
  review_date: nullableText,
  expiry_date: nullableText,
  approval_status: z.enum(['draft', 'pending_review', 'approved', 'rejected', 'superseded']),
  approved_at: nullableText,
  rejected_at: nullableText,
  rejection_reason: nullableText,
  confidentiality: z.enum(knowledgeConfidentialityLevels),
  access_scope: z.enum(knowledgeAccessScopes),
  original_filename: z.string(),
  mime_type: z.string(),
  file_size: z.number(),
  uploaded_at: nullableText,
  created_at: z.string(),
  updated_at: z.string(),
})
const documentSchema = z.object({
  id: z.string(),
  lifecycle_status: z.enum(['active', 'archived']),
  archived_at: nullableText,
  created_by: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})
// Mirrors the server-resolved permission grants; the server and RLS still authorize every action.
const capabilitiesSchema = z.object({ canManage: z.boolean(), canApprove: z.boolean() })
const errorSchema = z.object({ ok: z.literal(false), requestId: z.string(), error: z.object({ message: z.string() }) })

export type KnowledgeVersion = z.infer<typeof knowledgeVersionSchema>
export type KnowledgeDocument = z.infer<typeof documentSchema>
export type KnowledgeCapabilities = z.infer<typeof capabilitiesSchema>
export type KnowledgeListItem = KnowledgeDocument & { latestVersion: KnowledgeVersion | null; currentVersion: KnowledgeVersion | null }
export type KnowledgeMetadataInput = Omit<Extract<KnowledgeRequest, { action: 'prepare_upload' }>,
  'action' | 'documentId' | 'originalFilename' | 'mimeType' | 'fileSize'>

export class KnowledgeServiceError extends Error {
  readonly requestId?: string
  /** Set when a document was created but its first upload did not finish, so the UI can open it for retry. */
  documentId?: string
  constructor(message: string, requestId?: string) {
    super(message)
    this.name = 'KnowledgeServiceError'
    this.requestId = requestId
  }
}

async function invoke<T>(client: SupabaseClient, body: KnowledgeRequest, schema: z.ZodType<T>): Promise<T> {
  // Only the action payload is sent; the server derives user, organization and role from the session token.
  const { data, error } = await client.functions.invoke<unknown>('knowledge-service', { body })
  let payload: unknown = data
  if (error instanceof FunctionsHttpError) {
    try { payload = await error.context.json() } catch { throw new KnowledgeServiceError('The document service returned an invalid error response.') }
  } else if (error) {
    throw new KnowledgeServiceError('Unable to reach the document service.')
  }
  const failure = errorSchema.safeParse(payload)
  if (failure.success) throw new KnowledgeServiceError(failure.data.error.message, failure.data.requestId)
  const result = schema.safeParse(payload)
  if (!result.success) throw new KnowledgeServiceError('The document service returned an invalid response.')
  return result.data
}

export function listKnowledgeDocuments(client: SupabaseClient) {
  return invoke(client, { action: 'list_documents' }, z.object({
    capabilities: capabilitiesSchema,
    documents: z.array(documentSchema.extend({
      latestVersion: knowledgeVersionSchema.nullable(), currentVersion: knowledgeVersionSchema.nullable(),
    })),
  }))
}

export function getKnowledgeDocument(client: SupabaseClient, documentId: string) {
  return invoke(client, { action: 'get_document', documentId }, z.object({
    capabilities: capabilitiesSchema, document: documentSchema, versions: z.array(knowledgeVersionSchema),
  }))
}

const versionResult = z.object({ version: knowledgeVersionSchema })
const documentResult = z.object({ document: documentSchema })

export const knowledgeActions = {
  updateMetadata: (client: SupabaseClient, versionId: string, patch: KnowledgeMetadataPatch) =>
    invoke(client, { action: 'update_metadata', versionId, patch }, versionResult),
  submit: (client: SupabaseClient, versionId: string) =>
    invoke(client, { action: 'submit_for_approval', versionId }, versionResult),
  approve: (client: SupabaseClient, versionId: string) =>
    invoke(client, { action: 'approve', versionId }, versionResult),
  reject: (client: SupabaseClient, versionId: string, reason: string) =>
    invoke(client, { action: 'reject', versionId, reason }, versionResult),
  archive: (client: SupabaseClient, documentId: string) =>
    invoke(client, { action: 'archive', documentId }, documentResult),
  restore: (client: SupabaseClient, documentId: string) =>
    invoke(client, { action: 'restore', documentId }, documentResult),
}

const processResult = z.object({ ok: z.literal(true), chunksAdded: z.number().int().nonnegative() })

// Approval stays the source of truth; AI processing runs right after it and the server re-checks
// eligibility. A processing failure never undoes the approval, but it is reported to the approver.
export async function approveAndProcessKnowledgeVersion(client: SupabaseClient, versionId: string): Promise<string> {
  await knowledgeActions.approve(client, versionId)
  const { data, error } = await client.functions.invoke<unknown>('knowledge-extraction', { body: { action: 'extract', versionId } })
  let payload: unknown = data
  if (error instanceof FunctionsHttpError) {
    try { payload = await error.context.json() } catch { payload = null }
  }
  if (processResult.safeParse(payload).success) return 'Version approved and processed for AI knowledge.'
  const failure = errorSchema.safeParse(payload)
  const detail = failure.success ? failure.data.error.message : 'The processing service could not be reached.'
  return `Version approved, but AI knowledge processing failed: ${detail}`
}

// The signed URL is built with the function runtime's internal Supabase URL, so upload through the
// browser client using the signed path and token instead of the raw URL.
async function uploadToSignedUrl(client: SupabaseClient, signedUrl: string, file: File, mimeType: KnowledgeMimeType) {
  const url = new URL(signedUrl)
  const marker = '/object/upload/sign/qhse-knowledge/'
  const index = url.pathname.indexOf(marker)
  const token = url.searchParams.get('token')
  if (index < 0 || !token) throw new KnowledgeServiceError('The secure upload authorization is invalid.')
  const path = decodeURIComponent(url.pathname.slice(index + marker.length))
  const typedFile = new File([file], file.name, { type: mimeType })
  const { error } = await client.storage.from('qhse-knowledge').uploadToSignedUrl(path, token, typedFile, { contentType: mimeType })
  if (error) throw new KnowledgeServiceError('The file upload failed. Retry the upload from the document detail.')
}

async function completeUpload(client: SupabaseClient, versionId: string, signedUrl: string, file: File, mimeType: KnowledgeMimeType) {
  await uploadToSignedUrl(client, signedUrl, file, mimeType)
  await invoke(client, { action: 'complete_upload', versionId }, z.object({ versionId: z.string() }))
}

/** Registers a new draft version (creating the document first when needed) and uploads its file. */
export async function uploadKnowledgeVersion(client: SupabaseClient, input: {
  documentId?: string
  metadata: KnowledgeMetadataInput
  file: File
}) {
  const mimeType = resolveKnowledgeMimeType(input.file)
  if (!mimeType) throw new KnowledgeServiceError('Upload a PDF, Word, Excel (.xlsx) or plain-text document.')
  const documentId = input.documentId ?? (await invoke(client, { action: 'create_document' }, documentResult)).document.id
  try {
    const prepared = await invoke(client, {
      action: 'prepare_upload', documentId, ...input.metadata,
      originalFilename: input.file.name, mimeType, fileSize: input.file.size,
    }, versionResult.extend({ uploadUrl: z.string() }))
    await completeUpload(client, prepared.version.id, prepared.uploadUrl, input.file, mimeType)
    return { documentId, versionId: prepared.version.id }
  } catch (error) {
    if (error instanceof KnowledgeServiceError) error.documentId = documentId
    throw error
  }
}

/** Retries the file upload for a registered draft; the server checks the file matches its registered type and size. */
export async function retryKnowledgeUpload(client: SupabaseClient, version: KnowledgeVersion, file: File) {
  const mimeType = resolveKnowledgeMimeType(file)
  if (!mimeType || mimeType !== version.mime_type || file.size !== version.file_size) {
    throw new KnowledgeServiceError(`Select the registered file: ${version.original_filename}.`)
  }
  const { uploadUrl } = await invoke(client, { action: 'upload_url', versionId: version.id }, z.object({ uploadUrl: z.string() }))
  await completeUpload(client, version.id, uploadUrl, file, mimeType)
}

// functions.invoke decodes Office MIME types as text, so download bytes with a direct authenticated fetch.
export async function downloadKnowledgeVersion(client: SupabaseClient, version: KnowledgeVersion) {
  const { data: { session } } = await client.auth.getSession()
  if (!session) throw new KnowledgeServiceError('Sign in again to download this document.')
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/knowledge-service`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'download', versionId: version.id } satisfies KnowledgeRequest),
  })
  if (!response.ok) {
    const failure = errorSchema.safeParse(await response.json().catch(() => null))
    throw new KnowledgeServiceError(failure.success ? failure.data.error.message : 'Unable to download the document.',
      failure.success ? failure.data.requestId : undefined)
  }
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = version.original_filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
