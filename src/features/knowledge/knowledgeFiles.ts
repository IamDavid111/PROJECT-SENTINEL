import { knowledgeMimeTypes, type KnowledgeMimeType } from '../../../supabase/functions/knowledge-service/contracts'

const extensionMimeTypes: Record<string, KnowledgeMimeType> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
}

// Browsers sometimes report an empty MIME type for Office files; fall back to the extension.
export function resolveKnowledgeMimeType(file: File): KnowledgeMimeType | null {
  if ((knowledgeMimeTypes as readonly string[]).includes(file.type)) return file.type as KnowledgeMimeType
  if (file.type) return null
  return extensionMimeTypes[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? null
}
