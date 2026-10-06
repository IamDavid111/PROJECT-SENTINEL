import { createClient } from '@supabase/supabase-js'
import { AiServiceError, sendAiSessionMessage, sendSafetyCopilotMessage } from '../src/features/ai/aiService.ts'
import { assert, equal, id, site } from '../supabase/functions/safety-intelligence/fixtures_test.ts'

Deno.test('frontend opts into grounded sessions without changing the Phase 1 request', async () => {
  const requests: unknown[] = []
  const client = createClient('https://client-test.invalid', 'test-anon', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (_input, init) => Promise.resolve().then(() => {
      const body = JSON.parse(String(init?.body))
      requests.push(body)
      return new Response(JSON.stringify({
        ok: true, contractVersion: '1', requestId: id(801), sessionId: id(800),
        feature: body.feature ?? 'ai_service', promptVersion: body.feature ? 'safety-copilot-grounded-v1' : 'ai-foundation-v1',
        model: 'test-model', content: { origin: 'ai_generated', authoritative: false, text: 'Test advice' },
        citations: [],
      }), { headers: { 'Content-Type': 'application/json' } })
    }) },
  })
  await sendAiSessionMessage(client, id(800), 'Foundation request')
  await sendSafetyCopilotMessage(client, id(800), ' Grounded question ')
  await sendSafetyCopilotMessage(client, id(800), 'Site question', { days: 30, siteId: site })
  equal(requests, [
    { prompt: 'Foundation request', sessionId: id(800) },
    { prompt: 'Grounded question', sessionId: id(800), feature: 'safety_copilot', days: 90 },
    { prompt: 'Site question', sessionId: id(800), feature: 'safety_copilot', days: 30, siteId: site },
  ])
})

Deno.test('frontend rejects missing sessions before network calls and preserves traced grounding failures', async () => {
  let calls = 0
  const client = createClient('https://client-test.invalid', 'test-anon', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: () => Promise.resolve().then(() => {
      calls++
      return new Response(JSON.stringify({
        ok: false, contractVersion: '1', requestId: id(802),
        error: { code: 'service_unavailable', message: 'Unable to retrieve authorized operational data', retryable: true },
      }), { status: 503, headers: { 'Content-Type': 'application/json' } })
    }) },
  })
  let failed = false
  try { await sendSafetyCopilotMessage(client, '', 'Question') } catch { failed = true }
  assert(failed && calls === 0, 'Invalid session reached the server')
  let failure: unknown
  try { await sendSafetyCopilotMessage(client, id(800), 'Question') } catch (error) { failure = error }
  assert(failure instanceof AiServiceError, 'Structured grounding failure lost')
  equal(failure.response.requestId, id(802))
  equal(failure.response.error.retryable, true)
})
