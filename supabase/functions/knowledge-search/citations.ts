import type { SupabaseClient } from '@supabase/supabase-js'

// Reusable by knowledge-search, the AI Assistant and later RAG steps. Every field is copied
// from the stored version/chunk rows returned by permission-checked RPCs; nothing is inferred.
export type KnowledgeCitation = {
  documentId: string
  documentTitle: string
  documentType: string
  versionId: string
  versionNumber: number
  effectiveDate: string | null
  chunkId: string
  // Extraction keeps no page/heading data, so location is the chunk position and its
  // zero-based, end-exclusive character offsets within the version's extracted text.
  location: { chunkOrder: number; startOffset: number; endOffset: number; sourceFilename: string }
  excerpt: string
  // In-app route only (existing `#route?param=` convention). Opening it re-applies RLS; no
  // storage paths or signed URLs are ever included.
  reference: string
}

export type CitationRow = {
  chunk_id: string; document_id: string; version_id: string; version_number: number; title: string
  document_type: string; effective_date: string | null; source_filename: string
  chunk_order: number; start_offset: number; end_offset: number; content: string
}

export const citationReference = (documentId: string, versionId: string) =>
  `#knowledge?document=${encodeURIComponent(documentId)}&version=${encodeURIComponent(versionId)}`

export function toCitation(row: CitationRow): KnowledgeCitation {
  return {
    documentId: row.document_id, documentTitle: row.title, documentType: row.document_type,
    versionId: row.version_id, versionNumber: row.version_number, effectiveDate: row.effective_date ?? null,
    chunkId: row.chunk_id,
    location: { chunkOrder: row.chunk_order, startOffset: row.start_offset, endOffset: row.end_offset, sourceFilename: row.source_filename },
    excerpt: row.content,
    reference: citationReference(row.document_id, row.version_id),
  }
}

// Re-resolves cited chunk IDs with the caller's JWT. IDs the caller may not read, or that are
// no longer current, are dropped rather than reported, so forbidden sources never leak.
export async function resolveCitations(caller: SupabaseClient, chunkIds: string[]): Promise<KnowledgeCitation[]> {
  const unique = [...new Set(chunkIds)]
  if (!unique.length) return []
  const { data, error } = await caller.rpc('get_knowledge_citations', { target_chunk_ids: unique })
  if (error) throw new Error('citation_unavailable')
  return ((data ?? []) as CitationRow[]).map(toCitation)
}
