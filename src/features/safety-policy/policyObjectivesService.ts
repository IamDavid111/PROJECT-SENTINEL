import type { SupabaseClient } from '@supabase/supabase-js'

const POLICY_OBJECTIVES_BUCKET = 'hsse-policy-documents'
const MAX_DOCUMENT_SIZE = 100 * 1024 * 1024
const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
])

export type PolicyObjectiveType = 'policy' | 'objective'

export interface PolicyObjectiveRecord {
  id: string
  organization_id: string
  item_type: PolicyObjectiveType
  title: string
  description: string
  performance_target: string
  baseline_value: string
  approval_status: 'approved'
  document_path: string | null
  document_name: string | null
  document_mime_type: string | null
  document_size: number | null
  created_at: string
  updated_at: string
}

export interface PolicyObjectiveDraft {
  item_type: PolicyObjectiveType
  title: string
  description: string
  performance_target: string
  baseline_value: string
}

export async function getPolicyObjectivesCapabilities(client: SupabaseClient, organizationId: string) {
  const [viewResponse, manageResponse] = await Promise.all([
    client.rpc('has_org_permission', { p_organization_id: organizationId, p_permission: 'view_policy_objectives_register' }),
    client.rpc('has_org_permission', { p_organization_id: organizationId, p_permission: 'manage_policy_objectives' }),
  ])
  if (viewResponse.error || manageResponse.error) throw new Error('Unable to verify Policy and Objectives permissions.')
  return { canView: viewResponse.data === true, canManage: manageResponse.data === true }
}

export async function listPolicyObjectives(client: SupabaseClient, organizationId: string): Promise<PolicyObjectiveRecord[]> {
  const { data, error } = await client
    .from('organization_policy_objectives')
    .select('id, organization_id, item_type, title, description, performance_target, baseline_value, approval_status, document_path, document_name, document_mime_type, document_size, created_at, updated_at')
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message || 'Unable to load Policy and Objectives records.')
  return (data || []) as PolicyObjectiveRecord[]
}

export async function savePolicyObjective(
  client: SupabaseClient,
  organizationId: string,
  draft: PolicyObjectiveDraft,
  recordId?: string,
): Promise<PolicyObjectiveRecord> {
  const values = {
    organization_id: organizationId,
    item_type: draft.item_type,
    title: draft.title.trim(),
    description: draft.description.trim(),
    performance_target: draft.performance_target.trim(),
    baseline_value: draft.baseline_value.trim(),
    approval_status: 'approved',
  }
  const query = recordId
    ? client.from('organization_policy_objectives').update(values).eq('id', recordId).eq('organization_id', organizationId)
    : client.from('organization_policy_objectives').insert(values)
  const { data, error } = await query.select('*').single()
  if (error || !data) throw new Error(error?.message || 'Unable to save the Policy and Objectives record.')
  return data as PolicyObjectiveRecord
}

export function validatePolicyObjectiveDocument(file: File): void {
  if (!ALLOWED_DOCUMENT_TYPES.has(file.type)) {
    throw new Error('Choose a PDF, Word document, spreadsheet, or plain-text file.')
  }
  if (file.size > MAX_DOCUMENT_SIZE) throw new Error('Supporting documents must be 100 MB or smaller.')
}

export async function uploadPolicyObjectiveDocument(
  client: SupabaseClient,
  organizationId: string,
  recordId: string,
  file: File,
): Promise<{ path: string; name: string; mimeType: string; size: number }> {
  validatePolicyObjectiveDocument(file)
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${organizationId}/${recordId}/${crypto.randomUUID()}-${safeFilename}`
  const { error } = await client.storage.from(POLICY_OBJECTIVES_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type,
  })
  if (error) throw new Error(error.message || 'Unable to upload the supporting document.')
  return { path, name: file.name, mimeType: file.type, size: file.size }
}

export async function setPolicyObjectiveDocument(
  client: SupabaseClient,
  organizationId: string,
  recordId: string,
  document: { path: string; name: string; mimeType: string; size: number } | null,
): Promise<void> {
  const { error } = await client
    .from('organization_policy_objectives')
    .update({
      document_path: document?.path ?? null,
      document_name: document?.name ?? null,
      document_mime_type: document?.mimeType ?? null,
      document_size: document?.size ?? null,
    })
    .eq('id', recordId)
    .eq('organization_id', organizationId)
    .select('id')
    .single()
  if (error) throw new Error(error.message || 'Unable to update the supporting document.')
}

export async function removePolicyObjectiveDocument(client: SupabaseClient, path: string): Promise<void> {
  const { error } = await client.storage.from(POLICY_OBJECTIVES_BUCKET).remove([path])
  if (error) throw new Error(error.message || 'Unable to remove the supporting document.')
}

export async function deletePolicyObjective(client: SupabaseClient, record: PolicyObjectiveRecord): Promise<void> {
  if (record.document_path) await removePolicyObjectiveDocument(client, record.document_path)
  const { error } = await client
    .from('organization_policy_objectives')
    .delete()
    .eq('id', record.id)
    .eq('organization_id', record.organization_id)
  if (error) throw new Error(error.message || 'Unable to delete the Policy and Objectives record.')
}

export async function downloadPolicyObjectiveDocument(
  client: SupabaseClient,
  record: PolicyObjectiveRecord,
): Promise<{ blob: Blob; filename: string }> {
  if (!record.document_path || !record.document_name) throw new Error('No supporting document is attached.')
  const { data, error } = await client.storage.from(POLICY_OBJECTIVES_BUCKET).download(record.document_path)
  if (error || !data) throw new Error(error?.message || 'Unable to download the supporting document.')
  return { blob: data, filename: record.document_name }
}