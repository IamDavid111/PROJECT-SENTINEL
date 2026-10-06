import { buildSafetyPlanningIndicators } from '../_shared/safetyPlanningIndicators.ts'
import { calculateSafetySnapshot } from '../_shared/safetyIntelligenceCalculations.ts'
import { asOf, assert, dataset, equal, id, incident, org, scope, site } from './fixtures_test.ts'

function snapshot(count = 10) {
  return calculateSafetySnapshot(dataset(Array.from({ length: count }, (_, n) => incident(n))), scope, { days: 30 }, asOf)
}
Deno.test('planning High/Medium/Low exact drivers and High precedence', () => {
  equal(buildSafetyPlanningIndicators(snapshot()).locations[0].indicator, 'Low')
  for (const field of ['backlogOpenCritical', 'overdueCriticalActions'] as const) {
    const data = snapshot()
    data.locations[0][field] = 1
    data.locations[0].backlogOpenHigh = 2
    equal(buildSafetyPlanningIndicators(data).locations[0].indicator, 'High')
  }
  for (const field of ['backlogOpenHigh', 'recentHighRiskCount', 'overdueActions'] as const) {
    const data = snapshot()
    data.locations[0][field] = 1
    equal(buildSafetyPlanningIndicators(data).locations[0].indicator, 'Medium')
  }
})
Deno.test('sparse history never becomes Low; known High remains an observed priority only', () => {
  const sparse = snapshot(9)
  equal(buildSafetyPlanningIndicators(sparse).locations[0].state, 'insufficient')
  equal(buildSafetyPlanningIndicators(sparse).locations[0].indicator, null)
  sparse.locations[0].backlogOpenCritical = 1
  const item = buildSafetyPlanningIndicators(sparse).locations[0]
  equal(item.indicator, null)
  equal(item.observedPriority, 'High')
  equal(buildSafetyPlanningIndicators(snapshot(0)).locations.length, 0)
})
Deno.test('incomplete source/access, missing dates and unknown backlog prevent complete indicators', () => {
  for (const field of ['missingReportedAt', 'unclassified', 'backlogUnclassified', 'invalidActionDueDates'] as const) {
    const data = snapshot()
    data.locations[0][field] = 1
    const item = buildSafetyPlanningIndicators(data).locations[0]
    equal(item.state, 'incomplete')
    equal(item.indicator, null)
  }
  for (const source of ['incidents', 'actions', 'sites'] as const) {
    const data = snapshot()
    const coverage = data.coverage.find((entry) => entry.source === source)
    assert(coverage, 'Missing coverage fixture')
    coverage.complete = false
    equal(buildSafetyPlanningIndicators(data).locations[0].indicator, null)
  }
  const facilityCoverageOnly = snapshot()
  facilityCoverageOnly.coverage.find((entry) => entry.source === 'facilities')!.complete = false
  equal(buildSafetyPlanningIndicators(facilityCoverageOnly).locations[0].indicator, 'Low')
  const data = snapshot()
  const actions = data.coverage.find((entry) => entry.source === 'actions')
  assert(actions, 'Missing action fixture')
  actions.access = 'caller_visible'
  assert(buildSafetyPlanningIndicators(data).locations[0].reasons.some((reason) => reason.includes('hidden actions')), 'Action access limitation concealed')
})
Deno.test('planning uses 90-day sample/14-day drivers and older current backlog independent of KPI window', () => {
  const data = dataset(Array.from({ length: 10 }, (_, n) => incident(n, { reported_at: '2026-08-01T00:00:00Z' })))
  data.rows.incidents.push(incident(99, { severity: 'Critical', reported_at: '2025-01-01T00:00:00Z' }))
  const result = calculateSafetySnapshot(data, scope, { days: 30 }, asOf)
  equal(result.metrics.category.denominator, 0)
  const outlook = buildSafetyPlanningIndicators(result)
  equal(outlook.locations[0].location.indicatorSampleSize, 10)
  equal(outlook.locations[0].indicator, 'High')
  equal(outlook.planningEnd, '2026-10-20T12:00:00.000Z')
  assert(!/confidence|probability|prediction/i.test(JSON.stringify(outlook)), 'Unsupported predictive output')
})
Deno.test('planning only represents authorized filtered facilities; tenant mismatches fail before indicators', () => {
  const data = dataset(Array.from({ length: 10 }, (_, n) => incident(n)))
  data.rows.incidents.push(incident(99, { site_id: id(99), facility_id: id(98), severity: 'Critical' }))
  data.rows.facilities.push({ id: id(98), organization_id: org, site_id: id(99), name: 'Excluded facility' })
  const result = calculateSafetySnapshot(data, { ...scope, siteId: site }, { days: 90, siteId: site }, asOf)
  assert(!JSON.stringify(buildSafetyPlanningIndicators(result)).includes('Excluded facility'), 'Excluded site leaked')
  data.rows.incidents[0].organization_id = id(999)
  let failed = false
  try { calculateSafetySnapshot(data, scope, { days: 90 }, asOf) } catch { failed = true }
  assert(failed, 'Tenant mismatch did not fail')
})
