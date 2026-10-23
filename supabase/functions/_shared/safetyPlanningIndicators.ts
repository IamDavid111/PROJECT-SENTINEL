import { z } from 'zod'
import type { SafetySnapshot } from './safetyIntelligenceContracts.ts'

const planningSchema = z.object({
  origin: z.literal('deterministic'), authoritative: z.literal(false),
  asOf: z.iso.datetime(), planningEnd: z.iso.datetime(),
  state: z.enum(['available', 'unavailable']), reasons: z.array(z.string()),
  locations: z.array(z.object({
    location: z.object({
      level: z.literal('site'), id: z.uuid(), name: z.string(),
    }),
    openCritical: z.number().int().nonnegative(),
    openHigh: z.number().int().nonnegative(),
    nonOverdueUnfinishedActions: z.number().int().nonnegative(),
    criticalLinkedUnfinishedActions: z.number().int().nonnegative(),
    state: z.enum(['available', 'incomplete']),
    reasons: z.array(z.string()),
    drivers: z.array(z.object({ observation: z.string(), advice: z.string() })),
  })),
})
export type SafetyPlanningIndicators = z.infer<typeof planningSchema>

// Describes current priorities for the next 14 days, never a probability of future incidents.
export function buildSafetyPlanningIndicators(snapshot: SafetySnapshot): SafetyPlanningIndicators {
  const legacyPlanningSites = snapshot.locations.filter((location) => location.level === 'site').map((location) => ({
    id: location.id, name: location.name,
    openCritical: location.openCriticalCount,
    openHigh: location.openHighCount,
    nonOverdueUnfinishedActions: Math.max(0, location.overdueActions - location.overdueCriticalActions),
    criticalLinkedUnfinishedActions: location.overdueCriticalActions,
    unfinishedActionsMissingDueDate: location.invalidActionDueDates,
  }))
  const planningSites = snapshot.planningSites ?? legacyPlanningSites
  if (!planningSites.length) return planningSchema.parse({
    origin: 'deterministic', authoritative: false, asOf: snapshot.asOf,
    planningEnd: new Date(Date.parse(snapshot.asOf) + 14 * 86_400_000).toISOString(),
    state: 'unavailable', reasons: ['The deployed snapshot endpoint does not provide planning counts.'], locations: [],
  })
  const complete = (source: SafetySnapshot['coverage'][number]['source']) =>
    snapshot.coverage.some((entry) => entry.source === source && entry.complete)
  const actionCoverage = snapshot.coverage.find((entry) => entry.source === 'actions')
  const locations = planningSites.map((location) => {
      const reasons = [
        ...(!complete('incidents') || !complete('sites') ? ['Incident/site retrieval is incomplete.'] : []),
        ...(!actionCoverage?.complete ? ['Corrective-action retrieval is incomplete.'] : []),
        ...(actionCoverage?.access !== 'organization' ? ['Only caller-visible actions are represented; hidden actions cannot be ruled out.'] : []),
        ...(location.unfinishedActionsMissingDueDate ? ['Some unfinished actions have missing or invalid due dates and are excluded from the non-overdue count.'] : []),
      ]
      const state = reasons.length ? 'incomplete' : 'available'
      const { openCritical, openHigh, nonOverdueUnfinishedActions, criticalLinkedUnfinishedActions } = location
      const drivers: SafetyPlanningIndicators['locations'][number]['drivers'] = []
      if (openCritical) drivers.push({
        observation: `${openCritical} open Critical reports.`,
        advice: `Prioritize risk review of these ${openCritical} Critical reports using the site's OH&S and risk-management process. Consider elimination, substitution or engineering controls before administrative controls or PPE; verify control effectiveness and escalate residual risk for management review. Apply relevant process-safety guidance where applicable.`,
      })
      if (criticalLinkedUnfinishedActions) drivers.push({
        observation: `${criticalLinkedUnfinishedActions} unfinished actions linked to open Critical reports.`,
        advice: `Review these ${criticalLinkedUnfinishedActions} Critical-linked actions first; confirm accountable owners, due dates and interim controls, then verify effectiveness before completion. Record verified learning for continual improvement and management review.`,
      })
      if (openHigh) drivers.push({
        observation: `${openHigh} open High reports.`,
        advice: `Review the ${openHigh} open High reports, confirm risk controls and follow-up owners, apply the hierarchy of controls where further risk reduction is needed, and include unresolved risks in management review.`,
      })
      if (nonOverdueUnfinishedActions) drivers.push({
        observation: `${nonOverdueUnfinishedActions} non-overdue unfinished corrective actions.`,
        advice: `Confirm owners and due dates for these ${nonOverdueUnfinishedActions} unfinished actions, track progress against due dates, and verify corrective-action effectiveness before recording completion. Use verified results to support continual improvement.`,
      })
      if (!drivers.length) drivers.push({
        observation: '0 open Critical, 0 open High, 0 non-overdue unfinished actions, and 0 unfinished actions linked to open Critical reports.',
        advice: 'Continue routine risk review and verify the effectiveness of existing controls; zero observed counts are not an assurance of safety.',
      })
      return {
        location: { level: 'site', id: location.id, name: location.name },
        openCritical, openHigh, nonOverdueUnfinishedActions, criticalLinkedUnfinishedActions,
        state, reasons, drivers,
      }
    })
  return planningSchema.parse({
    origin: 'deterministic', authoritative: false, asOf: snapshot.asOf,
    planningEnd: new Date(Date.parse(snapshot.asOf) + 14 * 86_400_000).toISOString(), locations,
    state: 'available', reasons: snapshot.planningSites ? [] : ['Legacy site metrics were used because the deployed snapshot did not provide planning counts.'],
  })
}
