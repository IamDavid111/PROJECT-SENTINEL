import { createClient } from '@supabase/supabase-js'
import { QueryClient } from '@tanstack/react-query'
import { getSafetySnapshot, SafetyIntelligenceError } from '../src/features/safety-intelligence/safetyIntelligenceService.ts'
import { invalidateSafetyIntelligence, safetyIntelligenceQueryKeys } from '../src/features/safety-intelligence/safetyIntelligenceQueryKeys.ts'
import { calculateSafetySnapshot } from '../supabase/functions/_shared/safetyIntelligenceCalculations.ts'
import { asOf, assert, dataset, equal, id, scope } from '../supabase/functions/safety-intelligence/fixtures_test.ts'

Deno.test('client validates filters, response contracts and structured failures without client identity', async () => {
  const response = { ok: true, requestId: id(50), snapshot: calculateSafetySnapshot(dataset(), scope, { days: 90 }, asOf) }
  let body: unknown = response
  let status = 200
  const client = createClient('https://snapshot-test.invalid', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (_input, init) => Promise.resolve().then(() => {
      equal(JSON.parse(String(init?.body)), { days: 90 })
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    }) },
  })
  equal((await getSafetySnapshot(client, { days: 90 })).methodologyVersion, 'safety-intelligence-v1')
  body = { ok: false, requestId: id(50), error: { code: 'access_denied', message: 'Access denied.' } }
  status = 403
  let failure: unknown
  try { await getSafetySnapshot(client, { days: 90 }) } catch (error) { failure = error }
  assert(failure instanceof SafetyIntelligenceError && failure.requestId === id(50), 'Structured failure trace was lost')
  status = 200
  body = { ok: true, snapshot: {} }
  let rejected = false
  try { await getSafetySnapshot(client, { days: 90 }) } catch { rejected = true }
  assert(rejected, 'Malformed snapshot accepted')
})

Deno.test('cache isolates user/org/scope/filter/version and organization invalidation covers closure changes', async () => {
  const client = new QueryClient()
  const keys = [
    safetyIntelligenceQueryKeys.snapshot(scope, { days: 90 }),
    safetyIntelligenceQueryKeys.snapshot({ ...scope, userId: id(90) }, { days: 90 }),
    safetyIntelligenceQueryKeys.snapshot({ ...scope, visibility: 'personal' }, { days: 90 }),
    safetyIntelligenceQueryKeys.snapshot(scope, { days: 30 }),
    safetyIntelligenceQueryKeys.snapshot(scope, { days: 90, siteId: id(80) }),
    safetyIntelligenceQueryKeys.snapshot({ ...scope, organizationId: id(99) }, { days: 90 }),
  ]
  equal(new Set(keys.map((key) => JSON.stringify(key))).size, keys.length)
  assert(keys.every((key) => key.includes('safety-intelligence-v1')), 'Methodology missing from keys')
  for (const key of keys) client.setQueryData(key, { test: true })
  await invalidateSafetyIntelligence(client, scope.organizationId)
  assert(keys.slice(0, 5).every((key) => client.getQueryState(key)?.isInvalidated), 'Closure/org invalidation missed cached snapshots')
  assert(!client.getQueryState(keys[5])?.isInvalidated, 'Another organization cache invalidated')
  client.clear()
})
