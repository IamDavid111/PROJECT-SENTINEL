import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import {
  safetyFiltersSchema, safetyResponseSchema, type SafetyFilters, type SafetySnapshot,
} from '../../../supabase/functions/_shared/safetyIntelligenceContracts'

export class SafetyIntelligenceError extends Error {
  readonly requestId: string
  readonly code: string
  constructor(requestId: string, code: string, message: string) {
    super(message)
    this.name = 'SafetyIntelligenceError'
    this.requestId = requestId
    this.code = code
  }
}

export async function getSafetySnapshot(client: SupabaseClient, filters: SafetyFilters): Promise<SafetySnapshot> {
  const requested = safetyFiltersSchema.parse(filters)
  // Identity/scope are not in this payload: the endpoint resolves them from the caller token.
  const { data, error } = await client.functions.invoke<unknown>('safety-intelligence', {
    body: requested,
  })
  let body: unknown = data
  if (error instanceof FunctionsHttpError) {
    try { body = await error.context.json() } catch { throw new Error('Safety intelligence returned an invalid error response.') }
  } else if (error) {
    throw new Error('Unable to load safety intelligence.')
  }
  const result = safetyResponseSchema.safeParse(body)
  if (!result.success) throw new Error('Safety intelligence returned an invalid response.')
  if (!result.data.ok) throw new SafetyIntelligenceError(result.data.requestId, result.data.error.code, result.data.error.message)
  if (error) throw new Error('Safety intelligence returned an inconsistent response.')
  if (result.data.snapshot.filters.days !== requested.days
    || result.data.snapshot.filters.siteId !== requested.siteId
    || result.data.snapshot.scope.siteId !== requested.siteId) {
    throw new Error('Safety intelligence returned a mismatched reporting scope.')
  }
  return result.data.snapshot
}
