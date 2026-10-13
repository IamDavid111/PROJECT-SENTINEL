import type { SupabaseClient } from '@supabase/supabase-js'

// Fixed by the vector(1536) column; models are asked for exactly this many dimensions.
export const embeddingDimensions = 1536
const batchSize = 64

export class IndexingError extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

type Env = (name: string) => string | undefined
export const embeddingModel = (env: Env) => env('OPENAI_EMBEDDING_MODEL') || 'text-embedding-3-small'

// Server-only: the provider key never leaves the Edge runtime, and chunk text is read with the
// service role from the eligibility-filtered view only after the caller's claim succeeded.
export async function embed(env: Env, fetcher: typeof fetch, model: string, input: string[]): Promise<number[][]> {
  const key = env('OPENAI_API_KEY')
  if (!key) throw new IndexingError('embedding_not_configured', 'Embedding provider is not configured.')
  let response: Response
  try {
    response = await fetcher('https://api.openai.com/v1/embeddings', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input, dimensions: embeddingDimensions, encoding_format: 'float' }),
    })
  } catch { throw new IndexingError('embedding_unavailable', 'Embedding provider could not be reached.') }
  if (!response.ok) throw new IndexingError('embedding_failed', `Embedding provider rejected the request (HTTP ${response.status}).`)
  const payload = await response.json().catch(() => null) as { data?: Array<{ index: number; embedding: unknown }> } | null
  const rows = payload?.data
  if (!Array.isArray(rows) || rows.length !== input.length) throw new IndexingError('embedding_invalid', 'Embedding provider returned an invalid response.')
  const ordered = new Array<number[]>(input.length)
  for (const row of rows) {
    const vector = row.embedding
    if (!Number.isInteger(row.index) || row.index < 0 || row.index >= input.length || ordered[row.index]
      || !Array.isArray(vector) || vector.length !== embeddingDimensions
      || !vector.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      throw new IndexingError('embedding_invalid', 'Embedding provider returned an invalid response.')
    }
    ordered[row.index] = vector as number[]
  }
  return ordered
}

export async function indexVersion(caller: SupabaseClient, service: SupabaseClient, versionId: string,
  organizationId: string, env: Env, fetcher: typeof fetch): Promise<{ status: 'succeeded'; chunks: number }> {
  const model = embeddingModel(env)
  if (!env('OPENAI_API_KEY')) throw new IndexingError('embedding_not_configured', 'Embedding provider is not configured.')
  const { data: claims, error: claimError } = await caller.rpc('begin_knowledge_indexing', { target_version_id: versionId, target_model: model })
  if (claimError || !claims?.[0]) throw new IndexingError('claim_denied',
    'Indexing requires an authorized, eligible approved version with chunks and no active indexing attempt.')
  const claim = claims[0] as { id: string; attempt_id: string }
  let vectors: Array<{ chunk_id: string; embedding: number[] }> = []
  let failure: IndexingError | null = null
  try {
    const { data: chunks, error } = await service.from('knowledge_current_chunks').select('id,text')
      .eq('version_id', versionId).eq('organization_id', organizationId).order('chunk_order')
    if (error || !chunks?.length) throw new IndexingError('eligibility_changed', 'Document is no longer eligible for indexing.')
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize)
      const embeddings = await embed(env, fetcher, model, batch.map((c) => c.text))
      vectors.push(...batch.map((c, n) => ({ chunk_id: c.id, embedding: embeddings[n] })))
    }
  } catch (error) {
    vectors = []
    failure = error instanceof IndexingError ? error : new IndexingError('indexing_failed', 'Document indexing could not be completed.')
  }
  const { data: status, error: finishError } = await service.rpc('finish_knowledge_indexing', {
    target_id: claim.id, target_attempt: claim.attempt_id, vectors,
    failure_code: failure?.code ?? null, failure_message: failure?.message ?? null,
  })
  if (finishError) throw new IndexingError('result_not_saved', 'Indexing result could not be saved. Retry after five minutes.')
  if (status !== 'succeeded') throw failure ?? new IndexingError('chunk_set_changed', 'Document chunks or eligibility changed during indexing. Retry indexing.')
  return { status: 'succeeded', chunks: vectors.length }
}
