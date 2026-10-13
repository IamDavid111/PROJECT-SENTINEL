import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import { aiResponseSchema, type AiErrorResponse, type AiSuccessResponse } from '../../../supabase/functions/_shared/aiContracts'
import { aiMessageSchema, aiSessionSchema, aiTurnRequestSchema } from '../../../supabase/functions/_shared/aiSessions'
import { z } from 'zod'
import { safetyFiltersSchema, type SafetyFilters } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { getMessageEvidence } from './aiEvidenceService'

export type AiServiceResponse = AiSuccessResponse

// Preserve structured server failures and their trace IDs for future consumers.
export class AiServiceError extends Error {
  readonly response: AiErrorResponse

  constructor(response: AiErrorResponse) {
    super(response.error.message)
    this.name = 'AiServiceError'
    this.response = response
  }
}

export async function requestAiResponse(client: SupabaseClient, prompt: string, sessionId?: string, copilotFilters?: SafetyFilters): Promise<AiServiceResponse> {
  const { data, error } = await client.functions.invoke<unknown>('ai-service', {
    body: { prompt, ...(sessionId ? { sessionId } : {}),
      ...(copilotFilters ? { feature: 'safety_copilot', ...copilotFilters } : {}) },
  })
  let body: unknown = data
  // Supabase returns non-2xx response bodies through FunctionsHttpError rather than data.
  if (error instanceof FunctionsHttpError) {
    try {
      body = await error.context.json()
    } catch {
      throw new Error('The AI service returned an invalid error response.')
    }
  } else if (error) {
    throw new Error('Unable to complete the AI request.')
  }
  const parsed = aiResponseSchema.safeParse(body)
  if (!parsed.success) {
    throw new Error('The AI service returned an invalid response.')
  }
  if (!parsed.data.ok) throw new AiServiceError(parsed.data)
  if (error) throw new Error('The AI service returned an inconsistent response.')
  return parsed.data
}

// New Chat calls this each time. The database derives identity and tenant; neither is an argument.
export async function createAiSession(client: SupabaseClient, title = 'New chat') {
  const { data, error } = await client.rpc('create_ai_session', { p_title: title })
  if (error) throw new Error('Unable to create AI conversation.')
  return aiSessionSchema.parse(data)
}

// Assistant consumers must reuse this ID for each follow-up, not call the stateless foundation path.
export function sendAiSessionMessage(client: SupabaseClient, sessionId: string, prompt: string) {
  return requestAiResponse(client, prompt, sessionId)
}

// Explicit opt-in preserves the generic Phase 1 API; the existing session owns conversation history.
export function sendSafetyCopilotMessage(client: SupabaseClient, sessionId: string, prompt: string, filters: SafetyFilters = { days: 90 }) {
  const validatedFilters = safetyFiltersSchema.parse(filters)
  const request = aiTurnRequestSchema.parse({ feature: 'safety_copilot', sessionId, prompt, ...validatedFilters })
  return requestAiResponse(client, request.prompt, request.sessionId, validatedFilters)
}

export async function listAiSessions(client: SupabaseClient) {
  const { data, error } = await client.from('ai_sessions')
    .select('id, title, created_at, updated_at, expires_at')
    .order('updated_at', { ascending: false }).limit(50)
  if (error) throw new Error('Unable to load AI conversations.')
  return z.array(aiSessionSchema).parse(data)
}

// RLS checks ownership even if a caller changes the session ID or bypasses this helper.
export async function getAiSession(client: SupabaseClient, sessionId: string) {
  const { data: session, error } = await client.from('ai_sessions')
    .select('id, title, created_at, updated_at, expires_at').eq('id', sessionId).single()
  if (error) throw new Error('AI conversation is not accessible or lacks a current access proof. Start a new chat.')
  const { data: messages, error: messagesError } = await client.from('ai_session_messages')
    .select('id, request_id, role, content, status, created_at')
    .eq('session_id', sessionId).order('id').limit(100)
  if (messagesError) throw new Error('Unable to load AI conversation messages.')
  const validatedMessages = z.array(aiMessageSchema).max(100).parse(messages)
  const evidence = await getMessageEvidence(client, sessionId)
  const byRequest = new Map(evidence.map((item) => [item.request_id, item]))
  return { session: aiSessionSchema.parse(session), messages: validatedMessages.map((message) => ({
    ...message, ...(message.role === 'assistant' && byRequest.has(message.request_id)
      ? { evidence: byRequest.get(message.request_id) } : {}),
  })) }
}

export async function deleteAiSession(client: SupabaseClient, sessionId: string) {
  const { data, error } = await client.rpc('delete_ai_session', { p_session_id: sessionId })
  if (error || data !== true) throw new Error('Unable to delete AI conversation.')
}
