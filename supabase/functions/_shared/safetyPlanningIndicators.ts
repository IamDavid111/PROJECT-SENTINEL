import { z } from 'zod'
import { safetySnapshotSchema, type SafetySnapshot } from './safetyIntelligenceContracts.ts'

const band = z.enum(['High', 'Medium', 'Low'])
const planningSchema = z.object({
  origin: z.literal('deterministic'), authoritative: z.literal(false),
  asOf: z.iso.datetime(), planningEnd: z.iso.datetime(),
  locations: z.array(z.object({
    location: safetySnapshotSchema.shape.locations.element,
    state: z.enum(['available', 'insufficient', 'incomplete']),
    indicator: band.nullable(), observedPriority: z.enum(['High', 'Medium']).nullable(),
    reasons: z.array(z.string()),
    drivers: z.array(z.object({ observation: z.string(), advice: z.string() })),
  })),
})
export type SafetyPlanningIndicators = z.infer<typeof planningSchema>

// Describes current priorities for the next 14 days, never a probability of future incidents.
export function buildSafetyPlanningIndicators(snapshot: SafetySnapshot): SafetyPlanningIndicators {
  const complete = (source: SafetySnapshot['coverage'][number]['source']) =>
    snapshot.coverage.some((entry) => entry.source === source && entry.complete)
  const actionCoverage = snapshot.coverage.find((entry) => entry.source === 'actions')
  const locations = snapshot.locations.filter((location) => location.level === 'site')
    .filter((location) => location.indicatorSampleSize || location.unclassified || location.backlogOpenCritical
      || location.backlogOpenHigh || location.backlogUnclassified || location.missingReportedAt || location.overdueActions)
    .map((location) => {
      const reasons = [
        ...(!complete('incidents') || !complete('sites') ? ['Incident/site retrieval is incomplete.'] : []),
        ...(!actionCoverage?.complete ? ['Corrective-action retrieval is incomplete.'] : []),
        ...(actionCoverage?.access !== 'organization' ? ['Only caller-visible actions are represented; hidden actions cannot be ruled out.'] : []),
        ...(location.missingReportedAt || snapshot.dataQuality.missingReportedAt ? ['Reporting dates are missing or invalid; history coverage is uncertain.'] : []),
        ...(location.unclassified || location.backlogUnclassified ? ['History or open-backlog severities require explicit mapping.'] : []),
        ...(location.invalidActionDueDates ? ['Some action due dates are missing or invalid.'] : []),
      ]
      const incomplete = reasons.length > 0
      const sparse = location.indicatorSampleSize < 10
      if (sparse) reasons.push('At least 10 classified reports in the 90-day evidence window are required.')
      const priority = location.backlogOpenCritical || location.overdueCriticalActions ? 'High'
        : location.backlogOpenHigh || location.recentHighRiskCount || location.overdueActions ? 'Medium' : null
      const state = incomplete ? 'incomplete' : sparse ? 'insufficient' : 'available'
      const drivers: SafetyPlanningIndicators['locations'][number]['drivers'] = []
      if (location.backlogOpenCritical || location.backlogOpenHigh) drivers.push({
        observation: `${location.backlogOpenCritical} open Critical and ${location.backlogOpenHigh} open High reports in the current backlog, including older reports.`,
        advice: 'Prioritize a human review of these reports and verify the recorded controls and required follow-up. Do not infer that an incident is ready to close.',
      })
      if (location.overdueActions) drivers.push({
        observation: `${location.overdueActions} known overdue unfinished actions; ${location.overdueCriticalActions} linked to Critical reports.`,
        advice: 'Review the existing overdue actions with their responsible owners and confirm control and verification requirements. This does not complete or verify actions.',
      })
      if (location.recentHighRiskCount) drivers.push({
        observation: `${location.recentHighRiskCount} High/Critical reports in the latest 14-day reporting window.`,
        advice: 'Review these recent reports for supported operational lessons and any recorded preventive follow-up; do not assume a shared root cause.',
      })
      if (!drivers.length) drivers.push({
        observation: 'No qualifying driver was observed in the retrieved records.',
        advice: 'Continue routine reporting and review. Absence of observed drivers does not establish that operations are safe.',
      })
      // Incomplete history can expose a known priority, but can never yield a reassuring Low.
      return { location, state, indicator: state === 'available' ? priority ?? 'Low' : null,
        observedPriority: state === 'available' ? null : priority, reasons, drivers }
    })
  return planningSchema.parse({
    origin: 'deterministic', authoritative: false, asOf: snapshot.asOf,
    planningEnd: new Date(Date.parse(snapshot.asOf) + 14 * 86_400_000).toISOString(), locations,
  })
}
