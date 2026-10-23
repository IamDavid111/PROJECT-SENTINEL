import { z } from 'zod'
import { safetySnapshotSchema, type SafetySnapshot } from './safetyIntelligenceContracts.ts'

const guidanceSchema = z.object({
  origin: z.literal('deterministic'), authoritative: z.literal(false),
  state: z.enum(['available', 'insufficient', 'incomplete']),
  reasons: z.array(z.string()),
  locations: z.array(z.object({
    location: safetySnapshotSchema.shape.locations.element,
    evidence: z.array(safetySnapshotSchema.shape.evidence.element),
    recommendations: z.array(z.object({
      driver: z.string(), advice: z.string(), source: z.enum(['incident_counts', 'action_counts']),
    })),
  })).max(3),
})
export type SafetyLocationGuidance = z.infer<typeof guidanceSchema>

// Reusable by the page and later assistant: advice uses canonical counts, never invented causes.
export function buildSafetyLocationGuidance(
  snapshot: SafetySnapshot, { includeActionDrivers = true }: { includeActionDrivers?: boolean } = {},
): SafetyLocationGuidance {
  const complete = (source: SafetySnapshot['coverage'][number]['source']) =>
    snapshot.coverage.some((entry) => entry.source === source && entry.complete)
  const sites = snapshot.locations.filter((entry) => entry.level === 'site')
  const retrievalComplete = complete('incidents') && complete('sites')
  if (!retrievalComplete) return guidanceSchema.parse({
    origin: 'deterministic', authoritative: false, state: 'incomplete', locations: [],
    reasons: ['Incident and site retrieval must be complete before ranking assigned sites.'],
  })
  const candidates = sites.filter((entry) => entry.openCriticalCount + entry.openHighCount > 0)
    .sort((a, b) => b.openCriticalCount - a.openCriticalCount || b.openHighCount - a.openHighCount
      || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .slice(0, 3)
  const locations = candidates.map((location) => {
    const authorizedIds = new Set(location.evidenceIncidentIds)
    const evidence = snapshot.evidence.filter((item) => item.source === 'incidents'
      && item.incidentId === item.id && authorizedIds.has(item.id)).slice(0, 3)
    const recommendations: SafetyLocationGuidance['locations'][number]['recommendations'] = []
    const open = location.openCriticalCount + location.openHighCount
    if (open) recommendations.push({
      source: 'incident_counts',
      driver: `${location.openCriticalCount} open Critical and ${location.openHighCount} open High reports in this reporting window.`,
      advice: 'Prioritize a human review of these open high-risk reports and their existing control and follow-up requirements. Verify controls before deciding any incident is ready for closure.',
    })
    else if (location.highRiskCount) recommendations.push({
      source: 'incident_counts',
      driver: `${location.highRiskCount} High/Critical reports in this reporting window; none are currently open.`,
      advice: 'Review the recorded investigations and closure evidence for these high-risk reports to identify supported follow-up lessons. Do not assume a common root cause.',
    })
    if (includeActionDrivers && location.overdueActions) recommendations.push({
      source: 'action_counts',
      driver: `${location.overdueActions} known overdue corrective actions in the current authorized backlog.`,
      advice: 'Review the existing overdue actions with their responsible owners, confirm their workflow status and prioritize follow-up. This guidance does not complete or verify an action.',
    })
    return { location, evidence, recommendations }
  })
  return guidanceSchema.parse({
    origin: 'deterministic', authoritative: false,
    state: locations.length ? 'available' : 'insufficient', locations,
    reasons: locations.length ? [] : ['No site-assigned High/Critical reports with valid reporting dates were found in this window.'],
  })
}
