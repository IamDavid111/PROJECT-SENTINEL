import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { messageEvidenceSchema, operationalSourceKeySchema, type MessageEvidence } from '../../../supabase/functions/_shared/aiEvidence'

export type AccessibleSource = { key: string; incidentId: string; label: string; recordType: string; date: string | null }
const incidentSchema = z.object({
  id: z.uuid(), organization_id: z.uuid(), reference_number: z.string(), title: z.string(),
  reported_at: z.string().nullable(),
})
const childSchema = z.object({
  id: z.uuid(), organization_id: z.uuid(), incident_id: z.uuid().optional(),
  investigation_id: z.uuid().optional(),
})
const sourceTables = {
  actions: 'corrective_actions', investigations: 'investigations', causes: 'investigation_root_causes',
  findings: 'investigation_findings', closures: 'incident_closures',
} as const

export async function getMessageEvidence(client: SupabaseClient, sessionId: string) {
  const { data, error } = await client.rpc('get_ai_session_evidence', { p_session_id: sessionId })
  if (error) throw new Error('Unable to verify saved answer evidence. Source details are hidden.')
  return z.array(messageEvidenceSchema).max(50).parse(data)
}

// Each query uses the signed-in browser client. Children must independently be readable with their parent.
export async function resolveAccessibleSources(client: SupabaseClient, organizationId: string, sourceIds: string[]) {
  z.uuid().parse(organizationId)
  const keys = [...new Set(z.array(operationalSourceKeySchema).max(12).parse(sourceIds))]
  const parents = new Map<string, string>()
  const incidentIds = new Set<string>()
  for (const key of keys.filter((item) => item.startsWith('incidents:'))) {
    const id = key.split(':')[1]; incidentIds.add(id); parents.set(key, id)
  }
  await Promise.all(Object.entries(sourceTables).map(async ([source, table]) => {
    const selected = keys.filter((key) => key.startsWith(`${source}:`))
    if (!selected.length) return
    const isClosure = source === 'closures'
    const columns = isClosure ? 'incident_id,organization_id' : source === 'causes' || source === 'findings'
      ? 'id,organization_id,investigation_id' : 'id,organization_id,incident_id'
    const result = await client.from(table).select(columns).eq('organization_id', organizationId)
      .in(isClosure ? 'incident_id' : 'id', selected.map((key) => key.split(':')[1]))
    if (result.error) throw new Error('Unable to recheck source access. Source details are hidden.')
    const rows = isClosure
      ? z.array(z.object({ organization_id: z.uuid(), incident_id: z.uuid() })).parse(result.data).map((row) => ({ ...row, id: row.incident_id }))
      : z.array(childSchema).parse(result.data)
    if (rows.some((row) => row.organization_id !== organizationId || !selected.includes(`${source}:${row.id}`))) {
      throw new Error('Source identity or organization mismatch.')
    }
    const investigationIds = rows.flatMap((row) => 'investigation_id' in row && row.investigation_id ? [row.investigation_id] : [])
    const investigations = new Map<string, string>()
    if (investigationIds.length) {
      const query = await client.from('investigations').select('id,organization_id,incident_id')
        .eq('organization_id', organizationId).in('id', investigationIds)
      if (query.error) throw new Error('Unable to recheck investigation access. Source details are hidden.')
      for (const row of z.array(childSchema).parse(query.data)) {
        if (row.organization_id !== organizationId || !investigationIds.includes(row.id)) throw new Error('Source identity or organization mismatch.')
        if (row.incident_id) investigations.set(row.id, row.incident_id)
      }
    }
    for (const row of rows) {
      const parent = row.incident_id ?? ('investigation_id' in row && row.investigation_id ? investigations.get(row.investigation_id) : undefined)
      if (parent) { parents.set(`${source}:${row.id}`, parent); incidentIds.add(parent) }
    }
  }))
  if (!incidentIds.size) return []
  const result = await client.from('incidents').select('id,organization_id,reference_number,title,reported_at')
    .eq('organization_id', organizationId).in('id', [...incidentIds]).neq('status', 'draft')
  if (result.error) throw new Error('Unable to recheck incident access. Source details are hidden.')
  const incidents = new Map(z.array(incidentSchema).parse(result.data).map((row) => {
    if (row.organization_id !== organizationId || !incidentIds.has(row.id)) throw new Error('Source identity or organization mismatch.')
    return [row.id, row] as const
  }))
  return keys.flatMap((key): AccessibleSource[] => {
    const parent = parents.get(key)
    const incident = parent ? incidents.get(parent) : undefined
    return incident ? [{
      key, incidentId: incident.id, label: `${incident.reference_number} — ${incident.title}`,
      recordType: key.split(':')[0], date: incident.reported_at,
    }] : []
  })
}

export type AnswerEvidence = MessageEvidence
