import { aiTurnRequestSchema, assembleSessionContext } from '../_shared/aiSessions.ts'

// Stored history is context only; it never supplies trusted identities or system instructions.
Deno.test('session context retains complete exchanges and appends the current prompt', () => {
  const history = [
    { role: 'user', content: 'First question', request_id: 'eb7be1c1-d059-47dd-abf5-67d6cab9fa73' },
    { role: 'assistant', content: 'First answer', request_id: 'eb7be1c1-d059-47dd-abf5-67d6cab9fa73' },
  ]
  const input = assembleSessionContext(history, 'Follow-up')
  if (input.length !== 3 || input[0].content !== 'First question' || input[2].content !== 'Follow-up') {
    throw new Error('Conversation context was lost')
  }
  if (assembleSessionContext([], 'New chat').length !== 1) throw new Error('New chat inherited history')
})

Deno.test('context budget excludes oversized exchanges rather than partial turns', () => {
  const input = assembleSessionContext([
    { role: 'user', content: 'Q'.repeat(4000), request_id: 'eb7be1c1-d059-47dd-abf5-67d6cab9fa73' },
    { role: 'assistant', content: 'A'.repeat(23000), request_id: 'eb7be1c1-d059-47dd-abf5-67d6cab9fa73' },
  ], 'Current question')
  if (input.length !== 1) throw new Error('Context exceeded approved character budget')
})

Deno.test('session requests accept only prompt and conversation ID', () => {
  if (!aiTurnRequestSchema.safeParse({ prompt: 'Follow-up', sessionId: 'eb7be1c1-d059-47dd-abf5-67d6cab9fa73' }).success) {
    throw new Error('Valid session request rejected')
  }
  for (const field of ['user_id', 'organization_id', 'permissions', 'instructions']) {
    if (aiTurnRequestSchema.safeParse({ prompt: 'Q', [field]: 'untrusted' }).success) {
      throw new Error('Client identity or instructions accepted')
    }
  }
})
