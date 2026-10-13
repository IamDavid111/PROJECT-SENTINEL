import { z } from 'zod'

export const knowledgeMimeTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
] as const
export const knowledgeDocumentTypes = [
  'policy', 'procedure', 'safe_work_method', 'risk_assessment',
  'standard', 'guideline', 'form', 'training_material', 'other',
] as const
export const knowledgeConfidentialityLevels = ['internal', 'confidential', 'restricted'] as const
export const knowledgeAccessScopes = ['organization', 'site', 'management'] as const
export const knowledgeMaxFileSize = 104857600

const uuid = z.uuid()
const mimeType = z.enum(knowledgeMimeTypes)
const metadataFields = {
  documentType: z.enum(knowledgeDocumentTypes).optional(),
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().max(4000).nullable().optional(),
  siteId: uuid.nullable().optional(),
  department: z.string().trim().max(120).nullable().optional(),
  ownerId: uuid.optional(),
  effectiveDate: z.iso.date().nullable().optional(),
  reviewDate: z.iso.date().nullable().optional(),
  expiryDate: z.iso.date().nullable().optional(),
  confidentiality: z.enum(knowledgeConfidentialityLevels).optional(),
  accessScope: z.enum(knowledgeAccessScopes).optional(),
}
const metadataPatch = z.object(metadataFields).strict().refine(
  (value) => Object.keys(value).length > 0,
  'At least one metadata field is required.',
)

const managementRequest = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create_document') }).strict(),
  z.object({ action: z.literal('list_documents') }).strict(),
  z.object({ action: z.literal('get_document'), documentId: uuid }).strict(),
  z.object({
    action: z.literal('prepare_upload'),
    documentId: uuid,
    ...metadataFields,
    title: z.string().trim().min(1).max(240),
    documentType: metadataFields.documentType.unwrap(),
    originalFilename: z.string().trim().min(1).max(255),
    mimeType,
    fileSize: z.number().int().positive().max(knowledgeMaxFileSize),
  }).strict(),
  z.object({ action: z.literal('upload_url'), versionId: uuid }).strict(),
  z.object({ action: z.literal('complete_upload'), versionId: uuid }).strict(),
  z.object({ action: z.literal('update_metadata'), versionId: uuid, patch: metadataPatch }).strict(),
  z.object({ action: z.literal('submit_for_approval'), versionId: uuid }).strict(),
  z.object({ action: z.literal('approve'), versionId: uuid }).strict(),
  z.object({
    action: z.literal('reject'),
    versionId: uuid,
    reason: z.string().trim().min(1).max(2000),
  }).strict(),
  z.object({ action: z.literal('archive'), documentId: uuid }).strict(),
  z.object({ action: z.literal('restore'), documentId: uuid }).strict(),
  z.object({ action: z.literal('download'), versionId: uuid }).strict(),
])

export const knowledgeRequestSchema = managementRequest
export type KnowledgeRequest = z.infer<typeof knowledgeRequestSchema>
export type KnowledgeMetadataPatch = z.infer<typeof metadataPatch>
export type KnowledgeMimeType = z.infer<typeof mimeType>

// Resolved in Postgres from the caller's built-in role or administrator-granted custom-role keys.
export const knowledgeCapabilitiesSchema = z.object({
  canView: z.boolean().default(false),
  canManage: z.boolean().default(false),
  canApprove: z.boolean().default(false),
  canViewConfidential: z.boolean().default(false),
  canViewRestricted: z.boolean().default(false),
})
export type KnowledgeCapabilities = z.infer<typeof knowledgeCapabilitiesSchema>

const approvalActions = new Set(['approve', 'reject'])
const readActions = new Set(['list_documents', 'get_document', 'download'])

// Reads are filtered by RLS; every other action needs an explicit manage or approve permission.
export function requiredKnowledgePermission(action: KnowledgeRequest['action']) {
  if (readActions.has(action)) return null
  return approvalActions.has(action) ? 'canApprove' as const : 'canManage' as const
}
