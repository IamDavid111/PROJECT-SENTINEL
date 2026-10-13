import { handleExtractionRequest } from './handler.ts'
import { ExtractionError } from './extract.ts'

const user = 'ea000000-0000-4000-8000-000000000001'
const org = 'eb000000-0000-4000-8000-000000000001'
const version = 'ec000000-0000-4000-8000-000000000001'
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}
function request(body: unknown, token = 'Bearer test') {
  return new Request('https://extraction.invalid', { method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
function runtime(options: { denied?: boolean; parserFailure?: boolean; saveFailure?: boolean; chunkFailure?: boolean; embedFailure?: boolean; badDimensions?: boolean; noEmbeddingKey?: boolean } = {}) {
  const seen: Array<{ path: string; body: unknown; key: string | null }> = []
  let extractCalls = 0
  const run = {
    env: (name: string) => ({
      SUPABASE_URL: 'https://extraction.invalid', SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      OPENAI_API_KEY: options.noEmbeddingKey ? undefined : 'provider-secret',
    })[name],
    extract: () => {
      extractCalls++
      if (options.parserFailure) return Promise.reject(new ExtractionError('invalid_document', 'Document parsing failed.'))
      return Promise.resolve('Actual source text')
    },
    fetch: (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const path = new URL(String(input instanceof Request ? input.url : input)).pathname
      seen.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null, key: new Headers(init?.headers).get('apikey') })
      const json = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json' },
      }))
      if (path.endsWith('/auth/v1/user')) return json({ id: user })
      if (path.endsWith('/profiles')) return json({ id: user, organization_id: org, account_status: 'active' })
      if (path.endsWith('/memberships')) return json({ user_id: user, organization_id: org, role: 'QHSE Manager' })
      if (path.endsWith('/rpc/begin_knowledge_extraction')) {
        return options.denied ? json({ code: '42501', message: 'Denied' }, 403)
          : json([{ id: 'ed000000-0000-4000-8000-000000000001', attempt_id: user }])
      }
      if (path.endsWith('/knowledge_processing_candidates')) return json({
        id: version, storage_path: 'private/org/doc/version/original.txt', mime_type: 'text/plain', file_size: 18,
      })
      if (path.includes('/storage/v1/object/')) return Promise.resolve(new Response('Actual source text'))
      if (path.endsWith('/rpc/finish_knowledge_extraction')) {
        return options.saveFailure ? json({ code: 'XX000', message: 'Private database detail' }, 500)
          : json(options.parserFailure ? 'failed' : 'succeeded')
      }
      if (path.endsWith('/rpc/knowledge_extraction_status')) return json([{ status: 'failed', error_code: 'invalid_document', error_message: 'Document parsing failed.' }])
      if (path.endsWith('/rpc/knowledge_version_ai_status')) return json([{ retrieval_state: 'current', processing_eligible: true, chunk_count: 3, indexed_chunk_count: 3 }])
      if (path.endsWith('/rpc/chunk_knowledge_document')) {
        return options.chunkFailure ? json({ code: '23514', message: 'Private chunk detail' }, 400) : json(3)
      }
      if (path.endsWith('/rpc/begin_knowledge_indexing')) return json([{ id: 'ee000000-0000-4000-8000-000000000001', attempt_id: user }])
      if (path.endsWith('/knowledge_current_chunks')) return json([{ id: 'c1', text: 'one' }, { id: 'c2', text: 'two' }])
      if (path === '/v1/embeddings') {
        if (options.embedFailure) return json({ error: { message: 'Private provider detail' } }, 500)
        const size = options.badDimensions ? 3 : 1536
        return json({ data: [1, 0].map((index) => ({ index, embedding: new Array(size).fill(index) })) })
      }
      if (path.endsWith('/rpc/finish_knowledge_indexing')) {
        return json((init?.body && JSON.parse(String(init.body)).failure_code) ? 'failed' : 'succeeded')
      }
      if (path.endsWith('/rpc/knowledge_indexing_status')) return json([])
      throw new Error(`Unexpected ${path}`)
    },
  }
  return { run, seen, calls: () => extractCalls }
}

Deno.test('anonymous and forged extraction inputs are denied before privileged access', async () => {
  const r = runtime()
  equal((await handleExtractionRequest(request({ action: 'extract', versionId: version }, ''), r.run)).status, 401)
  equal(r.seen.length, 0)
  equal((await handleExtractionRequest(request({ action: 'extract', versionId: version, organizationId: org }, 'Bearer test'), r.run)).status, 400)
  equal(r.seen.some(s => s.key === 'service-key'), false)
})

Deno.test('denied or ineligible claims never download originals or call parsers', async () => {
  const r = runtime({ denied: true })
  equal((await handleExtractionRequest(request({ action: 'extract', versionId: version }), r.run)).status, 403)
  equal(r.calls(), 0)
  equal(r.seen.some(s => s.key === 'service-key'), false)
})

Deno.test('authorized processing saves real text and hash but returns no content or private path', async () => {
  const r = runtime()
  const response = await handleExtractionRequest(request({ action: 'extract', versionId: version }), r.run)
  equal(response.status, 200)
  const payload = await response.text()
  equal(payload.includes('Actual source text'), false)
  equal(payload.includes('private/org'), false)
  const finish = r.seen.find(s => s.path.endsWith('/rpc/finish_knowledge_extraction'))
  equal(finish?.key, 'service-key')
  const body = finish?.body as { content: string; source_hash: string }
  equal(body.content, 'Actual source text')
  equal(body.source_hash.length, 64)
  const chunk = r.seen.find(s => s.path.endsWith('/rpc/chunk_knowledge_document'))
  equal(chunk?.key, 'anon-key')
  equal(JSON.parse(payload).chunksAdded, 3)
  equal(JSON.parse(payload).indexedChunks, 2)
  equal(payload.includes('provider-secret'), false)
  const finishIndex = r.seen.find(s => s.path.endsWith('/rpc/finish_knowledge_indexing'))
  equal(finishIndex?.key, 'service-key')
  const vectors = (finishIndex?.body as { vectors: Array<{ chunk_id: string; embedding: number[] }> }).vectors
  // Provider rows arrive out of order; vectors must be re-ordered by index to their own chunk.
  equal(vectors.map(v => [v.chunk_id, v.embedding[0]]), [['c1', 0], ['c2', 1]])
  equal(r.seen.find(s => s.path.endsWith('/rpc/begin_knowledge_indexing'))?.key, 'anon-key')
})

Deno.test('embedding failures and malformed vectors are persisted as failed and reported safely', async () => {
  for (const option of [{ embedFailure: true }, { badDimensions: true }]) {
    const r = runtime(option)
    const response = await handleExtractionRequest(request({ action: 'index', versionId: version }), r.run)
    equal(response.status, 503)
    const payload = await response.text()
    equal(payload.includes('Private provider detail') || payload.includes('provider-secret'), false)
    const finish = r.seen.find(s => s.path.endsWith('/rpc/finish_knowledge_indexing'))?.body as { vectors: unknown[]; failure_code: string }
    equal(finish.vectors.length, 0)
    equal(finish.failure_code, option.embedFailure ? 'embedding_failed' : 'embedding_invalid')
  }
})

Deno.test('missing embedding configuration fails before claiming or reading chunks', async () => {
  const r = runtime({ noEmbeddingKey: true })
  const response = await handleExtractionRequest(request({ action: 'index', versionId: version }), r.run)
  equal(response.status, 503)
  equal(JSON.parse(await response.text()).error.code, 'embedding_not_configured')
  equal(r.seen.some(s => s.path.endsWith('/rpc/begin_knowledge_indexing') || s.path.endsWith('/knowledge_current_chunks')), false)
})

Deno.test('chunking failure after extraction is explicit, not reported as success', async () => {
  const r = runtime({ chunkFailure: true })
  const response = await handleExtractionRequest(request({ action: 'extract', versionId: version }), r.run)
  equal(response.status, 503)
  const payload = await response.text()
  equal(JSON.parse(payload).error.code, 'chunking_failed')
  equal(payload.includes('Private chunk detail'), false)
})

Deno.test('parser failure is persisted as failed, not returned as success', async () => {
  const r = runtime({ parserFailure: true })
  equal((await handleExtractionRequest(request({ action: 'extract', versionId: version }), r.run)).status, 422)
  const finish = r.seen.find(s => s.path.endsWith('/rpc/finish_knowledge_extraction'))
  const body = finish?.body as { content: null; failure_code: string }
  equal(body.content, null)
  equal(body.failure_code, 'invalid_document')
})

Deno.test('failed persistence is explicit and safe status does not download files', async () => {
  const r = runtime({ saveFailure: true })
  const response = await handleExtractionRequest(request({ action: 'extract', versionId: version }), r.run)
  equal(response.status, 503)
  equal((await response.text()).includes('Private database detail'), false)
  const statusRuntime = runtime()
  equal((await handleExtractionRequest(request({ action: 'status', versionId: version }), statusRuntime.run)).status, 200)
  equal(statusRuntime.seen.some(s=>s.key === 'service-key'), false)
})
