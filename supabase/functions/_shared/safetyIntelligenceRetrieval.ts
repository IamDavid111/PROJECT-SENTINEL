import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { AiAccessContext } from '../ai-service/access.ts'
import {
  safetyActionSchema, safetyCauseSchema, safetyClosureSchema, safetyFacilitySchema,
  safetyFindingSchema, safetyIncidentSchema, safetyInvestigationSchema, safetySiteSchema,
  hasOrganizationIncidentVisibility,
  type SafetyCoverage, type SafetyDataset, type SafetyFilters, type SafetyScope,
} from './safetyIntelligenceContracts.ts'

export class SafetyRetrievalError extends Error {
  constructor() {
    super('Unable to retrieve authorized operational data.')
    this.name = 'SafetyRetrievalError'
  }
}

export async function resolveSafetyScope(client: SupabaseClient, context: AiAccessContext, filters: SafetyFilters): Promise<SafetyScope> {
  const { data, error } = await client.rpc('can_close_incidents', { target_organization_id: context.organizationId })
  if (error || typeof data !== 'boolean') throw new SafetyRetrievalError()
  return {
    userId: context.userId, organizationId: context.organizationId,
    visibility: hasOrganizationIncidentVisibility(context.role, data) ? 'organization' : 'personal',
    ...(filters.siteId ? { siteId: filters.siteId } : {}),
    siteAssignmentEnforced: false,
  }
}

type ReadLimits = { pageSize: number; maxRows: number }
const defaultLimits: ReadLimits = { pageSize: 500, maxRows: 10_000 }

async function readPages<T>(
  client: SupabaseClient, organizationId: string, table: string, columns: string,
  schema: z.ZodType<T>, key: string, limits: ReadLimits, omitDrafts = false,
) {
  const rows: T[] = []
  let after: string | undefined
  while (true) {
    // Keyset pagination avoids offset shifts and probes past the cap instead of assuming completeness.
    const size = Math.min(limits.pageSize, limits.maxRows - rows.length + 1)
    let query = client.from(table).select(columns).eq('organization_id', organizationId)
      .order(key, { ascending: true }).limit(size)
    if (after) query = query.gt(key, after)
    if (omitDrafts) query = query.neq('status', 'draft')
    const { data, error } = await query
    if (error) throw new SafetyRetrievalError()
    const parsed = z.array(schema).safeParse(data)
    if (!parsed.success) throw new SafetyRetrievalError()
    const page = parsed.data
    // Validate the cursor independently without casting the schema's generic row type.
    const cursors = z.array(z.object({ [key]: z.uuid() })).safeParse(data)
    if (!cursors.success) throw new SafetyRetrievalError()
    let previous = after
    for (const row of cursors.data) {
      if (previous && row[key] <= previous) throw new SafetyRetrievalError()
      previous = row[key]
    }
    const remaining = limits.maxRows - rows.length
    rows.push(...page.slice(0, remaining))
    if (page.length > remaining) return { rows, complete: false }
    if (page.length < size) return { rows, complete: true }
    after = previous
  }
}

export async function retrieveSafetyDataset(
  client: SupabaseClient, context: AiAccessContext, filters: SafetyFilters,
  limits: ReadLimits = defaultLimits,
): Promise<SafetyDataset> {
  if (!Number.isInteger(limits.pageSize) || limits.pageSize < 1 || limits.pageSize > 500
    || !Number.isInteger(limits.maxRows) || limits.maxRows < 1) throw new SafetyRetrievalError()
  const org = context.organizationId
  // Only the caller's anon-key/token client is accepted. No privileged client is created here.
  const [incidents, actions, investigations, causes, findings, closures, sites, facilities] = await Promise.all([
    readPages(client, org, 'incidents', 'id,organization_id,reference_number,title,report_type,status,reported_at,site_id,facility_id,severity,potential_severity,incident_category', safetyIncidentSchema, 'id', limits, true),
    readPages(client, org, 'corrective_actions', 'id,organization_id,incident_id,title,status,due_date', safetyActionSchema, 'id', limits),
    readPages(client, org, 'investigations', 'id,organization_id,incident_id,status,completed_at,findings_summary', safetyInvestigationSchema, 'id', limits),
    readPages(client, org, 'investigation_root_causes', 'id,organization_id,investigation_id,root_cause_statement,cause_category', safetyCauseSchema, 'id', limits),
    readPages(client, org, 'investigation_findings', 'id,organization_id,investigation_id,description,finding_type', safetyFindingSchema, 'id', limits),
    readPages(client, org, 'incident_closures', 'incident_id,organization_id,closed_at,root_cause,corrective_action', safetyClosureSchema, 'incident_id', limits),
    readPages(client, org, 'sites', 'id,organization_id,name', safetySiteSchema, 'id', limits),
    readPages(client, org, 'facilities', 'id,organization_id,site_id,name', safetyFacilitySchema, 'id', limits),
  ])
  const pages = { incidents, actions, investigations, causes, findings, closures, sites, facilities }
  // An organization-filter/RLS regression must fail, not silently turn foreign records into evidence.
  for (const page of Object.values(pages)) {
    if (page.rows.some((row) => row.organization_id !== org)) throw new SafetyRetrievalError()
  }
  const visibleIncidents = incidents.rows.filter((row) => row.status !== 'draft'
    && (!filters.siteId || row.site_id === filters.siteId))
  const incidentIds = new Set(visibleIncidents.map((row) => row.id))
  const visibleInvestigations = investigations.rows.filter((row) => incidentIds.has(row.incident_id))
  const investigationIds = new Set(visibleInvestigations.map((row) => row.id))
  const siteIds = new Set(visibleIncidents.map((row) => row.site_id))
  const facilityIds = new Set(visibleIncidents.map((row) => row.facility_id))
  // An assigned action/investigation may be readable while its parent incident is not.
  // Intersect both permissions before any such data can enter shared/model context.
  const rows = {
    incidents: visibleIncidents,
    actions: actions.rows.filter((row) => incidentIds.has(row.incident_id)),
    investigations: visibleInvestigations,
    causes: causes.rows.filter((row) => investigationIds.has(row.investigation_id)),
    findings: findings.rows.filter((row) => investigationIds.has(row.investigation_id)),
    closures: closures.rows.filter((row) => incidentIds.has(row.incident_id)),
    sites: sites.rows.filter((row) => siteIds.has(row.id)),
    facilities: facilities.rows.filter((row) => facilityIds.has(row.id)
      && (!filters.siteId || row.site_id === filters.siteId)),
  }
  const coverage: SafetyCoverage[] = (Object.keys(pages) as Array<keyof typeof pages>).map((source) => ({
    source, retrieved: rows[source].length, included: rows[source].length,
    complete: pages[source].complete,
    access: hasOrganizationIncidentVisibility(context.role, false) ? 'organization' : 'caller_visible',
    reasons: pages[source].complete ? [] : ['Authorized source exceeded the retrieval limit.'],
  }))
  return { rows, coverage }
}
