import { z } from 'zod'

// Shared by browser and server; this module must contain no secrets or server-only dependencies.
const traceSchema = z.object({
  contractVersion: z.literal('1'),
  requestId: z.uuid(),
}).strict()

// AI output is advisory, not an authoritative platform record. Grounded citations are server-validated.
export const aiSuccessSchema = traceSchema.extend({
  ok: z.literal(true),
  feature: z.string().min(1),
  promptVersion: z.string().min(1),
  model: z.string().min(1),
  sessionId: z.uuid().optional(),
  content: z.object({
    origin: z.literal('ai_generated'),
    authoritative: z.literal(false),
    text: z.string().trim().min(1).max(32_000),
  }).strict(),
  citations: z.array(z.object({
    sourceType: z.enum(['operational_record', 'knowledge_document']),
    sourceId: z.string().min(1),
    label: z.string().min(1),
    // Server-built from stored knowledge rows (document/version/chunk identity); never model-generated.
    // Chunk IDs are deterministic (not RFC-variant), so accept any GUID shape here.
    knowledge: z.object({
      documentId: z.guid(), documentTitle: z.string().min(1), documentType: z.string().min(1),
      versionId: z.guid(), versionNumber: z.number().int().positive(), effectiveDate: z.string().nullable(),
      chunkId: z.guid(),
      location: z.object({
        chunkOrder: z.number().int().min(0), startOffset: z.number().int().min(0),
        endOffset: z.number().int().min(0), sourceFilename: z.string(),
      }).strict(),
      excerpt: z.string(),
      reference: z.string().startsWith('#knowledge?'),
    }).strict().optional(),
  }).strict()),
}).strict()

export const aiErrorSchema = traceSchema.extend({
  ok: z.literal(false),
  error: z.object({
    code: z.enum([
      'authentication_required', 'access_denied', 'invalid_request',
      'method_not_allowed', 'service_unavailable', 'provider_error',
      'request_timeout', 'rate_limited', 'conflict', 'session_limit', 'internal_error',
    ]),
    message: z.string().min(1),
    retryable: z.boolean(),
  }).strict(),
}).strict()

export const aiResponseSchema = z.discriminatedUnion('ok', [aiSuccessSchema, aiErrorSchema])
export type AiSuccessResponse = z.infer<typeof aiSuccessSchema>
export type AiErrorResponse = z.infer<typeof aiErrorSchema>
export type AiResponse = z.infer<typeof aiResponseSchema>

const providerResponseSchema = z.object({
  status: z.literal('completed'),
  output: z.array(z.object({
    type: z.string(),
    status: z.string().optional(),
    content: z.array(z.object({
      type: z.literal('output_text'),
      text: z.string().min(1),
    })).optional(),
  })),
})

// Refusals, incomplete generations and malformed payloads must not become successful answers.
export function parseProviderText(value: unknown): string | null {
  const parsed = providerResponseSchema.safeParse(value)
  if (!parsed.success) return null
  const messages = parsed.data.output.filter((item) => item.type === 'message')
  if (!messages.length || messages.some((item) => item.status !== 'completed' || !item.content?.length)) return null
  const text = messages.flatMap((item) => item.content?.map((part) => part.text) ?? []).join('').trim()
  return text && text.length <= 32_000 ? text : null
}
