import { buildAiRequestCompletion, buildAiResponseMetadata } from './audit.ts'

// Sensitive-looking fields are deliberately supplied to verify they never enter audit metadata.
function assertEquals<T>(actual: T, expected: T) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  }
}

Deno.test('AI response audit metadata retains only safe usage counts and duration', () => {
  assertEquals(
    buildAiResponseMetadata({
      input_tokens: 42,
      output_tokens: 12,
      prompt: 'must not be retained',
      api_key: 'must not be retained',
    }, 150.9),
    { duration_ms: 150, input_tokens: 42, output_tokens: 12 },
  )
  assertEquals(
    buildAiResponseMetadata({ input_tokens: -1, output_tokens: 'unknown' }, 4),
    { duration_ms: 4 },
  )
})

Deno.test('AI request completion records generic failure codes without provider details', () => {
  const failed = buildAiRequestCompletion('failed', 20, 'provider_http_error')
  assertEquals(failed.status, 'failed')
  assertEquals(failed.error_code, 'provider_http_error')
  assertEquals(failed.response_metadata, { duration_ms: 20 })
  if (!failed.completed_at) throw new Error('Completion timestamp is required')

  const succeeded = buildAiRequestCompletion('succeeded', 35, 'ignored', {
    input_tokens: 3,
    output_tokens: 5,
  })
  assertEquals(succeeded.status, 'succeeded')
  assertEquals(succeeded.error_code, null)
  assertEquals(succeeded.response_metadata, { duration_ms: 35, input_tokens: 3, output_tokens: 5 })
})
