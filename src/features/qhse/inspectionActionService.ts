import type { SupabaseClient } from '@supabase/supabase-js'

import { getOrganizationContext } from '../incidents/incidentService'

const maxUploadSize = 10 * 1024 * 1024
const allowedUploadTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const bucket = 'incident-evidence'

export type QhseSite = { id: string; name: string }
export type QhsePerson = { id: string; full_name: string }
export type InspectionRecord = {
  id: string
  site_id: string
  inspection_title: string
  description: string
  findings: string
  inspection_date: string
  file_storage_path: string | null
  file_name: string | null
  created_at: string
  inspected_by: string
}
export type ActionRecord = {
  id: string
  type: 'preventive' | 'corrective'
  description: string
  site_id: string
  assignee_id: string
  created_by: string
  due_at: string
  status: 'open' | 'resolved'
  resolved_at: string | null
  resolved_by: string | null
  resolution_notes: string | null
  proof_storage_path: string | null
  proof_file_name: string | null
  created_at: string
}

export function validateQhseFile(file?: File | null) {
  if (!file) return
  if (!allowedUploadTypes.includes(file.type)) throw new Error('Choose a JPG, PNG, WebP, or PDF file.')
  if (file.size <= 0 || file.size > maxUploadSize) throw new Error('Files must be smaller than 10 MB.')
}

function storageFilename(file: File) {
  return `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
}

async function storeFile(client: SupabaseClient, path: string, file: File) {
  const { error } = await client.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type })
  if (error) throw new Error('Unable to upload the file.')
}

export async function getInspectionWorkspace(client: SupabaseClient) {
  const context = await getOrganizationContext(client)
  const [{ data: sites, error: sitesError }, { data: inspections, error: inspectionsError }, { data: people, error: peopleError }] = await Promise.all([
    client.from('sites').select('id, name').eq('organization_id', context.organizationId).order('name'),
    client.from('inspections').select('*').eq('organization_id', context.organizationId).order('inspection_date', { ascending: false }).limit(100),
    client.from('profiles').select('id, full_name').eq('organization_id', context.organizationId),
  ])
  if (sitesError || inspectionsError || peopleError) throw new Error('Unable to load inspection records and organization details.')
  return { ...context, sites: (sites || []) as QhseSite[], inspections: (inspections || []) as InspectionRecord[], people: (people || []) as QhsePerson[] }
}

export async function createInspection(client: SupabaseClient, input: {
  siteId: string
  title: string
  description: string
  findings: string
  inspectionDate: string
  file?: File | null
}) {
  const context = await getOrganizationContext(client)
  validateQhseFile(input.file)
  const inspectionDate = new Date(input.inspectionDate)
  if (!input.siteId || !input.title.trim() || !input.description.trim() || !input.findings.trim() || Number.isNaN(inspectionDate.getTime())) {
    throw new Error('Complete all required inspection fields with a valid inspection date.')
  }
  const { data: inspection, error } = await client.from('inspections').insert({
    organization_id: context.organizationId,
    site_id: input.siteId,
    inspection_title: input.title.trim(),
    description: input.description.trim(),
    findings: input.findings.trim(),
    inspected_by: context.userId,
    inspection_date: inspectionDate.toISOString(),
  }).select('*').single()
  if (error || !inspection) throw new Error(error?.message || 'Unable to save the inspection.')

  let uploadWarning = ''
  if (input.file) {
    const path = `${context.organizationId}/inspections/${inspection.id}/${context.userId}/${storageFilename(input.file)}`
    try {
      await storeFile(client, path, input.file)
      const { error: metadataError } = await client.from('inspections').update({
        file_storage_path: path,
        file_name: input.file.name,
        file_type: input.file.type,
        file_size: input.file.size,
      }).eq('id', inspection.id).eq('organization_id', context.organizationId)
      if (metadataError) throw metadataError
    } catch {
      await client.storage.from(bucket).remove([path])
      uploadWarning = 'Inspection saved, but the optional file could not be attached.'
    }
  }
  return { uploadWarning }
}

export async function getActionsWorkspace(client: SupabaseClient, assignedOnly = false) {
  const context = await getOrganizationContext(client)
  let actionsQuery = client.from('actions').select('*').eq('organization_id', context.organizationId).order('due_at')
  if (assignedOnly) actionsQuery = actionsQuery.eq('assignee_id', context.userId)
  const [{ data: actions, error: actionsError }, { data: sites, error: sitesError }, { data: people, error: peopleError }] = await Promise.all([
    actionsQuery,
    client.from('sites').select('id, name').eq('organization_id', context.organizationId).order('name'),
    client.from('profiles').select('id, full_name').eq('organization_id', context.organizationId).eq('account_status', 'active').order('full_name'),
  ])
  if (actionsError || sitesError || peopleError) throw new Error('Unable to load organization actions.')
  return { ...context, actions: (actions || []) as ActionRecord[], sites: (sites || []) as QhseSite[], people: (people || []) as QhsePerson[] }
}

export async function createAction(client: SupabaseClient, input: { type: 'preventive' | 'corrective'; description: string; siteId: string; assigneeId: string; dueAt: string }) {
  const context = await getOrganizationContext(client)
  const dueDate = new Date(input.dueAt)
  if (!input.type || !input.description.trim() || !input.siteId || !input.assigneeId || Number.isNaN(dueDate.getTime()) || dueDate.getTime() <= Date.now()) {
    throw new Error('Enter an action, site, assignee, and a future due date and time.')
  }
  const { error } = await client.from('actions').insert({
    organization_id: context.organizationId,
    type: input.type,
    description: input.description.trim(),
    site_id: input.siteId,
    assignee_id: input.assigneeId,
    created_by: context.userId,
    due_at: dueDate.toISOString(),
    status: 'open',
  })
  if (error) throw new Error(error.message || 'Unable to create the action.')
}

export async function reassignAction(client: SupabaseClient, actionId: string, assigneeId: string) {
  const context = await getOrganizationContext(client)
  const { data, error } = await client.from('actions').update({ assignee_id: assigneeId })
    .eq('id', actionId).eq('organization_id', context.organizationId).eq('status', 'open').select('id').maybeSingle()
  if (error || !data) throw new Error(error?.message || 'This action is no longer open and could not be reassigned.')
}

export async function resolveAction(client: SupabaseClient, action: ActionRecord, notes: string, file?: File | null) {
  const context = await getOrganizationContext(client)
  validateQhseFile(file)
  let path: string | null = null
  if (file) {
    path = `${context.organizationId}/actions/${action.id}/${context.userId}/${storageFilename(file)}`
    await storeFile(client, path, file)
  }
  const { data, error } = await client.from('actions').update({
    status: 'resolved',
    resolution_notes: notes.trim() || null,
    proof_storage_path: path,
    proof_file_name: file?.name || null,
    proof_file_type: file?.type || null,
    proof_file_size: file?.size || null,
  }).eq('id', action.id).eq('organization_id', context.organizationId).eq('status', 'open').select('id').maybeSingle()
  if (error || !data) {
    if (path) await client.storage.from(bucket).remove([path])
    throw new Error(error?.message || 'This action is no longer open and could not be resolved.')
  }
}

export async function downloadQhseFile(client: SupabaseClient, path: string, filename: string) {
  const { data, error } = await client.storage.from(bucket).download(path)
  if (error || !data) throw new Error('Unable to download this file.')
  const url = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}