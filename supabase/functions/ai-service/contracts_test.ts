import { aiResponseSchema, parseProviderText } from '../_shared/aiContracts.ts'

// Synthetic contract fixtures test validation only; they are not platform intelligence data.
const success = {
  contractVersion: '1',
  requestId: 'aaf49808-1c33-4d9c-98e6-2377a87ce619',
  ok: true,
  feature: 'ai_service',
  promptVersion: 'ai-foundation-v1',
  model: 'configured-model',
  content: { origin: 'ai_generated', authoritative: false, text: 'Generated text' },
  citations: [],
}

Deno.test('AI contract requires trace identity and non-authoritative content', () => {
  if (!aiResponseSchema.safeParse(success).success) throw new Error('Valid response rejected')
  for (const body of [
    { ...success, requestId: 'invalid' },
    { ...success, content: { ...success.content, authoritative: true } },
    { ...success, content: { ...success.content, text: '' } },
    { ...success, citations: [{ sourceType: 'unknown', sourceId: '1', label: 'Source' }] },
  ]) {
    if (aiResponseSchema.safeParse(body).success) throw new Error('Malformed response accepted')
  }
})

Deno.test('AI contract supports citations and structured failures', () => {
  if (!aiResponseSchema.safeParse({
    ...success,
    citations: [{ sourceType: 'operational_record', sourceId: 'record-id', label: 'Record' }],
  }).success) throw new Error('Citation metadata rejected')
  if (!aiResponseSchema.safeParse({
    contractVersion: '1', requestId: success.requestId, ok: false,
    error: { code: 'access_denied', message: 'Access denied', retryable: false },
  }).success) throw new Error('Structured failure rejected')
})

Deno.test('provider validation rejects malformed, refused and incomplete output', () => {
  const valid = {
    status: 'completed',
    output: [{ type: 'message', status: 'completed', content: [{ type: 'output_text', text: 'Answer' }] }],
  }
  if (parseProviderText(valid) !== 'Answer') throw new Error('Valid output rejected')
  for (const value of [
    null, {}, { ...valid, status: 'incomplete' },
    { status: 'completed', output: [{ type: 'message', status: 'completed', content: [{ type: 'refusal' }] }] },
    { status: 'completed', output: [{ type: 'message', status: 'completed', content: [{ type: 'output_text', text: 123 }] }] },
  ]) {
    if (parseProviderText(value) !== null) throw new Error('Invalid provider output accepted')
  }
})
