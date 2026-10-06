import { getAiPrompt } from '../_shared/aiPrompts.ts'
import { parseAiPrompt } from './access.ts'

// Protect version stability and ensure unimplemented features cannot inherit the foundation prompt.
Deno.test('foundation prompt resolves to an immutable versioned definition', () => {
  const prompt = getAiPrompt('ai_service', 'ai-foundation-v1')
  if (prompt.feature !== 'ai_service'
    || prompt.version !== 'ai-foundation-v1'
    || prompt.instructions !== 'Answer the user request clearly. Do not claim access to SentinelQHSE records or facts that were not provided.'
    || !Object.isFrozen(prompt)) {
    throw new Error('The published foundation definition must retain its feature, version and instructions')
  }
})

Deno.test('unregistered features and versions fail without falling back to another prompt', () => {
  for (const [feature, version] of [
    ['ai_service', 'unknown-version'],
    ['safety_copilot', 'v1'],
    ['incident_ai', 'v1'],
    ['executive_ai', 'v1'],
    ['rag', 'v1'],
  ]) {
    let rejected = false
    try {
      getAiPrompt(feature, version)
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('AI prompt is not registered:')) throw error
      rejected = true
    }
    if (!rejected) throw new Error('Unregistered feature/version must be rejected')
  }
})

Deno.test('clients cannot override the server-selected prompt definition', () => {
  for (const field of ['feature', 'version', 'prompt_version', 'instructions']) {
    if (parseAiPrompt({ prompt: 'Question', [field]: 'untrusted override' }) !== null) {
      throw new Error(`Client-supplied ${field} must be rejected`)
    }
  }
})
