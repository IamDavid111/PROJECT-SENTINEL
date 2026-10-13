import { createClient } from '@supabase/supabase-js'
import { AiAccessError, authenticateOrganization } from '../ai-service/access.ts'
import { embed, embeddingModel, IndexingError } from '../knowledge-extraction/indexing.ts'
import { type CitationRow, resolveCitations, toCitation } from './citations.ts'

const cors = {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
type Runtime = { env: (name: string) => string | undefined; fetch: typeof fetch }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const allowed = new Set(['query', 'siteId', 'department', 'documentIds', 'limit'])

type Row = CitationRow & { site_id: string | null; department: string | null; similarity: number }

// Retrieval only: query → server-side embedding → permission-filtered vector search.
// No model answer is generated here; results are citation-ready chunks for a later RAG step.
export async function handleSearchRequest(request: Request, runtime: Runtime = {
  env: (name) => Deno.env.get(name), fetch,
}): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const requestId = crypto.randomUUID()
  const fail = (status: number, code: string, message: string) => {
    console.error('Knowledge search request failed', { requestId, status, code })
    return json({ ok: false, requestId, error: { code, message } }, status)
  }
  try {
    if (request.method !== 'POST') return fail(405, 'method', 'POST is required.')
    const authorization = request.headers.get('Authorization')
    if (!authorization?.match(/^Bearer\s+\S+$/i)) return fail(401, 'authentication', 'Authentication is required.')
    const url = runtime.env('SUPABASE_URL'), anon = runtime.env('SUPABASE_ANON_KEY')
    if (!url || !anon) return fail(503, 'configuration', 'Search service is not configured.')
    // The caller's JWT (not the service role) runs the search RPC, so the database derives the
    // organization and applies RBAC/scope from auth.uid(); client IDs are never trusted.
    const caller = createClient(url, anon, { global: { headers: { Authorization: authorization }, fetch: runtime.fetch },
      auth: { persistSession: false, autoRefreshToken: false } })
    await authenticateOrganization(caller)
    const raw = await request.text()
    if (raw.length > 8192) return fail(413, 'request_limit', 'Request body is too large.')
    let body: Record<string, unknown>
    try { body = JSON.parse(raw) } catch { return fail(400, 'invalid_request', 'A valid JSON request is required.') }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'invalid_request', 'A JSON object is required.')
    if ('chunkIds' in body) {
      const ids = body.chunkIds
      if (Object.keys(body).length !== 1 || !Array.isArray(ids) || ids.length < 1 || ids.length > 50
        || !ids.every((id) => typeof id === 'string' && uuid.test(id))) {
        return fail(400, 'invalid_request', 'Provide 1–50 chunk IDs only.')
      }
      try { return json({ ok: true, requestId, citations: await resolveCitations(caller, ids as string[]) }) } catch {
        return fail(503, 'citation_unavailable', 'Citations could not be resolved.')
      }
    }
    const query = typeof body.query === 'string' ? body.query.trim() : ''
    const limit = body.limit ?? 8
    const { siteId, department, documentIds } = body
    if (Object.keys(body).some((k) => !allowed.has(k)) || query.length < 2 || query.length > 1000
      || typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 20
      || (siteId != null && (typeof siteId !== 'string' || !uuid.test(siteId)))
      || (department != null && (typeof department !== 'string' || department.length > 120))
      || (documentIds != null && (!Array.isArray(documentIds) || documentIds.length > 50
        || !documentIds.every((id) => typeof id === 'string' && uuid.test(id))))) {
      return fail(400, 'invalid_request', 'Provide a 2–1000 character query and optional valid site, department, document and limit filters.')
    }
    const model = embeddingModel(runtime.env)
    let vector: number[]
    try { [vector] = await embed(runtime.env, runtime.fetch, model, [query]) } catch (error) {
      const failure = error instanceof IndexingError ? error : new IndexingError('embedding_failed', 'Query embedding failed.')
      return fail(503, failure.code, failure.message)
    }
    const { data, error } = await caller.rpc('search_knowledge', {
      query_embedding: `[${vector.join(',')}]`, target_model: model, match_count: limit,
      filter_site_id: siteId ?? null, filter_department: department ?? null, filter_document_ids: documentIds ?? null,
    })
    if (error) return fail(error.code === '42501' ? 403 : 503, 'search_unavailable', 'Knowledge search could not be completed.')
    const results = ((data ?? []) as Row[]).map((r, rank) => ({
      rank: rank + 1, similarity: r.similarity, citation: toCitation(r),
      scope: { siteId: r.site_id, department: r.department },
    }))
    return json({ ok: true, requestId, model, results })
  } catch (error) {
    if (error instanceof AiAccessError) return fail(error.status, 'access_denied', 'Active authenticated organization access is required.')
    return fail(503, 'service_error', 'Unable to complete the search request.')
  }
}
