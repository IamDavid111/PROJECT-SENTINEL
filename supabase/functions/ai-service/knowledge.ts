import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { embed, embeddingModel } from '../knowledge-extraction/indexing.ts'
import { type CitationRow, type KnowledgeCitation, toCitation } from '../knowledge-search/citations.ts'

// Retrieval/context bounds: a few high-similarity chunks, each excerpt and the total capped,
// so model context stays small and predictable regardless of document size.
export const KNOWLEDGE_MATCH_COUNT = 6
export const KNOWLEDGE_MIN_SIMILARITY = 0.2
export const KNOWLEDGE_EXCERPT_CHARACTERS = 2_000
export const KNOWLEDGE_CONTEXT_CHARACTERS = 10_000

export const INSUFFICIENT_KNOWLEDGE_ANSWER = 'Insufficient evidence: no approved, current QHSE knowledge that you are authorized to access matched this question, so no answer was generated. Check with the document owner or ask for the relevant document to be uploaded and approved.'

export type KnowledgeFilters = { siteId?: string; department?: string; documentIds?: string[] }
export type KnowledgeSource = { key: string; similarity: number; citation: KnowledgeCitation; excerpt: string }
export type KnowledgeGrounding = { model: string; sources: KnowledgeSource[]; serialized: string; truncated: boolean }

export class KnowledgeRetrievalError extends Error {
  constructor(readonly code: 'knowledge_access_denied' | 'knowledge_retrieval_unavailable') { super(code) }
}

// The caller-JWT client runs search_knowledge, so the database derives the organization and
// applies RBAC/scope/approval/expiry before any text exists in this process. Nothing retrieved
// here is ever fetched with the service role.
export async function retrieveKnowledge(
  caller: SupabaseClient, env: (name: string) => string | undefined, fetcher: typeof fetch,
  prompt: string, filters: KnowledgeFilters,
  limits: { excerptCharacters: number; contextCharacters: number } = {
    excerptCharacters: KNOWLEDGE_EXCERPT_CHARACTERS, contextCharacters: KNOWLEDGE_CONTEXT_CHARACTERS,
  },
): Promise<KnowledgeGrounding> {
  const model = embeddingModel(env)
  let vector: number[]
  try { [vector] = await embed(env, fetcher, model, [prompt]) } catch {
    throw new KnowledgeRetrievalError('knowledge_retrieval_unavailable')
  }
  const { data, error } = await caller.rpc('search_knowledge', {
    query_embedding: `[${vector.join(',')}]`, target_model: model, match_count: KNOWLEDGE_MATCH_COUNT,
    filter_site_id: filters.siteId ?? null, filter_department: filters.department ?? null,
    filter_document_ids: filters.documentIds ?? null, min_similarity: KNOWLEDGE_MIN_SIMILARITY,
  })
  if (error) throw new KnowledgeRetrievalError(error.code === '42501' ? 'knowledge_access_denied' : 'knowledge_retrieval_unavailable')
  const sources: KnowledgeSource[] = []
  let used = 0
  let truncated = false
  for (const row of (data ?? []) as Array<CitationRow & { similarity: number }>) {
    const excerpt = row.content.slice(0, limits.excerptCharacters)
    if (used + excerpt.length > limits.contextCharacters) { truncated = true; break }
    used += excerpt.length
    if (excerpt.length < row.content.length) truncated = true
    sources.push({ key: row.chunk_id, similarity: row.similarity, citation: toCitation(row), excerpt })
  }
  return { model, sources, serialized: serializeKnowledge(sources, truncated), truncated }
}

const serializeKnowledge = (sources: KnowledgeSource[], truncated: boolean) => JSON.stringify({ authorized_knowledge_context: {
  contextTruncated: truncated,
  sources: sources.map(({ key, citation, excerpt }) => ({
    sourceId: key, documentTitle: citation.documentTitle, documentType: citation.documentType,
    version: citation.versionNumber, effectiveDate: citation.effectiveDate, excerpt,
  })),
} })

// Drops the lowest-ranked sources until the serialized context fits the remaining prompt budget.
export function fitKnowledge(grounding: KnowledgeGrounding, maxCharacters: number): KnowledgeGrounding {
  const sources = [...grounding.sources]
  let truncated = grounding.truncated
  let serialized = grounding.serialized
  while (serialized.length > maxCharacters && sources.length) {
    sources.pop()
    truncated = true
    serialized = serializeKnowledge(sources, truncated)
  }
  return { ...grounding, sources, truncated, serialized }
}

// Untrusted user text and document text are both supplied as data messages, never instructions.
export const assembleKnowledgeInput = (grounding: KnowledgeGrounding, prompt: string) => [
  { role: 'user' as const, content: grounding.serialized },
  { role: 'user' as const, content: prompt },
]

export const knowledgeProviderFormat = {
  type: 'json_schema', name: 'qhse_knowledge_answer', strict: true,
  schema: {
    type: 'object', additionalProperties: false, required: ['answer', 'insufficientEvidence', 'sourceIds'],
    properties: {
      answer: { type: 'string', maxLength: 8_000 },
      insufficientEvidence: { type: 'boolean' },
      sourceIds: { type: 'array', maxItems: KNOWLEDGE_MATCH_COUNT, items: { type: 'string', maxLength: 100 } },
    },
  },
} as const

const answerSchema = z.object({
  answer: z.string().trim().min(1).max(8_000),
  insufficientEvidence: z.boolean(),
  sourceIds: z.array(z.string()).max(KNOWLEDGE_MATCH_COUNT),
}).strict()

// Citations must be a subset of what was actually retrieved for this request; a substantive
// answer must cite at least one source. Labels/links come from stored rows, never the model.
export function validateKnowledgeAnswer(text: string, grounding: KnowledgeGrounding) {
  const parsed = answerSchema.parse(JSON.parse(text))
  if (new Set(parsed.sourceIds).size !== parsed.sourceIds.length) throw new Error('Duplicate knowledge citation.')
  const byKey = new Map(grounding.sources.map((source) => [source.key, source]))
  const cited = parsed.sourceIds.map((key) => {
    const source = byKey.get(key)
    if (!source) throw new Error('Unknown knowledge citation.')
    return source
  })
  if (!parsed.insufficientEvidence && !cited.length) throw new Error('Uncited knowledge answer.')
  return { text: parsed.answer, insufficientEvidence: parsed.insufficientEvidence, sources: cited }
}

export const knowledgeCitations = (sources: KnowledgeSource[]) => sources.map((source) => ({
  sourceType: 'knowledge_document' as const,
  sourceId: source.key,
  // "Excerpt N" is the stored chunk position, not a document section/page number (none is stored).
  label: `${source.citation.documentTitle} (v${source.citation.versionNumber}) · Excerpt ${source.citation.location.chunkOrder + 1}`,
  knowledge: source.citation,
}))

// Audit keeps identifiers and scores only, never excerpts or document text.
export const knowledgeAuditSources = (sources: KnowledgeSource[]) => sources.map((source) => ({
  chunkId: source.key, documentId: source.citation.documentId, versionId: source.citation.versionId,
  similarity: source.similarity,
}))
