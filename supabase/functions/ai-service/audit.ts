export type AiRequestStatus = 'succeeded' | 'failed'

export type AiRequestCompletion = {
  status: AiRequestStatus
  completed_at: string
  error_code: string | null
  response_metadata: Record<string, number>
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

// Allowlist numeric metrics; never copy provider payloads, prompts or credentials into audit metadata.
export function buildAiResponseMetadata(usage: unknown, durationMs: number): Record<string, number> {
  const metadata: Record<string, number> = {
    duration_ms: Math.max(0, Math.floor(durationMs)),
  }
  if (typeof usage !== 'object' || usage === null) return metadata

  const usageRecord = usage as Record<string, unknown>
  const inputTokens = nonNegativeInteger(usageRecord.input_tokens)
  const outputTokens = nonNegativeInteger(usageRecord.output_tokens)
  if (inputTokens !== null) metadata.input_tokens = inputTokens
  if (outputTokens !== null) metadata.output_tokens = outputTokens
  return metadata
}

export function buildAiRequestCompletion(
  status: AiRequestStatus,
  durationMs: number,
  errorCode: string | null = null,
  usage?: unknown,
): AiRequestCompletion {
  return {
    status,
    completed_at: new Date().toISOString(),
    error_code: status === 'failed' ? errorCode : null,
    response_metadata: buildAiResponseMetadata(usage, durationMs),
  }
}
