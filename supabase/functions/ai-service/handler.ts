import { createClient } from '@supabase/supabase-js'
import { ZodError } from 'zod'
import { AiAccessError, authenticateOrganization, isRecord, requireAiPermission } from './access.ts'
import { buildAiRequestCompletion } from './audit.ts'
import { getAiPrompt } from '../_shared/aiPrompts.ts'
import { aiResponseSchema, aiSuccessSchema, parseProviderText } from '../_shared/aiContracts.ts'
import { buildAiFailure, isAiTimeout } from './failures.ts'
import { aiTurnRequestSchema, assembleSessionContext } from '../_shared/aiSessions.ts'
import { safetyFiltersSchema } from '../_shared/safetyIntelligenceContracts.ts'
import { resolveSafetyScope, retrieveSafetyDataset, SafetyRetrievalError } from '../_shared/safetyIntelligenceRetrieval.ts'
import { calculateSafetySnapshot } from '../_shared/safetyIntelligenceCalculations.ts'
import {
  assembleGroundedInput, buildCopilotGrounding, copilotProviderFormat,
  validateCopilotAnswer, groundedHistoryRequestIds, type CopilotGrounding,
} from '../_shared/safetyCopilotGrounding.ts'
import {
  assembleKnowledgeInput, INSUFFICIENT_KNOWLEDGE_ANSWER, knowledgeAuditSources, knowledgeCitations,
  knowledgeProviderFormat, KnowledgeRetrievalError, retrieveKnowledge, validateKnowledgeAnswer, type KnowledgeGrounding,
  fitKnowledge,
} from './knowledge.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// One server-selected definition supplies both instructions and the audit version.
const foundationPrompt = getAiPrompt('ai_service', 'ai-foundation-v1')
const copilotPrompt = getAiPrompt('safety_copilot', 'safety-copilot-grounded-v2')
const knowledgePrompt = getAiPrompt('qhse_knowledge', 'qhse-knowledge-grounded-v1')

function copilotValidationFailure(error: unknown) {
  if (error instanceof ZodError) {
    const issue = error.issues[0]
    const field = issue?.path[0]
    return `schema:${typeof field === 'string' ? field : 'root'}:${issue?.code ?? 'invalid'}`
  }
  if (error instanceof Error && error.message === 'Unknown copilot citation.') return 'unknown_citation'
  if (error instanceof Error && error.message === 'Duplicate copilot sources.') return 'duplicate_sources'
  if (error instanceof Error && error.message === 'Grounded answer exceeds the response contract.') return 'response_too_large'
  return 'invalid_structured_answer'
}

function validatedJsonResponse(body: unknown, status: number) {
  const validated = aiResponseSchema.parse(body)
  return new Response(JSON.stringify(validated), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Inject only runtime I/O for tests; authentication still uses the existing Supabase client.
export type AiRuntime = {
  env: (name: string) => string | undefined
  fetch: typeof fetch
  now?: () => Date
}

export async function handleAiRequest(request: Request, runtime: AiRuntime = {
  env: (name) => Deno.env.get(name),
  fetch,
}): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const requestId = crypto.randomUUID()
  let completeAudit:
    | ((status: 'succeeded' | 'failed', errorCode?: string | null, usage?: unknown) => Promise<boolean>)
    | undefined
  const jsonResponse = async (body: { error: string }, status: number, auditCode?: string) => {
    const failure = buildAiFailure(requestId, body.error, status)
    console.error('AI request failed', { requestId, code: auditCode ?? failure.error.code })
    if (completeAudit) {
      try {
        if (!await completeAudit('failed', auditCode ?? failure.error.code)) {
          return validatedJsonResponse(buildAiFailure(requestId, 'Unable to safely complete the AI request', 503), 503)
        }
      } catch {
        // The database may be unavailable too. Keep the pending row and emit a safe trace for investigation.
        console.error('AI failure audit could not be completed', { requestId })
        return validatedJsonResponse(buildAiFailure(requestId, 'Unable to safely complete the AI request', 503), 503)
      }
    }
    return validatedJsonResponse(failure, status)
  }
  try {
    if (request.method !== 'POST') return jsonResponse({ error: 'POST is required' }, 405)

    // Reject missing identity even when service configuration is unavailable.
    const authorization = request.headers.get('Authorization')
    if (!authorization?.match(/^Bearer \S+$/)) {
      return jsonResponse({ error: 'Authentication is required' }, 401)
    }

    const supabaseUrl = runtime.env('SUPABASE_URL')
    const anonKey = runtime.env('SUPABASE_ANON_KEY')
    const serviceRoleKey = runtime.env('SUPABASE_SERVICE_ROLE_KEY')
    const openAiApiKey = runtime.env('OPENAI_API_KEY')
    const openAiModel = runtime.env('OPENAI_MODEL')
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error('AI service is missing required server configuration')
      return jsonResponse({ error: 'AI service is not configured' }, 503)
    }

    // Forward the verified caller's token for profile, membership and role reads so RLS still applies.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization }, fetch: runtime.fetch },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    let accessContext
    try {
      accessContext = await authenticateOrganization(userClient)
    } catch (error) {
      if (error instanceof AiAccessError) return jsonResponse({ error: error.message }, error.status)
      throw error
    }
    // The registered feature selector changes capability, not identities, permissions or instructions.
    let body: unknown
    let invalidJson = false
    try { body = await request.json() } catch { invalidJson = true }
    const turnRequest = aiTurnRequestSchema.safeParse(body)
    const isCopilot = turnRequest.success && turnRequest.data.feature === 'safety_copilot'
    const isKnowledge = turnRequest.success && turnRequest.data.feature === 'qhse_knowledge'
    const promptDefinition = isCopilot ? copilotPrompt : isKnowledge ? knowledgePrompt : foundationPrompt

    // Only attribute database audit rows once identity and tenant are trustworthy.
    // Earlier failures have a safe console trace, not a guessed user or organization.
    const startedAt = Date.now()
    let inputCharacters = 0
    const providerMetadata: { httpStatus?: number } = {}
    let sessionReserved = false
    let assistantText: string | null = null
    let assistantPresentation: ReturnType<typeof validateCopilotAnswer>['presentation'] | null = null
    let grounding: CopilotGrounding | undefined
    let knowledge: KnowledgeGrounding | undefined
    // Assistant (copilot) knowledge is optional context; `knowledge` above is the stateless RAG feature.
    let copilotKnowledge: KnowledgeGrounding | undefined
    let copilotKnowledgeNote = ''
    let assistantCitations: Array<ReturnType<typeof validateCopilotAnswer>['citations'][number] | ReturnType<typeof knowledgeCitations>[number]> = []
    const groundingMetadata: Record<string, unknown> = {}
    let completedResponseMetadata: Record<string, unknown> = {}
    // Service role is limited to private audits/session completion, never operational retrieval.
    const auditClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { fetch: runtime.fetch },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error: auditInsertError } = await auditClient.from('ai_request_logs').insert({
      request_id: requestId,
      user_id: accessContext.userId,
      organization_id: accessContext.organizationId,
      feature: promptDefinition.feature,
      prompt_version: promptDefinition.version,
      model_id: openAiModel || 'not_configured',
    })
    if (auditInsertError) {
      return jsonResponse({ error: 'Unable to safely record the AI request' }, 503, 'audit_unavailable')
    }
    completeAudit = async (status, errorCode = null, usage) => {
      const completion = buildAiRequestCompletion(status, Date.now() - startedAt, errorCode, usage)
      const responseMetadata = {
        ...completion.response_metadata,
        input_characters: inputCharacters,
        ...groundingMetadata,
        ...(providerMetadata.httpStatus === undefined ? {} : { provider_http_status: providerMetadata.httpStatus }),
      }
      completedResponseMetadata = responseMetadata
      if (sessionReserved) {
        // Finish the exchange and audit together, so refreshing never exposes an unaudited answer.
        const { data, error } = await auditClient.rpc('finish_ai_session_turn', {
          p_request_id: requestId,
          p_completion: { ...completion, response_metadata: responseMetadata,
            ...(status === 'succeeded' && grounding ? { access_sources: {
              ...grounding.accessSources,
              // Version IDs (never deleted) let saved chats re-check document readability on reopen.
              ...(copilotKnowledge?.sources.length
                ? { knowledge: [...new Set(copilotKnowledge.sources.map((source) => source.citation.versionId))] } : {}),
            } } : {}),
            ...(status === 'succeeded' && assistantPresentation ? { answer_presentation: assistantPresentation } : {}) },
          p_text: status === 'succeeded' ? assistantText : null,
        })
        if (error || data !== true) {
          console.error('AI session completion failed', { requestId })
          return false
        }
        sessionReserved = false
        return true
      }
      const { data, error } = await auditClient
        .from('ai_request_logs')
        .update({
          ...completion,
          response_metadata: responseMetadata,
        })
        .eq('request_id', requestId)
        .eq('organization_id', accessContext.organizationId)
        .eq('status', 'pending')
        .select('request_id')
        .maybeSingle()
      if (error || !data) {
        console.error('AI request audit record could not be completed', { requestId, status })
        return false
      }
      return true
    }

    try {
      await requireAiPermission(userClient, accessContext)
    } catch (error) {
      if (error instanceof AiAccessError) return jsonResponse({ error: error.message }, error.status)
      throw error
    }
    if (!openAiApiKey || !openAiModel?.trim()) {
      return jsonResponse({ error: 'AI service is not configured' }, 503, 'ai_configuration_missing')
    }

    if (invalidJson) {
      return jsonResponse({ error: 'A valid JSON request body is required' }, 400)
    }
    if (!turnRequest.success) {
      return jsonResponse({ error: 'Use a valid prompt, conversation ID and registered feature filters.' }, 400)
    }
    const { prompt } = turnRequest.data
    const sessionId = turnRequest.data.sessionId

    inputCharacters = prompt.length
    let modelInput: string | ReturnType<typeof assembleSessionContext> = prompt
    let history: unknown = []
    if (sessionId) {
      // The RPC derives ownership from auth.uid(); the client selects an ID, not its owner or tenant.
      const { data, error } = await userClient.rpc('begin_ai_session_turn', {
        p_session_id: sessionId, p_request_id: requestId, p_prompt: prompt,
      })
      if (error) {
        if (error.code === '42501') return jsonResponse({ error: 'Conversation is not accessible or its access changed. Start a new chat.' }, 403)
        if (error.code === '55P03') return jsonResponse({ error: 'A conversation request is already in progress' }, 409)
        if (error.code === '54000') return jsonResponse({ error: 'Conversation limit reached. Start a new chat.' }, 422)
        return jsonResponse({ error: 'Unable to safely load conversation' }, 503)
      }
      sessionReserved = true
      history = data
      modelInput = assembleSessionContext(history, prompt)
    }

    if (isCopilot) {
      const readDeadline = AbortSignal.timeout(20_000)
      // Forward the caller token for every operational read; service role is reserved for audit/session I/O.
      const operationalClient = createClient(supabaseUrl, anonKey, {
        global: {
          headers: { Authorization: authorization },
          fetch: (input, init) => runtime.fetch(input, {
            ...init, signal: init?.signal ? AbortSignal.any([readDeadline, init.signal]) : readDeadline,
          }),
        },
        auth: { persistSession: false, autoRefreshToken: false },
      })
      try {
        const filters = safetyFiltersSchema.parse({ days: turnRequest.data.days ?? 90, ...(turnRequest.data.siteId ? { siteId: turnRequest.data.siteId } : {}) })
        const scope = await resolveSafetyScope(operationalClient, accessContext, filters)
        const dataset = await retrieveSafetyDataset(operationalClient, accessContext, filters)
        const now = runtime.now?.() ?? new Date()
        const snapshot = calculateSafetySnapshot(dataset, scope, filters, now)
        grounding = await buildCopilotGrounding(dataset, snapshot, prompt)
        if (readDeadline.aborted) throw new DOMException('Operational deadline reached', 'TimeoutError')
        const requestIds = groundedHistoryRequestIds(history)
        let proofs: unknown = []
        if (requestIds.length) {
          const result = await auditClient.from('ai_request_logs')
            .select('request_id,response_metadata')
            .eq('user_id', accessContext.userId).eq('organization_id', accessContext.organizationId)
            .eq('session_id', sessionId)
            .eq('feature', copilotPrompt.feature).eq('status', 'succeeded')
            .in('request_id', requestIds).abortSignal(readDeadline)
          if (readDeadline.aborted) throw new DOMException('Operational deadline reached', 'TimeoutError')
          if (result.error) return jsonResponse({ error: 'Unable to safely verify conversation evidence' }, 503, 'history_provenance_unavailable')
          proofs = result.data
        }
        // Knowledge is retrieved with the same caller-JWT client, so search_knowledge applies
        // org/RBAC/scope/approval/expiry in the database. Failure degrades to no knowledge, never to
        // an unfiltered read; the answer then states that knowledge was unavailable.
        try {
          const retrieved = await retrieveKnowledge(operationalClient, runtime.env, runtime.fetch, prompt, {},
            { excerptCharacters: 1_500, contextCharacters: 4_500 })
          copilotKnowledge = fitKnowledge(retrieved, 24_000 - grounding.serialized.length - prompt.length)
          copilotKnowledgeNote = copilotKnowledge.sources.length
            ? 'Approved, current QHSE knowledge excerpts you may access were supplied; only cited excerpts are listed as knowledge sources.'
            : 'No approved, current QHSE knowledge you may access matched this question; no document content was supplied.'
          groundingMetadata.knowledge_retrieval = copilotKnowledge.sources.length ? 'available' : 'no_match'
        } catch (error) {
          if (readDeadline.aborted) throw error
          const denied = error instanceof KnowledgeRetrievalError && error.code === 'knowledge_access_denied'
          copilotKnowledgeNote = denied
            ? 'Your account cannot access the QHSE knowledge library; no document content was supplied.'
            : 'QHSE knowledge retrieval was unavailable for this request; no document content was supplied.'
          groundingMetadata.knowledge_retrieval = denied ? 'denied' : 'unavailable'
        }
        if (copilotKnowledge) Object.assign(groundingMetadata, {
          embedding_model: copilotKnowledge.model, knowledge_sources: knowledgeAuditSources(copilotKnowledge.sources),
          validated_knowledge_citation_ids: [],
        })
        modelInput = assembleGroundedInput(history, proofs, prompt, grounding,
          copilotKnowledge ? copilotKnowledge.serialized : '')
        const sourceIds = grounding.context.evidence.map((item) => item.key)
        Object.assign(groundingMetadata, {
          grounding_digest: grounding.digest, methodology_version: snapshot.methodologyVersion,
          grounding_as_of: snapshot.asOf, grounding_scope: snapshot.scope,
          grounding_source_ids: sourceIds, grounding_context_characters: grounding.serialized.length,
          grounding_context_truncated: grounding.context.contextTruncated,
          validated_citation_ids: [],
        })
        // Persist only provenance/IDs before generation, so failed requests remain traceable without raw evidence.
        const recorded = await auditClient.from('ai_request_logs').update({
          retrieved_operational_records: sourceIds, response_metadata: groundingMetadata,
        }).eq('request_id', requestId).eq('organization_id', accessContext.organizationId)
          .eq('status', 'pending').select('request_id').abortSignal(readDeadline).maybeSingle()
        if (readDeadline.aborted) throw new DOMException('Operational deadline reached', 'TimeoutError')
        if (recorded.error || !recorded.data) return jsonResponse({ error: 'Unable to safely record grounding evidence' }, 503, 'grounding_audit_unavailable')
      } catch (error) {
        if (readDeadline.aborted || isAiTimeout(error)) return jsonResponse({ error: 'Operational retrieval timed out' }, 504, 'grounding_timeout')
        if (error instanceof SafetyRetrievalError) return jsonResponse({ error: 'Unable to retrieve authorized operational data' }, 503, 'grounding_unavailable')
        // Do not call the provider after an invalid context, provenance or retrieval response.
        return jsonResponse({ error: 'Unable to safely assemble authorized operational context' }, 503, 'invalid_grounding_context')
      }
    }

    if (isKnowledge) {
      const readDeadline = AbortSignal.timeout(20_000)
      // Caller token only: permission filtering happens in the database before any excerpt is read.
      const knowledgeClient = createClient(supabaseUrl, anonKey, {
        global: {
          headers: { Authorization: authorization },
          fetch: (input, init) => runtime.fetch(input, {
            ...init, signal: init?.signal ? AbortSignal.any([readDeadline, init.signal]) : readDeadline,
          }),
        },
        auth: { persistSession: false, autoRefreshToken: false },
      })
      try {
        const { siteId, department, documentIds } = turnRequest.data
        knowledge = await retrieveKnowledge(knowledgeClient, runtime.env, runtime.fetch, prompt, { siteId, department, documentIds })
        if (readDeadline.aborted) throw new DOMException('Knowledge deadline reached', 'TimeoutError')
        modelInput = assembleKnowledgeInput(knowledge, prompt)
        const sources = knowledgeAuditSources(knowledge.sources)
        Object.assign(groundingMetadata, {
          embedding_model: knowledge.model, knowledge_sources: sources,
          grounding_context_characters: knowledge.serialized.length, grounding_context_truncated: knowledge.truncated,
          knowledge_insufficient_evidence: knowledge.sources.length === 0, validated_citation_ids: [],
        })
        // Record retrieved source IDs (no text) before generation so every model call is traceable.
        const recorded = await auditClient.from('ai_request_logs').update({
          retrieved_operational_records: sources.map((source) => source.chunkId), response_metadata: groundingMetadata,
        }).eq('request_id', requestId).eq('organization_id', accessContext.organizationId)
          .eq('status', 'pending').select('request_id').abortSignal(readDeadline).maybeSingle()
        if (recorded.error || !recorded.data) return jsonResponse({ error: 'Unable to safely record knowledge sources' }, 503, 'grounding_audit_unavailable')
      } catch (error) {
        if (error instanceof KnowledgeRetrievalError && error.code === 'knowledge_access_denied') {
          return jsonResponse({ error: 'Knowledge access is not available for this account' }, 403, error.code)
        }
        if (readDeadline.aborted || isAiTimeout(error)) return jsonResponse({ error: 'Knowledge retrieval timed out' }, 504, 'grounding_timeout')
        return jsonResponse({ error: 'Unable to retrieve authorized knowledge' }, 503, 'knowledge_retrieval_unavailable')
      }
    }

    const deliverAnswer = async (text: string, usage: unknown) => {
      const response = aiSuccessSchema.safeParse({
        contractVersion: '1',
        requestId,
        ok: true,
        feature: promptDefinition.feature,
        promptVersion: promptDefinition.version,
        model: openAiModel,
        ...(sessionId ? { sessionId } : {}),
        content: { origin: 'ai_generated', authoritative: false, text },
        citations: assistantCitations,
      })
      if (!response.success) {
        console.error('AI response contract validation failed', { requestId })
        return jsonResponse({ error: 'AI service returned an invalid response' }, 502, 'invalid_response_contract')
      }
      assistantText = text
      if (!await completeAudit!('succeeded', null, usage)) {
        return jsonResponse({ error: 'Unable to safely complete the AI request' }, 503)
      }
      // Generation is durably complete; delivery failures must not rewrite its successful audit/turn.
      completeAudit = undefined
      if (grounding && sessionId) {
        const deliveryAccess = await userClient.rpc('can_read_ai_session', { target_session: sessionId })
        const deliveryStatus = deliveryAccess.error || typeof deliveryAccess.data !== 'boolean'
          ? 'unavailable' : deliveryAccess.data ? 'allowed' : 'denied'
        const deliveryAudit = await auditClient.from('ai_request_logs').update({
          response_metadata: { ...completedResponseMetadata, delivery_access_check: deliveryStatus },
        }).eq('request_id', requestId).eq('organization_id', accessContext.organizationId)
          .eq('status', 'succeeded').select('request_id').maybeSingle()
        if (deliveryAudit.error || !deliveryAudit.data) {
          return jsonResponse({ error: 'Unable to safely record answer delivery access. Reopen the chat; do not resend.' }, 503, 'delivery_audit_unavailable')
        }
        if (deliveryAccess.error || typeof deliveryAccess.data !== 'boolean') {
          return jsonResponse({ error: 'Unable to verify current conversation access. Reopen the chat; do not resend.' }, 503, 'delivery_access_unavailable')
        }
        if (!deliveryAccess.data) {
          return jsonResponse({ error: 'Conversation access changed during generation. Start a new chat.' }, 403)
        }
      }
      return validatedJsonResponse(response.data, 200)
    }

    // No authorized evidence: answer deterministically without calling the model, so nothing can be fabricated.
    if (knowledge && knowledge.sources.length === 0) return await deliverAnswer(INSUFFICIENT_KNOWLEDGE_ANSWER, undefined)

    // Reserve atomically immediately before network I/O; no retries or bypass for stateless requests.
    const allowance = await auditClient.rpc('reserve_ai_provider_attempt', { p_request_id: requestId })
    if (allowance.error || typeof allowance.data !== 'boolean') {
      return jsonResponse({ error: 'Unable to safely enforce AI usage limits' }, 503, 'usage_control_unavailable')
    }
    if (!allowance.data) {
      return jsonResponse({ error: 'Daily AI request allowance reached. Try again after 00:00 UTC.' }, 429, 'daily_usage_limit')
    }
    let providerResponse: Response
    try {
      providerResponse = await runtime.fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: openAiModel,
          instructions: promptDefinition.instructions,
          input: modelInput,
          max_output_tokens: 1_000,
          // Disable Responses API storage; do not infer this disables all provider retention.
          store: false,
          ...(isCopilot ? { text: { format: copilotProviderFormat } } : {}),
          ...(isKnowledge ? { text: { format: knowledgeProviderFormat } } : {}),
        }),
        signal: AbortSignal.timeout(30_000),
      })
    } catch (error) {
      const timedOut = isAiTimeout(error)
      console.error('AI provider request failed', {
        requestId,
        userId: accessContext.userId,
        organizationId: accessContext.organizationId,
        timedOut,
      })
      return jsonResponse(
        { error: timedOut ? 'AI request timed out' : 'AI provider is unavailable' },
        timedOut ? 504 : 502,
        timedOut ? 'provider_timeout' : 'provider_unavailable',
      )
    }

    providerMetadata.httpStatus = providerResponse.status
    if (!providerResponse.ok) {
      console.error('AI provider returned an error', {
        requestId,
        userId: accessContext.userId,
        organizationId: accessContext.organizationId,
        status: providerResponse.status,
      })
      // Do not forward the provider's body, which could contain internal or sensitive details.
      await providerResponse.body?.cancel()
      if (providerResponse.status === 429) {
        return jsonResponse({ error: 'AI provider rate limit reached. Try again later.' }, 429, 'provider_rate_limited')
      }
      return jsonResponse({ error: 'AI provider could not complete the request' }, 502, 'provider_http_error')
    }

    let providerBody: unknown
    try {
      providerBody = await providerResponse.json()
    } catch (error) {
      console.error('AI provider returned invalid JSON', {
        requestId,
        userId: accessContext.userId,
        organizationId: accessContext.organizationId,
      })
      // The request deadline also covers reading the response body after headers arrive.
      if (isAiTimeout(error)) {
        return jsonResponse({ error: 'AI request timed out' }, 504, 'provider_timeout')
      }
      return jsonResponse({ error: 'AI provider returned an invalid response' }, 502, 'invalid_provider_json')
    }
    let text = parseProviderText(providerBody)
    if (!text) {
      console.error('AI provider response did not contain output text', {
        requestId,
        userId: accessContext.userId,
        organizationId: accessContext.organizationId,
      })
      return jsonResponse({ error: 'AI provider returned an invalid response' }, 502, 'invalid_provider_response')
    }
    if (grounding) {
      try {
        const answer = validateCopilotAnswer(text, grounding, {
          sourceIds: copilotKnowledge?.sources.map((source) => source.key) ?? [], note: copilotKnowledgeNote,
        })
        text = answer.text
        groundingMetadata.validated_citation_ids = answer.citations.map((citation) => citation.sourceId)
        const cited = answer.knowledgeSourceIds.map((key) => copilotKnowledge!.sources.find((source) => source.key === key)!)
        assistantCitations = [...answer.citations, ...knowledgeCitations(cited)]
        groundingMetadata.validated_knowledge_citation_ids = answer.knowledgeSourceIds
        assistantPresentation = answer.presentation
      } catch (error) {
        const validationFailure = copilotValidationFailure(error)
        groundingMetadata.validation_failure = validationFailure
        console.error('AI provider returned invalid grounded evidence', { requestId, validationFailure })
        return jsonResponse({ error: 'AI provider returned invalid grounded evidence' }, 502, 'invalid_copilot_response')
      }
    }
    if (knowledge) {
      try {
        const answer = validateKnowledgeAnswer(text, knowledge)
        text = answer.text
        assistantCitations = knowledgeCitations(answer.sources)
        Object.assign(groundingMetadata, {
          validated_citation_ids: answer.sources.map((source) => source.key),
          knowledge_insufficient_evidence: answer.insufficientEvidence,
        })
      } catch (error) {
        groundingMetadata.validation_failure = error instanceof Error && error.message.endsWith('knowledge citation.')
          ? 'unknown_or_duplicate_citation' : error instanceof Error && error.message === 'Uncited knowledge answer.'
            ? 'uncited_answer' : 'invalid_structured_answer'
        console.error('AI provider returned invalid knowledge grounding', { requestId, validationFailure: groundingMetadata.validation_failure })
        return jsonResponse({ error: 'AI provider returned invalid grounded evidence' }, 502, 'invalid_knowledge_response')
      }
    }

    return await deliverAnswer(text, isRecord(providerBody) ? providerBody.usage : undefined)
  } catch {
    // Final safety boundary: never return stack traces, caught messages, or a made-up answer.
    return jsonResponse({ error: 'AI service could not complete the request' }, 500, 'unexpected_server_error')
  }
}
