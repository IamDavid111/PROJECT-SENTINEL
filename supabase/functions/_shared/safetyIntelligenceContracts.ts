import { z } from 'zod'

export const safetyMethodologyVersion = 'safety-intelligence-v1' as const
export const safetyFiltersSchema = z.object({
  days: z.union([z.literal(30), z.literal(90)]).default(90),
  siteId: z.uuid().optional(),
}).strict()
export type SafetyFilters = z.infer<typeof safetyFiltersSchema>

const uuid = z.uuid()
const text = z.string().nullable()
const status = z.enum(['draft', 'submitted', 'under_review', 'investigation', 'corrective_action', 'pending_verification', 'closed'])
// Timestamp strings remain nullable so missing/bad historical dates become coverage limitations.
export const safetyIncidentSchema = z.object({
  id: uuid, organization_id: uuid, reference_number: z.string(), title: z.string(),
  report_type: z.enum(['incident', 'near_miss', 'unsafe_act', 'unsafe_condition', 'environmental_incident']),
  status, reported_at: text, site_id: uuid.nullable(), facility_id: uuid.nullable(),
  severity: text, potential_severity: text, incident_category: text,
})
export const safetyActionSchema = z.object({
  id: uuid, organization_id: uuid, incident_id: uuid, title: z.string(),
  status: z.enum(['open', 'assigned', 'in_progress', 'pending_verification', 'verified', 'closed', 'rejected']),
  due_date: text,
})
export const safetyInvestigationSchema = z.object({
  id: uuid, organization_id: uuid, incident_id: uuid,
  status: z.enum(['not_started', 'assigned', 'in_progress', 'pending_review', 'completed']),
  completed_at: text, findings_summary: text,
})
export const safetyCauseSchema = z.object({
  id: uuid, organization_id: uuid, investigation_id: uuid,
  root_cause_statement: z.string(), cause_category: text,
})
export const safetyFindingSchema = z.object({
  id: uuid, organization_id: uuid, investigation_id: uuid, description: z.string(), finding_type: text,
})
export const safetyClosureSchema = z.object({
  incident_id: uuid, organization_id: uuid, closed_at: z.string(), root_cause: z.string(),
  corrective_action: z.string(),
})
export const safetySiteSchema = z.object({ id: uuid, organization_id: uuid, name: z.string() })
export const safetyFacilitySchema = safetySiteSchema.extend({ site_id: uuid })
export const safetyRowsSchema = z.object({
  incidents: z.array(safetyIncidentSchema), actions: z.array(safetyActionSchema),
  investigations: z.array(safetyInvestigationSchema), causes: z.array(safetyCauseSchema),
  findings: z.array(safetyFindingSchema), closures: z.array(safetyClosureSchema),
  sites: z.array(safetySiteSchema), facilities: z.array(safetyFacilitySchema),
})
export type SafetyRows = z.infer<typeof safetyRowsSchema>
export type SafetyIncident = SafetyRows['incidents'][number]

export const safetySourceNames = ['incidents', 'actions', 'investigations', 'causes', 'findings', 'closures', 'sites', 'facilities'] as const
const sourceNameSchema = z.enum(safetySourceNames)
export const safetyCoverageSchema = z.object({
  source: sourceNameSchema, retrieved: z.number().int().nonnegative(),
  included: z.number().int().nonnegative(), complete: z.boolean(),
  access: z.enum(['organization', 'caller_visible']),
  reasons: z.array(z.string()),
})
export type SafetyCoverage = z.infer<typeof safetyCoverageSchema>
export type SafetyDataset = { rows: SafetyRows; coverage: SafetyCoverage[] }
export const safetyScopeSchema = z.object({
  organizationId: uuid, userId: uuid,
  visibility: z.enum(['organization', 'personal']),
  siteId: uuid.optional(),
  siteAssignmentEnforced: z.literal(false),
})
export type SafetyScope = z.infer<typeof safetyScopeSchema>
// This mirrors incident RLS for coverage labels only; server reads still enforce each policy.
export function hasOrganizationIncidentVisibility(role: string, closureDelegate: boolean) {
  return closureDelegate || [
    'Super Administrator', 'Organization Administrator', 'QHSE Manager', 'Site Supervisor',
    'Safety Officer / HSE Officer', 'Auditor', 'Executive / Management',
  ].includes(role)
}
const count = z.number().int().nonnegative()
const availability = z.enum(['available', 'unavailable', 'insufficient', 'incomplete'])
const metricBase = z.object({ state: availability, reasons: z.array(z.string()) })
const band = z.enum(['Low', 'Medium', 'High'])
const evidenceSchema = z.object({
  source: sourceNameSchema, id: uuid, incidentId: uuid.optional(),
  label: z.string().max(200), excerpt: z.string().max(1000),
})
export const safetySnapshotSchema = z.object({
  methodologyVersion: z.literal(safetyMethodologyVersion),
  origin: z.literal('deterministic'), authoritative: z.literal(false),
  generatedAt: z.iso.datetime(), asOf: z.iso.datetime(), timezone: z.literal('UTC'),
  scope: safetyScopeSchema,
  filters: safetyFiltersSchema,
  windows: z.object({
    reporting: z.object({ start: z.iso.datetime(), end: z.iso.datetime() }),
    previousResolution: z.object({ start: z.iso.datetime(), end: z.iso.datetime() }),
    nearMissCurrent: z.object({ start: z.iso.datetime(), end: z.iso.datetime() }),
    nearMissPrevious: z.object({ start: z.iso.datetime(), end: z.iso.datetime() }),
    indicator: z.object({ start: z.iso.datetime(), end: z.iso.datetime() }),
    recent: z.object({ start: z.iso.datetime(), end: z.iso.datetime() }),
  }),
  coverage: z.array(safetyCoverageSchema),
  dataQuality: z.object({
    missingReportedAt: count, futureReportedAt: count, unclassified: count,
    uncategorized: count, unassignedFacility: count,
  }),
  metrics: z.object({
    risk: metricBase.extend({
      score: z.number().min(0).max(100).nullable(), band: band.nullable(), sampleSize: count,
      changePoints: z.null(), comparisonReason: z.literal('Historical open-state observations are unavailable.'),
    }),
    highRisk: metricBase.extend({ count, openCount: count }),
    nearMiss: metricBase.extend({
      currentCount: count, previousCount: count, percentageChange: z.number().nullable(),
      direction: z.enum(['up', 'down', 'unchanged', 'new_reporting', 'no_reports']),
    }),
    category: metricBase.extend({ label: z.string().nullable(), count, share: z.number().min(0).max(100).nullable(), denominator: count }),
    resolution: metricBase.extend({
      averageDays: z.number().nonnegative().nullable(), previousAverageDays: z.number().nonnegative().nullable(),
      changeDays: z.number().nullable(), sampleSize: count, previousSampleSize: count,
      legacyClosedWithoutEvidence: count, invalidDurations: count,
    }),
  }),
  locations: z.array(z.object({
    level: z.enum(['facility', 'site']), id: uuid, name: z.string(),
    count, highRiskCount: count, openHighCount: count, openCriticalCount: count,
    overdueActions: count, unclassified: count, recentHighRiskCount: count, indicatorSampleSize: count,
    // Backlog drivers include old still-open records; these are inputs, not a prediction.
    backlogOpenCritical: count, backlogOpenHigh: count, overdueCriticalActions: count,
    backlogUnclassified: count, missingReportedAt: count,
    invalidActionDueDates: count,
    evidenceIncidentIds: z.array(uuid).max(20),
  })),
  evidence: z.array(evidenceSchema).max(80),
  evidenceTruncated: z.boolean(),
  limitations: z.array(z.string()),
})
export type SafetySnapshot = z.infer<typeof safetySnapshotSchema>
export const safetyResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), requestId: uuid, snapshot: safetySnapshotSchema }).strict(),
  z.object({
    ok: z.literal(false), requestId: uuid,
    error: z.object({
      code: z.enum(['authentication_required', 'access_denied', 'invalid_request', 'service_unavailable', 'request_timeout', 'internal_error']),
      message: z.string(),
    }).strict(),
  }).strict(),
])
export type SafetyResponse = z.infer<typeof safetyResponseSchema>
