import { calculateSafetySnapshot, effectiveSafetySeverity } from '../_shared/safetyIntelligenceCalculations.ts'
import { safetyFiltersSchema, safetySnapshotSchema } from '../_shared/safetyIntelligenceContracts.ts'
import { asOf, assert, dataset, equal, id, incident, org, scope, site } from './fixtures_test.ts'

const snapshot = (data = dataset(), date = asOf) => calculateSafetySnapshot(data, scope, { days: 90 }, date)

Deno.test('risk formula, severity mapping, unknown classifications and minimum coverage', () => {
  const data = dataset(Array.from({ length: 100 }, (_, n) => incident(n, {
    severity: n < 40 ? 'High' : 'Low', status: n < 20 || n >= 40 ? 'submitted' : 'closed',
  })))
  const result = snapshot(data)
  equal(result.metrics.risk.score, 34)
  equal(result.metrics.risk.band, 'Medium')
  equal(result.metrics.highRisk, { state: 'available', reasons: [], count: 40, openCount: 20 })
  equal(result.metrics.risk.changePoints, null)
  equal(effectiveSafetySeverity(' low ', 'CRITICAL'), 4)
  equal(effectiveSafetySeverity('Low', 'Unmapped custom severity'), null)
  equal(effectiveSafetySeverity('Low', 'constructor'), null)
  equal(effectiveSafetySeverity(null, null), null)
  equal(snapshot().metrics.risk.state, 'insufficient')
  equal(snapshot(dataset(Array.from({ length: 9 }, (_, n) => incident(n)))).metrics.risk.score, null)
  data.rows.incidents[0].potential_severity = 'Unmapped'
  equal(snapshot(data).metrics.risk.state, 'insufficient')
  data.coverage[0].complete = false
  equal(snapshot(data).metrics.risk.state, 'incomplete')
  equal(snapshot(data).metrics.risk.score, null)
})

Deno.test('thresholds use unrounded scores and every nonterminal status is open', () => {
  for (const [high, expected] of [[0, 'Low'], [3, 'Medium'], [6, 'High']] as const) {
    const data = dataset(Array.from({ length: 10 }, (_, n) => incident(n, { severity: n < high ? 'High' : 'Low' })))
    equal(snapshot(data).metrics.risk.band, expected)
  }
  const statuses = ['submitted', 'under_review', 'investigation', 'corrective_action', 'pending_verification', 'closed', 'draft'] as const
  const data = dataset(statuses.map((status, n) => incident(n, { status, severity: 'Critical' })))
  equal(snapshot(data).metrics.highRisk.count, 6)
  equal(snapshot(data).metrics.highRisk.openCount, 5)
})

Deno.test('UTC half-open boundaries and invalid/missing dates are not silently substituted', () => {
  const data = dataset([
    incident(0, { reported_at: '2026-07-08T12:00:00.000Z' }),
    incident(1, { reported_at: '2026-07-08T11:59:59.999Z' }),
    incident(2, { reported_at: asOf.toISOString(), severity: 'Critical' }),
    incident(3, { reported_at: null }),
    incident(4, { reported_at: '2026-02-30T00:00:00Z' }),
  ])
  const result = snapshot(data)
  equal(result.metrics.category.denominator, 1)
  equal(result.dataQuality.missingReportedAt, 2)
  equal(result.dataQuality.futureReportedAt, 1)
  equal(result.locations[0].backlogOpenCritical, 0)
  assert(!result.evidence.some((row) => row.id === incident(2).id), 'Post-cutoff report entered evidence')
  equal(result.metrics.risk.state, 'incomplete')
})

Deno.test('near-miss comparable elapsed periods, zero baselines and shorter months', () => {
  const data = dataset([
    incident(0, { report_type: 'near_miss', reported_at: '2026-09-02T00:00:00Z' }),
    incident(1, { report_type: 'near_miss' }),
    incident(2, { report_type: 'near_miss' }),
    incident(3, { report_type: 'near_miss', reported_at: '2026-09-20T00:00:00Z' }),
  ])
  equal(snapshot(data).metrics.nearMiss.percentageChange, 100)
  data.rows.incidents = data.rows.incidents.filter((row) => !row.reported_at?.startsWith('2026-09'))
  equal(snapshot(data).metrics.nearMiss.direction, 'new_reporting')
  equal(snapshot(data).metrics.nearMiss.percentageChange, null)
  equal(snapshot().metrics.nearMiss.direction, 'no_reports')
  const result = snapshot(dataset(), new Date('2026-03-31T12:00:00Z'))
  equal(result.windows.nearMissPrevious.end, '2026-03-01T00:00:00.000Z')
})

Deno.test('category shares include uncategorized reports and ties are stable', () => {
  const data = dataset([
    incident(0, { incident_category: 'Z category' }), incident(1, { incident_category: 'A category' }),
    incident(2, { incident_category: null }), incident(3, { incident_category: '  ' }),
  ])
  const result = snapshot(data)
  equal(result.metrics.category.label, 'A category')
  equal(result.metrics.category.share, 25)
  equal(result.dataQuality.uncategorized, 2)
})

Deno.test('site rankings use incident site IDs with current-window counts and old backlog inputs', () => {
  const data = dataset([
    incident(0, { severity: 'Critical', site_id: id(5) }),
    incident(1, { severity: 'High', site_id: site }),
    incident(2, { severity: 'Low', site_id: id(6) }),
    incident(3, { severity: 'Low', site_id: id(7) }),
    incident(4, { severity: 'Critical', reported_at: '2025-01-01T00:00:00Z', site_id: id(6) }),
    incident(5, { severity: 'Critical', site_id: null }),
    incident(6, { report_type: 'near_miss', severity: 'Critical', site_id: id(5) }),
  ])
  data.rows.sites.push(
    { id: id(5), organization_id: org, name: 'Zulu' },
    { id: id(6), organization_id: org, name: 'Alpha' },
    { id: id(7), organization_id: org, name: 'Beta' },
  )
  const result = snapshot(data)
  equal(result.locations.filter((row) => row.level === 'site').map((row) => row.name), ['Zulu', 'Fixture Site', 'Alpha', 'Beta'])
  equal(result.locations.find((row) => row.id === id(5))?.count, 1)
  equal(result.locations.find((row) => row.id === id(5))?.highRiskCount, 1)
  equal(result.locations.find((row) => row.id === id(6))?.backlogOpenCritical, 1)
  equal(result.locations.find((row) => row.id === id(6))?.openCriticalCount, 0)
  equal(result.dataQuality.unassignedFacility, 1)
})

Deno.test('date-only overdue actions and parent visibility are explicit', () => {
  const data = dataset([incident(0, { severity: 'Critical' })])
  for (const [n, due, status] of [
    [0, '2026-10-05', 'open'], [1, '2026-10-06', 'open'],
    [2, '2026-10-01', 'verified'], [3, '2026-02-30', 'assigned'],
  ] as const) data.rows.actions.push({
    id: id(300 + n), organization_id: org, incident_id: incident(0).id,
    title: 'Recorded action', status, due_date: due,
  })
  data.rows.actions.push({ id: id(400), organization_id: org, incident_id: id(999), title: 'Unreadable parent', status: 'open', due_date: '2026-10-01' })
  const result = snapshot(data)
  equal(result.locations[0].overdueActions, 1)
  equal(result.locations[0].overdueCriticalActions, 1)
  equal(result.locations[0].invalidActionDueDates, 1)
  assert(!result.evidence.some((row) => row.excerpt === 'Unreadable parent'), 'Hidden parent action leaked')
})

Deno.test('resolution uses trusted closure cohort, excludes legacy and invalid durations, compares prior window', () => {
  const data = dataset([
    incident(0, { status: 'closed', reported_at: '2026-07-01T00:00:00Z' }),
    incident(1, { status: 'closed', reported_at: '2026-04-01T00:00:00Z' }),
    incident(2, { status: 'closed' }),
    incident(3, { status: 'closed' }),
  ])
  data.rows.closures = [
    { incident_id: incident(0).id, organization_id: org, closed_at: '2026-07-10T00:00:00Z', root_cause: 'Recorded cause', corrective_action: 'Recorded action' },
    { incident_id: incident(1).id, organization_id: org, closed_at: '2026-07-01T00:00:00Z', root_cause: 'Recorded cause', corrective_action: 'Recorded action' },
    { incident_id: incident(3).id, organization_id: org, closed_at: '2026-10-01T00:00:00Z', root_cause: 'Recorded cause', corrective_action: 'Recorded action' },
  ]
  const result = snapshot(data)
  equal(result.metrics.resolution.averageDays, 9)
  equal(result.metrics.resolution.previousAverageDays, 91)
  equal(result.metrics.resolution.changeDays, -82)
  equal(result.metrics.resolution.legacyClosedWithoutEvidence, 1)
  equal(result.metrics.resolution.invalidDurations, 1)
  const closureCoverage = data.coverage.find((row) => row.source === 'closures')
  assert(closureCoverage, 'Missing fixture closure coverage')
  closureCoverage.complete = false
  equal(snapshot(data).metrics.resolution.averageDays, null)
})

Deno.test('bounded evidence, contracts and tenant/site scope', () => {
  const data = dataset(Array.from({ length: 100 }, (_, n) => incident(n, { title: 'x'.repeat(2000) })))
  const result = snapshot(data)
  assert(result.evidence.length <= 80 && result.evidence.reduce((sum, row) => sum + row.label.length + row.excerpt.length, 0) <= 24_000, 'Evidence budget exceeded')
  assert(result.evidenceTruncated && safetySnapshotSchema.safeParse(result).success, 'Invalid bounded snapshot')
  assert(!safetyFiltersSchema.safeParse({ userId: id(2) }).success, 'Identity override accepted')
  equal(calculateSafetySnapshot(data, { ...scope, siteId: id(99) }, { days: 90, siteId: id(99) }, asOf).metrics.category.denominator, 0)
  data.rows.incidents[0].organization_id = id(99)
  let rejected = false
  try { snapshot(data) } catch { rejected = true }
  assert(rejected, 'Foreign tenant reached calculation')
})
