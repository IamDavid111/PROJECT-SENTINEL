import { createClient } from '@supabase/supabase-js'
import { AiAccessError, authenticateOrganization } from '../ai-service/access.ts'
import { ExtractionError, extractDocument, maxSourceBytes } from './extract.ts'
import { IndexingError, indexVersion } from './indexing.ts'

const cors = {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
type Runtime = { env: (name: string) => string | undefined; fetch: typeof fetch; extract: typeof extractDocument }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

export async function handleExtractionRequest(request: Request, runtime: Runtime = {
  env: (name) => Deno.env.get(name), fetch, extract: extractDocument,
}): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const requestId = crypto.randomUUID()
  const fail = (status: number, code: string, message: string) => {
    console.error('Knowledge extraction request failed', { requestId, status, code })
    return json({ ok: false, requestId, error: { code, message } }, status)
  }
  try {
    if (request.method !== 'POST') return fail(405, 'method', 'POST is required.')
    const authorization = request.headers.get('Authorization')
    if (!authorization?.match(/^Bearer\s+\S+$/i)) return fail(401, 'authentication', 'Authentication is required.')
    const url = runtime.env('SUPABASE_URL'), anon = runtime.env('SUPABASE_ANON_KEY'), key = runtime.env('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !anon || !key) return fail(503, 'configuration', 'Extraction service is not configured.')
    const caller = createClient(url, anon, { global: { headers: { Authorization: authorization }, fetch: runtime.fetch },
      auth: { persistSession: false, autoRefreshToken: false } })
    const context = await authenticateOrganization(caller)
    const raw = await request.text()
    if (raw.length > 4096) return fail(413, 'request_limit', 'Request body is too large.')
    let body: unknown
    try { body = JSON.parse(raw) } catch { return fail(400, 'invalid_request', 'A valid JSON request is required.') }
    if (!body || typeof body !== 'object' || !('versionId' in body) || !('action' in body)
      || Object.keys(body).length !== 2 || typeof body.versionId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.versionId)
      || (body.action !== 'extract' && body.action !== 'status' && body.action !== 'index')) {
      return fail(400, 'invalid_request', 'Provide an extraction action and document version ID only.')
    }
    if (body.action === 'status') {
      const { data, error } = await caller.rpc('knowledge_extraction_status', { target_version_id: body.versionId })
      if (error) return fail(503, 'status_unavailable', 'Unable to read extraction status.')
      const { data: indexing, error: indexError } = await caller.rpc('knowledge_indexing_status', { target_version_id: body.versionId })
      if (indexError) return fail(503, 'status_unavailable', 'Unable to read indexing status.')
      // Lifecycle view of the same version: current / scheduled / superseded / expired / archived / not_approved.
      const { data: lifecycle, error: lifecycleError } = await caller.rpc('knowledge_version_ai_status', { target_version_id: body.versionId })
      if (lifecycleError) return fail(503, 'status_unavailable', 'Unable to read knowledge lifecycle status.')
      return json({ ok: true, requestId, processing: data?.[0] ?? null, indexing: indexing ?? [], lifecycle: lifecycle?.[0] ?? null })
    }
    const service = createClient(url, key, { global: { fetch: runtime.fetch }, auth: { persistSession: false, autoRefreshToken: false } })
    const runIndex = async (chunksAdded: number | null) => {
      try {
        const indexed = await indexVersion(caller, service, body.versionId as string, context.organizationId, runtime.env, runtime.fetch)
        return json({ ok: true, requestId, status: 'succeeded', chunksAdded, indexedChunks: indexed.chunks })
      } catch (error) {
        const failure = error instanceof IndexingError ? error : new IndexingError('indexing_failed', 'Document indexing could not be completed.')
        return fail(failure.code === 'claim_denied' ? 409 : 503, failure.code, `${chunksAdded === null ? '' : 'Text was extracted and chunked, but indexing failed: '}${failure.message}`)
      }
    }
    if (body.action === 'index') return await runIndex(null)
    const { data: claims, error: claimError } = await caller.rpc('begin_knowledge_extraction', { target_version_id: body.versionId })
    if (claimError) return fail(claimError.code === '42501' ? 403 : claimError.code === '55P03' || claimError.code === '23514' ? 409 : 503,
      'claim_denied', 'Extraction requires an authorized, currently eligible approval and no active processing attempt.')
    const claim = claims?.[0]
    if (!claim) return fail(503, 'claim_unavailable', 'Unable to start document extraction.')
    let text: string | null = null, hash: string | null = null, failure: ExtractionError | null = null
    try {
      const { data: version, error } = await service.from('knowledge_processing_candidates')
        .select('id,storage_path,mime_type,file_size').eq('id', body.versionId).eq('organization_id', context.organizationId).single()
      if (error || !version) throw new ExtractionError('eligibility_changed', 'Approved document is no longer available for processing.')
      if (version.file_size > maxSourceBytes) throw new ExtractionError('source_limit', 'Extraction supports files no larger than 10 MB.')
      const { data: file, error: storageError } = await service.storage.from('qhse-knowledge').download(version.storage_path)
      if (storageError || !file) throw new ExtractionError('source_unavailable', 'Unable to retrieve the secure original.')
      if (file.size !== version.file_size) throw new ExtractionError('source_mismatch', 'The original does not match its registered size.')
      const bytes = new Uint8Array(await file.arrayBuffer())
      hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map((n) => n.toString(16).padStart(2, '0')).join('')
      text = await runtime.extract(bytes, version.mime_type)
    } catch (error) {
      failure = error instanceof ExtractionError ? error : new ExtractionError('processing_failed', 'Document extraction could not be completed.')
    }
    const { data: status, error: finishError } = await service.rpc('finish_knowledge_extraction', {
      target_id: claim.id, target_attempt: claim.attempt_id, content: text, source_hash: hash,
      failure_code: failure?.code ?? null, failure_message: failure?.message ?? null,
    })
    if (finishError) return fail(503, 'result_not_saved', 'Extraction result could not be saved. Check processing status; stale attempts can be retried after five minutes.')
    if (status !== 'succeeded') return fail(422, failure?.code ?? 'eligibility_changed',
      failure?.message ?? 'Document eligibility or processing authorization changed during extraction.')
    // Chunk with the caller's token so the RPC re-checks manage permission and live eligibility;
    // a chunking failure is reported explicitly and the whole request can be retried.
    const { data: chunks, error: chunkError } = await caller.rpc('chunk_knowledge_document', { target_version_id: body.versionId })
    if (chunkError || typeof chunks !== 'number') return fail(503, 'chunking_failed', 'Text was extracted but could not be chunked. Retry processing.')
    // Approval → extract → chunk → embed runs in one authorized request; never return
    // original paths, file bytes, extracted content or vectors to the browser.
    return await runIndex(chunks)
  } catch (error) {
    if (error instanceof AiAccessError) return fail(error.status, 'access_denied', 'Active authenticated organization access is required.')
    return fail(503, 'service_error', 'Unable to complete the extraction request.')
  }
}
