import { handleSearchRequest } from './handler.ts'

const user = 'fa000000-0000-4000-8000-000000000001'
const org = 'fb000000-0000-4000-8000-000000000001'
const doc = 'fc000000-0000-4000-8000-000000000001'
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}
function request(body: unknown, token: string | null = 'Bearer user-token') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = token
  return new Request('https://search.invalid', { method: 'POST', headers, body: JSON.stringify(body) })
}
function runtime(options: { denied?: boolean; noKey?: boolean; providerDown?: boolean } = {}) {
  const seen: Array<{ path: string; body: Record<string, unknown> | null; auth: string | null }> = []
  return {
    seen,
    env: (name: string) => ({
      SUPABASE_URL: 'https://search.invalid', SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      OPENAI_API_KEY: options.noKey ? undefined : 'provider-secret',
    } as Record<string, string | undefined>)[name],
    fetch: (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input instanceof Request ? input.url : input))
      seen.push({ path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init?.headers).get('Authorization') })
      const json = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }))
      if (url.pathname.endsWith('/auth/v1/user')) return options.denied ? json({ message: 'bad jwt' }, 401) : json({ id: user })
      if (url.pathname.endsWith('/profiles')) return json({ id: user, organization_id: org, account_status: 'active' })
      if (url.pathname.endsWith('/memberships')) return json({ user_id: user, organization_id: org, role: 'Field Worker' })
      if (url.hostname === 'api.openai.com') {
        if (options.providerDown) return json({ error: { message: 'Private provider detail' } }, 500)
        return json({ data: [{ index: 0, embedding: Array(1536).fill(0.01) }] })
      }
      if (url.pathname.endsWith('/rpc/get_knowledge_citations')) return json([{
        chunk_id: 'fd000000-0000-4000-8000-000000000001', document_id: doc, version_id: 'fe000000-0000-4000-8000-000000000001',
        version_number: 2, title: 'Permit to Work', document_type: 'procedure', effective_date: '2026-01-01',
        source_filename: 'ptw.docx', chunk_order: 3, start_offset: 3600, end_offset: 4800, content: 'Isolate energy sources.',
      }])
      if (url.pathname.endsWith('/rpc/search_knowledge')) return json([{
        chunk_id: 'fd000000-0000-4000-8000-000000000001', document_id: doc, version_id: 'fe000000-0000-4000-8000-000000000001',
        version_number: 2, title: 'Permit to Work', document_type: 'procedure', site_id: null, department: 'Operations',
        effective_date: '2026-01-01',
        source_filename: 'ptw.docx', chunk_order: 3, start_offset: 3600, end_offset: 4800, content: 'Isolate energy sources.', similarity: 0.82,
      }])
      return json({ message: 'Unexpected request' }, 500)
    },
  }
}

Deno.test('search embeds server-side and returns citation-ready, caller-scoped results', async () => {
  const run = runtime()
  const response = await handleSearchRequest(request({ query: 'energy isolation', limit: 5, documentIds: [doc] }), run)
  const body = await response.json()
  equal(response.status, 200)
  const citation = {
    documentId: doc, documentTitle: 'Permit to Work', documentType: 'procedure',
    versionId: 'fe000000-0000-4000-8000-000000000001', versionNumber: 2, effectiveDate: '2026-01-01',
    chunkId: 'fd000000-0000-4000-8000-000000000001',
    location: { chunkOrder: 3, startOffset: 3600, endOffset: 4800, sourceFilename: 'ptw.docx' },
    excerpt: 'Isolate energy sources.',
    reference: `#knowledge?document=${doc}&version=fe000000-0000-4000-8000-000000000001`,
  }
  equal(body.results[0], { rank: 1, similarity: 0.82, citation, scope: { siteId: null, department: 'Operations' } })
  const rpc = run.seen.find((s) => s.path.endsWith('/rpc/search_knowledge'))!
  // The search runs with the caller's JWT so the database derives organization and permissions.
  equal(rpc.auth, 'Bearer user-token')
  equal(Object.keys(rpc.body!).sort(), ['filter_department', 'filter_document_ids', 'filter_site_id', 'match_count', 'query_embedding', 'target_model'])
  equal(JSON.stringify(body).includes('provider-secret'), false)
  equal(JSON.stringify(body).includes('query_embedding'), false)
  equal(JSON.stringify(body).includes('storage'), false)
})

Deno.test('citation lookup re-resolves chunk IDs with the caller JWT and no embedding call', async () => {
  const run = runtime()
  const response = await handleSearchRequest(request({ chunkIds: ['fd000000-0000-4000-8000-000000000001'] }), run)
  const body = await response.json()
  equal([response.status, body.citations.length, body.citations[0].chunkId, body.citations[0].versionNumber],
    [200, 1, 'fd000000-0000-4000-8000-000000000001', 2])
  equal(run.seen.find((s) => s.path.endsWith('/rpc/get_knowledge_citations'))!.auth, 'Bearer user-token')
  equal(run.seen.some((s) => s.path.includes('embeddings')), false)
  for (const bad of [{ chunkIds: [] }, { chunkIds: ['bad'] }, { chunkIds: [doc], query: 'x' }]) {
    equal((await handleSearchRequest(request(bad), runtime())).status, 400)
  }
})

Deno.test('unauthenticated and invalid-session requests are rejected before embedding', async () => {
  const anon = runtime()
  equal((await handleSearchRequest(request({ query: 'permit' }, null), anon)).status, 401)
  const denied = runtime({ denied: true })
  equal((await handleSearchRequest(request({ query: 'permit' }), denied)).status, 401)
  equal([...anon.seen, ...denied.seen].some((s) => s.path.includes('embeddings')), false)
})

Deno.test('client-supplied organization and malformed filters are rejected', async () => {
  for (const body of [{ query: 'permit', organizationId: org }, { query: 'x' }, { query: 'permit', limit: 50 },
    { query: 'permit', siteId: 'not-a-uuid' }, { query: 'permit', documentIds: ['bad'] }]) {
    const run = runtime()
    equal((await handleSearchRequest(request(body), run)).status, 400)
    equal(run.seen.some((s) => s.path.endsWith('/rpc/search_knowledge')), false)
  }
})

Deno.test('embedding failures are explicit and never leak provider details', async () => {
  const missing = await handleSearchRequest(request({ query: 'permit' }), runtime({ noKey: true }))
  equal([missing.status, (await missing.json()).error.code], [503, 'embedding_not_configured'])
  const down = await handleSearchRequest(request({ query: 'permit' }), runtime({ providerDown: true }))
  const body = await down.json()
  equal([down.status, body.error.code, JSON.stringify(body).includes('Private provider detail')], [503, 'embedding_failed', false])
})
