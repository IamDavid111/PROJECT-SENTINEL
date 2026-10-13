import { createClient } from '@supabase/supabase-js'
import { QueryClient } from '@tanstack/react-query'
import { getSafetySnapshot, SafetyIntelligenceError } from '../src/features/safety-intelligence/safetyIntelligenceService.ts'
import { invalidateSafetyIntelligence, resetSafetyIntelligenceAccess, safetyIntelligenceQueryKeys } from '../src/features/safety-intelligence/safetyIntelligenceQueryKeys.ts'
import { calculateSafetySnapshot } from '../supabase/functions/_shared/safetyIntelligenceCalculations.ts'
import { asOf, assert, dataset, equal, id, scope } from '../supabase/functions/safety-intelligence/fixtures_test.ts'
import { groupIncidentTrend, incidentTrendViews } from '../src/features/safety-intelligence/incidentTrend.ts'

Deno.test('all six trend groupings retain exact series totals, deduplicate and disclose missing settings values', () => {
  const record = {
    id: id(100), reportType: 'incident' as const, reportedAt: '2026-10-02T12:00:00.000Z',
    closedAt: '2026-10-04T12:00:00.000Z', siteId: id(3),
    department: 'Company Operations', severity: 'Company Significant', category: 'Company Equipment',
  }
  const data = {
    complete: true, reasons: [], settings: {
      sites: [{ id: id(3), name: 'Company Site' }], departments: ['Company Operations'],
      severities: ['Company Significant'], categories: ['Company Equipment'],
    },
    records: [record, { ...record, id: id(101), reportType: 'near_miss' as const }, record,
      { ...record, id: id(102), reportType: 'unsafe_condition' as const, reportedAt: null }],
  }
  equal(incidentTrendViews.length, 6)
  for (const view of incidentTrendViews) {
    const result = groupIncidentTrend(data, view.value)
    equal(result.omitted, 0)
    const totals = result.points.reduce((total, point) => [
      total[0] + point.incidents, total[1] + point.nearMisses, total[2] + point.closed,
    ], [0, 0, 0])
    equal(totals, [1, 1, 3])
    assert(result.points.every((point) => [point.incidents, point.nearMisses, point.closed].every(Number.isInteger)),
      'Noninteger chart counts')
  }
  equal(groupIncidentTrend(data, 'severity').points[0].label, 'Company Significant')
  equal(groupIncidentTrend({ ...data, records: [{ ...record, severity: null }] }, 'severity'), { points: [], omitted: 2 })
  equal(groupIncidentTrend({ ...data, records: [] }, 'month').points, [])
})

Deno.test('local calendar months and Monday weeks sort chronologically across year and daylight-saving boundaries', () => {
  const dates = [
    new Date(2027, 0, 1, 0, 15), new Date(2026, 11, 31, 23, 45),
    new Date(2026, 2, 8, 12), new Date(2026, 2, 9, 12),
  ]
  const data = {
    complete: true, reasons: [], settings: { sites: [], departments: [], severities: [], categories: [] },
    records: dates.map((date, n) => ({
      id: id(100 + n), reportType: 'incident' as const, reportedAt: date.toISOString(), closedAt: null,
      siteId: null, department: null, severity: null, category: null,
    })),
  }
  const months = groupIncidentTrend(data, 'month').points
  equal(months.map((point) => point.incidents), [2, 1, 1])
  equal(months.map((point) => new Date(Number(point.key)).getMonth()), [2, 11, 0])
  const weeks = groupIncidentTrend(data, 'week').points
  equal(weeks.map((point) => point.incidents), [1, 1, 2])
  assert(weeks.every((point) => new Date(Number(point.key)).getDay() === 1), 'Week did not start on local Monday')
  assert(weeks.every((point) => new Date(Number(point.key)).getHours() === 0), 'Week did not start at local midnight')
})

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

Deno.test('All Time has an independent cache key and validates the full reporting filter', async () => {
  const keys = ([30, 90, 'all'] as const).map((days) => safetyIntelligenceQueryKeys.snapshot(scope, { days }))
  equal(new Set(keys.map((key) => JSON.stringify(key))).size, 3)
  const client = createClient('https://snapshot-test.invalid', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (_input, init) => Promise.resolve().then(() => {
      equal(JSON.parse(String(init?.body)), { days: 'all' })
      return new Response(JSON.stringify({ ok: true, requestId: id(50),
        snapshot: calculateSafetySnapshot(dataset(), scope, { days: 'all' }, asOf) }),
        { headers: { 'Content-Type': 'application/json' } })
    }) },
  })
  equal((await getSafetySnapshot(client, { days: 'all' })).filters.days, 'all')
})

Deno.test('access events withdraw every caller period without clearing another user or organization', async () => {
  const client = new QueryClient()
  const keys = [
    safetyIntelligenceQueryKeys.snapshot(scope, { days: 90 }),
    safetyIntelligenceQueryKeys.snapshot(scope, { days: 30 }),
    safetyIntelligenceQueryKeys.snapshot({ ...scope, userId: id(90) }, { days: 90 }),
    safetyIntelligenceQueryKeys.snapshot({ ...scope, organizationId: id(99) }, { days: 90 }),
  ]
  for (const key of keys) client.setQueryData(key, { restrictedEvidence: true })
  await resetSafetyIntelligenceAccess(client, scope)
  equal(client.getQueryData(keys[0]), undefined)
  equal(client.getQueryData(keys[1]), undefined)
  assert(client.getQueryData(keys[2]) && client.getQueryData(keys[3]), 'Another identity cache was cleared')
  client.clear()
})
