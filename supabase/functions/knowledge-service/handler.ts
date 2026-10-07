import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ZodError } from 'zod'
import { AiAccessError, authenticateOrganization } from '../ai-service/access.ts'
import {
  knowledgeCapabilitiesSchema,
  knowledgeRequestSchema,
  requiredKnowledgePermission,
  type KnowledgeCapabilities,
  type KnowledgeRequest,
} from './contracts.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const versionProjection = 'id,document_id,version_number,document_type,title,description,site_id,department,owner_id,effective_date,review_date,expiry_date,approval_status,approved_by,approved_at,rejected_by,rejected_at,rejection_reason,confidentiality,access_scope,original_filename,mime_type,file_size,uploaded_by,uploaded_at,created_at,updated_at'

const documentProjection = 'id, lifecycle_status, archived_at, created_by, created_at, updated_at'

export type KnowledgeRuntime = {
  env: (name: string) => string | undefined
  fetch: typeof fetch
}

class KnowledgeServiceError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'KnowledgeServiceError'
    this.status = status
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function fail(requestId: string, status: number, message: string) {
  console.error('Knowledge service request failed', { requestId, status })
  return jsonResponse({ ok: false, requestId, error: { message } }, status)
}

function throwDatabaseError(error: unknown, fallback: string): asserts error is null {
  if (!error) return
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code) : ''
  const status = code === '42501' ? 403
    : code === '23514' || code === '23503' || code === '22023' ? 400
    : code === 'PGRST116' ? 404
    : 503
  throw new KnowledgeServiceError(fallback, status)
}

async function loadCapabilities(caller: SupabaseClient): Promise<KnowledgeCapabilities> {
  const { data, error } = await caller.rpc('current_knowledge_capabilities')
  throwDatabaseError(error, 'Unable to verify QHSE document permissions.')
  return knowledgeCapabilitiesSchema.parse(data ?? {})
}

function toDatabaseMetadata(patch: Record<string, unknown>) {
  const names: Record<string, string> = {
    documentType: 'document_type',
    title: 'title',
    description: 'description',
    siteId: 'site_id',
    department: 'department',
    ownerId: 'owner_id',
    effectiveDate: 'effective_date',
    reviewDate: 'review_date',
    expiryDate: 'expiry_date',
    confidentiality: 'confidentiality',
    accessScope: 'access_scope',
  }
  return Object.fromEntries(Object.entries(patch).map(([key, value]) => [names[key], value]))
}

function safeFilename(value: string) {
  return value.replace(/[\r\n"]/g, '_').replace(/[^\x20-\x7e]/g, '_').slice(0, 255) || 'document'
}

async function getServiceClient(
  url: string,
  serviceRoleKey: string,
  runtime: KnowledgeRuntime,
): Promise<SupabaseClient> {
  return createClient(url, serviceRoleKey, {
    global: { fetch: runtime.fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function handleKnowledgeRequest(
  request: Request,
  runtime: KnowledgeRuntime = { env: (name) => Deno.env.get(name), fetch },
): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const requestId = crypto.randomUUID()
  try {
    if (request.method !== 'POST') return fail(requestId, 405, 'POST is required.')
    const authorization = request.headers.get('Authorization')
    if (!authorization?.match(/^Bearer\s+\S+$/i)) {
      return fail(requestId, 401, 'Authentication is required.')
    }

    const url = runtime.env('SUPABASE_URL')
    const anonKey = runtime.env('SUPABASE_ANON_KEY')
    if (!url || !anonKey) return fail(requestId, 503, 'QHSE document service is not configured.')

    // Database reads and writes use the caller token, so RLS remains authoritative.
    const caller = createClient(url, anonKey, {
      global: {
        headers: { Authorization: authorization },
        fetch: runtime.fetch,
      },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const context = await authenticateOrganization(caller)

    const length = Number(request.headers.get('content-length') ?? 0)
    if (length > 64_000) return fail(requestId, 413, 'Request body is too large.')
    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return fail(requestId, 400, 'A valid JSON request body is required.')
    }
    const parsed = knowledgeRequestSchema.safeParse(rawBody)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return fail(requestId, 400, issue?.message ?? 'Invalid QHSE document request.')
    }

    const body = parsed.data
    // Capabilities come from the database for the authenticated caller, never from the request.
    // They gate actions early and act as UI hints; triggers and RLS still decide every write.
    const capabilities = await loadCapabilities(caller)
    const required = requiredKnowledgePermission(body.action)
    if (required && !capabilities[required]) {
      throw new KnowledgeServiceError(required === 'canApprove'
        ? 'You are not authorized to approve QHSE documents.'
        : 'You are not authorized to manage QHSE documents.', 403)
    }

    if (body.action === 'create_document') {
      const { data, error } = await caller.from('knowledge_documents')
        .insert({ organization_id: context.organizationId, created_by: context.userId })
        .select(documentProjection).single()
      throwDatabaseError(error, 'Unable to create the QHSE document.')
      return jsonResponse({ ok: true, requestId, document: data }, 201)
    }

    if (body.action === 'list_documents') {
      const { data, error } = await caller.from('knowledge_documents')
        .select(documentProjection).eq('organization_id', context.organizationId)
        .order('updated_at', { ascending: false }).limit(100)
      throwDatabaseError(error, 'Unable to retrieve QHSE documents.')
      const ids = (data ?? []).map((document) => document.id)
      const latest = new Map<string, unknown>()
      const approved = new Map<string, unknown>()
      if (ids.length) {
        // RLS limits these rows to versions the caller may read, so "latest" is the latest visible version.
        const { data: versions, error: versionError } = await caller.from('knowledge_document_versions')
          .select(versionProjection).eq('organization_id', context.organizationId)
          .in('document_id', ids).order('version_number', { ascending: false })
        throwDatabaseError(versionError, 'Unable to retrieve QHSE document metadata.')
        for (const version of versions ?? []) {
          if (!latest.has(version.document_id)) latest.set(version.document_id, version)
          // Only caller-visible approvals can be the current controlled version.
          if (version.approval_status === 'approved' && !approved.has(version.document_id)) {
            approved.set(version.document_id, version)
          }
        }
      }
      const documents = (data ?? []).map((document) => ({
        ...document, latestVersion: latest.get(document.id) ?? null,
        currentVersion: approved.get(document.id) ?? latest.get(document.id) ?? null,
      }))
      return jsonResponse({ ok: true, requestId, capabilities, documents })
    }

    if (body.action === 'get_document') {
      const { data: document, error: documentError } = await caller.from('knowledge_documents')
        .select(documentProjection).eq('id', body.documentId)
        .eq('organization_id', context.organizationId).single()
      throwDatabaseError(documentError, 'QHSE document is unavailable.')
      const { data: versions, error: versionError } = await caller.from('knowledge_document_versions')
        .select(versionProjection).eq('document_id', body.documentId)
        .eq('organization_id', context.organizationId).order('version_number', { ascending: false })
      throwDatabaseError(versionError, 'Unable to retrieve QHSE document metadata.')
      return jsonResponse({ ok: true, requestId, capabilities, document, versions })
    }

    if (body.action === 'prepare_upload') {
      const { data: document, error: documentError } = await caller.from('knowledge_documents')
        .select('id, lifecycle_status').eq('id', body.documentId)
        .eq('organization_id', context.organizationId).single()
      throwDatabaseError(documentError, 'QHSE document is unavailable.')
      if (document.lifecycle_status !== 'active') {
        throw new KnowledgeServiceError('Archived documents cannot receive new versions.', 409)
      }
      const { data: latest, error: latestError } = await caller.from('knowledge_document_versions')
        .select('version_number').eq('document_id', body.documentId)
        .eq('organization_id', context.organizationId)
        .order('version_number', { ascending: false }).limit(1).maybeSingle()
      throwDatabaseError(latestError, 'Unable to determine the next document version.')

      const versionId = crypto.randomUUID()
      const safeName = body.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${context.organizationId}/${body.documentId}/${versionId}/${safeName}`
      const { data: version, error: insertError } = await caller.from('knowledge_document_versions')
        .insert({
          id: versionId,
          document_id: body.documentId,
          organization_id: context.organizationId,
          version_number: (latest?.version_number ?? 0) + 1,
          document_type: body.documentType,
          title: body.title,
          description: body.description,
          site_id: body.siteId,
          department: body.department,
          owner_id: body.ownerId ?? context.userId,
          effective_date: body.effectiveDate,
          review_date: body.reviewDate,
          expiry_date: body.expiryDate,
          confidentiality: body.confidentiality,
          access_scope: body.accessScope,
          approval_status: 'draft',
          storage_path: storagePath,
          original_filename: body.originalFilename,
          mime_type: body.mimeType,
          file_size: body.fileSize,
        }).select(versionProjection).single()
      throwDatabaseError(insertError, 'Unable to register the QHSE document version.')

      const serviceRoleKey = runtime.env('SUPABASE_SERVICE_ROLE_KEY')
      if (!serviceRoleKey) return fail(requestId, 503, 'Secure document upload is not configured.')
      const service = await getServiceClient(url, serviceRoleKey, runtime)
      const { data: signedUpload, error: signError } = await service.storage
        .from('qhse-knowledge').createSignedUploadUrl(storagePath, { upsert: false })
      throwDatabaseError(signError, 'Unable to authorize a secure document upload.')
      return jsonResponse({
        ok: true, requestId, version,
        uploadUrl: signedUpload.signedUrl,
      }, 201)
    }

    if (body.action === 'upload_url') {
      const { data: version, error } = await caller.from('knowledge_document_versions')
        .select('document_id, storage_path, approval_status, uploaded_at')
        .eq('id', body.versionId).eq('organization_id', context.organizationId).single()
      throwDatabaseError(error, 'QHSE document version is unavailable.')
      if (version.approval_status !== 'draft' || version.uploaded_at) {
        throw new KnowledgeServiceError('This document version is not awaiting upload.', 409)
      }
      const { data: document, error: documentError } = await caller.from('knowledge_documents')
        .select('lifecycle_status').eq('id', version.document_id)
        .eq('organization_id', context.organizationId).single()
      throwDatabaseError(documentError, 'QHSE document is unavailable.')
      if (document.lifecycle_status !== 'active') {
        throw new KnowledgeServiceError('Archived documents cannot receive uploads.', 409)
      }
      const serviceRoleKey = runtime.env('SUPABASE_SERVICE_ROLE_KEY')
      if (!serviceRoleKey) return fail(requestId, 503, 'Secure document upload is not configured.')
      const service = await getServiceClient(url, serviceRoleKey, runtime)
      const { data: signedUpload, error: signError } = await service.storage
        .from('qhse-knowledge').createSignedUploadUrl(version.storage_path, { upsert: false })
      throwDatabaseError(signError, 'Unable to authorize a secure document upload.')
      return jsonResponse({ ok: true, requestId, uploadUrl: signedUpload.signedUrl })
    }

    if (body.action === 'complete_upload') {
      const { data: version, error } = await caller.from('knowledge_document_versions')
        .select('id, document_id, storage_path, mime_type, file_size, approval_status, uploaded_at')
        .eq('id', body.versionId).eq('organization_id', context.organizationId).single()
      throwDatabaseError(error, 'QHSE document version is unavailable.')
      if (version.approval_status !== 'draft') {
        throw new KnowledgeServiceError('Only a draft version can complete upload.', 409)
      }
      if (version.uploaded_at) return jsonResponse({ ok: true, requestId, versionId: version.id })
      const { data: document, error: documentError } = await caller.from('knowledge_documents')
        .select('lifecycle_status').eq('id', version.document_id)
        .eq('organization_id', context.organizationId).single()
      throwDatabaseError(documentError, 'QHSE document is unavailable.')
      if (document.lifecycle_status !== 'active') {
        throw new KnowledgeServiceError('Archived documents cannot complete uploads.', 409)
      }

      const serviceRoleKey = runtime.env('SUPABASE_SERVICE_ROLE_KEY')
      if (!serviceRoleKey) return fail(requestId, 503, 'Secure document upload is not configured.')
      const service = await getServiceClient(url, serviceRoleKey, runtime)
      const pathParts = version.storage_path.split('/')
      const objectName = pathParts.pop()
      const { data: objects, error: listError } = await service.storage.from('qhse-knowledge')
        .list(pathParts.join('/'), { search: objectName, limit: 10 })
      throwDatabaseError(listError, 'Unable to verify the uploaded document.')
      const object = objects?.find((entry) => entry.name === objectName)
      if (!object
        || Number(object.metadata?.size) !== Number(version.file_size)
        || object.metadata?.mimetype !== version.mime_type) {
        throw new KnowledgeServiceError('The uploaded file is missing or does not match its registered type and size.', 409)
      }
      const { error: updateError } = await service.from('knowledge_document_versions')
        .update({ uploaded_at: new Date().toISOString() })
        .eq('id', version.id).eq('organization_id', context.organizationId)
        .eq('approval_status', 'draft').is('uploaded_at', null)
      throwDatabaseError(updateError, 'Unable to complete the document upload.')
      return jsonResponse({ ok: true, requestId, versionId: version.id })
    }

    if (body.action === 'update_metadata') {
      const { data, error } = await caller.from('knowledge_document_versions')
        .update(toDatabaseMetadata(body.patch))
        .eq('id', body.versionId).eq('organization_id', context.organizationId)
        .eq('approval_status', 'draft').select(versionProjection).single()
      throwDatabaseError(error, 'Only draft document metadata can be updated.')
      return jsonResponse({ ok: true, requestId, version: data })
    }

    if (body.action === 'submit_for_approval' || body.action === 'approve' || body.action === 'reject') {
      const targetStatus = body.action === 'submit_for_approval' ? 'pending_review'
        : body.action === 'approve' ? 'approved' : 'rejected'
      const { data, error } = await caller.rpc('transition_knowledge_version', {
        target_version_id: body.versionId, target_status: targetStatus,
        reason: body.action === 'reject' ? body.reason : null,
      })
        .select(versionProjection).single()
      throwDatabaseError(error, `Unable to ${body.action.replaceAll('_', ' ')} the document version.`)
      return jsonResponse({ ok: true, requestId, version: data })
    }

    if (body.action === 'archive' || body.action === 'restore') {
      const lifecycleStatus = body.action === 'archive' ? 'archived' : 'active'
      const { data, error } = await caller.rpc('transition_knowledge_document', {
        target_document_id: body.documentId, target_lifecycle: lifecycleStatus,
      })
        .select(documentProjection).single()
      throwDatabaseError(error, `Unable to ${body.action} the QHSE document.`)
      return jsonResponse({ ok: true, requestId, document: data })
    }

    if (body.action === 'download') {
      const { data: version, error } = await caller.from('knowledge_document_versions')
        .select('storage_path, original_filename, mime_type, file_size, uploaded_at')
        .eq('id', body.versionId).eq('organization_id', context.organizationId).single()
      throwDatabaseError(error, 'QHSE document is unavailable.')
      if (!version.uploaded_at) throw new KnowledgeServiceError('The document file is unavailable.', 404)
      const serviceRoleKey = runtime.env('SUPABASE_SERVICE_ROLE_KEY')
      if (!serviceRoleKey) return fail(requestId, 503, 'Secure document download is not configured.')
      // RLS authorizes the caller-scoped metadata read before the service role fetches bytes.
      const service = await getServiceClient(url, serviceRoleKey, runtime)
      const { data: file, error: downloadError } = await service.storage
        .from('qhse-knowledge').download(version.storage_path)
      throwDatabaseError(downloadError, 'Unable to retrieve the QHSE document.')
      const filename = safeFilename(version.original_filename)
      return new Response(file, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': version.mime_type,
          'Content-Length': String(version.file_size),
          'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(version.original_filename)}`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    return fail(requestId, 400, 'Unsupported QHSE document action.')
  } catch (error) {
    if (error instanceof KnowledgeServiceError) return fail(requestId, error.status, error.message)
    if (error instanceof AiAccessError) {
      return fail(requestId, error.status, error.status === 401
        ? 'Authentication is required.' : error.status === 403
        ? 'Active organization access is required.' : 'Unable to verify organization access.')
    }
    if (error instanceof ZodError) return fail(requestId, 400, 'Invalid QHSE document request.')
    console.error('Knowledge service encountered an internal error', { requestId })
    return fail(requestId, 500, 'Unable to complete the QHSE document request.')
  }
}

export type KnowledgeAction = KnowledgeRequest['action']
