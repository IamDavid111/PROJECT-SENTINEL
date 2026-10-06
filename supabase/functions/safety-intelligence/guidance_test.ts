import { buildSafetyLocationGuidance } from '../_shared/safetyLocationGuidance.ts'
import { calculateSafetySnapshot } from '../_shared/safetyIntelligenceCalculations.ts'
import { asOf, assert, dataset, equal, id, incident, org, scope, site } from './fixtures_test.ts'

function ranked() {
  const data = dataset([
    incident(0, { severity: 'Critical' }),
    incident(1, { severity: 'High', site_id: id(5) }),
    incident(2, { severity: 'High', site_id: id(6), status: 'closed' }),
    incident(3, { severity: 'High', site_id: id(7), status: 'closed' }),
  ])
  data.rows.sites.push(
    { id: id(5), organization_id: org, name: 'Second' },
    { id: id(6), organization_id: org, name: 'Alpha' },
    { id: id(7), organization_id: org, name: 'Beta' },
  )
  return calculateSafetySnapshot(data, scope, { days: 90 }, asOf)
}
Deno.test('top-three uses canonical ranking/ties and authorized high-risk evidence', () => {
  const snapshot = ranked()
  const guidance = buildSafetyLocationGuidance(snapshot)
  equal(guidance.locations.map((item) => item.location.name), ['Fixture Site', 'Second', 'Alpha'])
  assert(guidance.locations.every((item) => item.location.level === 'site'), 'Non-site location included')
  equal(guidance.locations[0].evidence[0].id, incident(0).id)
  assert(guidance.locations.every((item) => item.evidence.every((evidence) => item.location.evidenceIncidentIds.includes(evidence.id))), 'Unlinked evidence invented')
  assert(guidance.locations[0].recommendations[0].driver.includes('1 open Critical'), 'Wrong observed driver')
  assert(guidance.locations[2].recommendations[0].driver.includes('none are currently open'), 'Closed events treated open')
  assert(guidance.origin === 'deterministic' && !guidance.authoritative, 'Advice misrepresented as AI/authoritative')
})
Deno.test('data-quality counts do not hide known rankings; incomplete sources and empty cohorts cannot rank', () => {
  for (const field of ['unclassified', 'missingReportedAt', 'unassignedFacility'] as const) {
    const snapshot = ranked()
    snapshot.dataQuality[field] = 1
    equal(buildSafetyLocationGuidance(snapshot).state, 'available')
    equal(buildSafetyLocationGuidance(snapshot).locations.length, 3)
  }
  const snapshot = ranked()
  const incidentCoverage = snapshot.coverage.find((entry) => entry.source === 'incidents')!
  incidentCoverage.complete = false
  equal(buildSafetyLocationGuidance(snapshot).state, 'incomplete')
  equal(buildSafetyLocationGuidance(snapshot).locations.length, 0)
  equal(buildSafetyLocationGuidance(calculateSafetySnapshot(dataset(), scope, { days: 90 }, asOf)).state, 'insufficient')
  equal(buildSafetyLocationGuidance(calculateSafetySnapshot(dataset([incident(0)]), scope, { days: 90 }, asOf)).locations.length, 0)
})
Deno.test('bounded excerpts never invent evidence; action advice uses actual known aggregate with coverage disclosure', () => {
  const snapshot = ranked()
  snapshot.evidence = []
  snapshot.evidenceTruncated = true
  snapshot.locations.find((item) => item.id === site)!.overdueActions = 2
  snapshot.coverage.find((entry) => entry.source === 'actions')!.access = 'caller_visible'
  const item = buildSafetyLocationGuidance(snapshot).locations[0]
  equal(item.evidence.length, 0)
  assert(item.recommendations.some((entry) => entry.driver.includes('2 known overdue')), 'Actual action driver missing')
  assert(item.actionCoverageNote.includes('only the records you can access'), 'Incomplete scope concealed')
})
Deno.test('personal and site filtered cohorts only produce their own location evidence', () => {
  const data = dataset([
    incident(0, { severity: 'High' }),
    incident(1, { severity: 'Critical', site_id: id(99), facility_id: id(98) }),
  ])
  data.rows.sites.push({ id: id(99), organization_id: org, name: 'Excluded Site' })
  const snapshot = calculateSafetySnapshot(data, { ...scope, visibility: 'personal', siteId: site }, { days: 90, siteId: site }, asOf)
  const guidance = buildSafetyLocationGuidance(snapshot)
  equal(guidance.locations.length, 1)
  assert(!JSON.stringify(guidance).includes('Excluded Site'), 'Excluded site location leaked')
  equal(guidance.locations[0].evidence[0].id, incident(0).id)
})
