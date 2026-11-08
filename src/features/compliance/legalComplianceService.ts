import type { SupabaseClient } from '@supabase/supabase-js'
import { getDocumentUploadMimeType } from '../../lib/documentUpload'

const LEGAL_COMPLIANCE_BUCKET = 'legal-compliance-documents'

export type ComplianceCategory = 'license' | 'permit' | 'approval' | 'certification' | 'other'
export type ComplianceScopeType = 'organization' | 'site' | 'department'
export type ComplianceStatus = 'not_assessed' | 'compliant' | 'non_compliant' | 'under_review'

export interface LegalComplianceObligation {
  id: string
  organization_id: string
  obligation_name: string
  category: ComplianceCategory
  issuing_authority: string
  scope_type: ComplianceScopeType
  site_id: string | null
  department: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  active_version: LegalComplianceVersion
  versions: LegalComplianceVersion[]
}

export interface LegalComplianceVersion {
  id: string
  organization_id: string
  obligation_id: string
  version_number: number
  is_active: boolean
  lifecycle_status: 'draft' | 'active' | 'superseded' | 'abandoned'
  issue_date: string
  expiry_date: string | null
  responsible_person_id: string
  compliance_status: ComplianceStatus
  document_path: string | null
  document_name: string | null
  document_mime_type: string | null
  document_size: number | null
  uploaded_by: string | null
  uploaded_at: string
  created_at: string
}

export interface LegalComplianceDraft {
  obligation_name: string
  category: ComplianceCategory
  issuing_authority: string
  scope_type: ComplianceScopeType
  site_id: string | null
  department: string | null
  issue_date: string
  expiry_date: string
  responsible_person_id: string
  compliance_status: ComplianceStatus
}

export interface ComplianceDocumentInput {
  path: string
  name: string
  mimeType: string
  size: number
}

export type ComplianceExpiryState = 'no_expiry' | 'valid' | 'expiring_soon' | 'expired'

export interface LegalComplianceSummary {
  total: number
  valid: number
  expiring_soon: number
  expired: number
}

export const legalComplianceSummaryUpdatedEvent = 'legal-compliance-summary-updated'

function notifyLegalComplianceSummaryUpdated(organizationId: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(legalComplianceSummaryUpdatedEvent, {
      detail: { organizationId },
    }))
  }
}

export function getComplianceExpiryState(expiryDate: string | null, today = new Date()): {
  state: ComplianceExpiryState
  daysRemaining: number | null
} {
  if (!expiryDate) return { state: 'no_expiry', daysRemaining: null }
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const expiry = new Date(`${expiryDate}T00:00:00.000Z`).getTime()
  const daysRemaining = Math.round((expiry - todayUtc) / 86_400_000)
  return {
    state: daysRemaining < 0 ? 'expired' : daysRemaining <= 30 ? 'expiring_soon' : 'valid',
    daysRemaining,
  }
}

export async function getLegalComplianceSummary(client: SupabaseClient, organizationId: string): Promise<LegalComplianceSummary> {
  const { data, error } = await client.rpc('get_legal_compliance_obligation_summary', {
    p_organization_id: organizationId,
  })
  if (error) throw new Error(error.message || 'Unable to load the Legal and Compliance summary.')

  const summary = data?.[0]
  if (!summary) throw new Error('The Legal and Compliance summary was not returned.')
  const counts = [summary.total, summary.valid, summary.expiring_soon, summary.expired]
  if (counts.some((count) => typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)) {
    throw new Error('The Legal and Compliance summary contains invalid counts.')
  }

  return {
    total: summary.total,
    valid: summary.valid,
    expiring_soon: summary.expiring_soon,
    expired: summary.expired,
  }
}

export async function getLegalComplianceCapabilities(client: SupabaseClient, organizationId: string) {
  const [viewResponse, manageResponse] = await Promise.all([
    client.rpc('has_org_permission', { p_organization_id: organizationId, p_permission: 'view_legal_compliance_register' }),
    client.rpc('has_org_permission', { p_organization_id: organizationId, p_permission: 'manage_legal_compliance_obligations' }),
  ])
  if (viewResponse.error || manageResponse.error) throw new Error('Unable to verify Legal and Compliance Register permissions.')
  return { canView: viewResponse.data === true, canManage: manageResponse.data === true }
}

export async function listLegalComplianceObligations(client: SupabaseClient, organizationId: string): Promise<LegalComplianceObligation[]> {
  const { data: obligations, error: obligationsError } = await client
    .from('legal_compliance_obligations')
    .select('id, organization_id, obligation_name, category, issuing_authority, scope_type, site_id, department, created_at, updated_at, deleted_at')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
  if (obligationsError) throw new Error(obligationsError.message || 'Unable to load legal and compliance obligations.')
  if (!obligations?.length) return []

  const obligationIds = obligations.map((obligation) => obligation.id)
  const { data: versions, error: versionsError } = await client
    .from('legal_compliance_obligation_versions')
    .select('id, organization_id, obligation_id, version_number, is_active, lifecycle_status, issue_date, expiry_date, responsible_person_id, compliance_status, document_path, document_name, document_mime_type, document_size, uploaded_by, uploaded_at, created_at')
    .eq('organization_id', organizationId)
    .in('obligation_id', obligationIds)
    .in('lifecycle_status', ['active', 'superseded'])
    .order('version_number', { ascending: false })
  if (versionsError) throw new Error(versionsError.message || 'Unable to load obligation version history.')
  const versionsByObligation = new Map<string, LegalComplianceVersion[]>()
  for (const rawVersion of versions || []) {
    const version = rawVersion as LegalComplianceVersion
    versionsByObligation.set(version.obligation_id, [...(versionsByObligation.get(version.obligation_id) || []), version])
  }
  return (obligations || []).flatMap((obligation) => {
    const versions = versionsByObligation.get(obligation.id) || []
    const activeVersion = versions.find((version) => version.lifecycle_status === 'active' && version.is_active)
    if (!activeVersion) return []
    return [{
      ...obligation,
      active_version: activeVersion,
      versions: [activeVersion, ...versions.filter((version) => version.id !== activeVersion.id)],
    } as LegalComplianceObligation]
  })
}

export async function saveLegalComplianceObligation(
  client: SupabaseClient,
  organizationId: string,
  userId: string,
  draft: LegalComplianceDraft,
  obligationId?: string,
  document?: ComplianceDocumentInput,
): Promise<LegalComplianceObligation> {
  const parentValues = {
    organization_id: organizationId,
    obligation_name: draft.obligation_name.trim(),
    category: draft.category,
    issuing_authority: draft.issuing_authority.trim(),
    scope_type: draft.scope_type,
    site_id: draft.scope_type === 'site' ? draft.site_id : null,
    department: draft.scope_type === 'department' ? draft.department?.trim() || null : null,
    deleted_at: null,
  }
  let parent: Record<string, unknown>
  if (obligationId) {
    const { data, error } = await client.from('legal_compliance_obligations')
      .update(parentValues)
      .eq('id', obligationId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .select('*')
      .single()
    if (error || !data) throw new Error(error?.message || 'Unable to update the obligation.')
    parent = data as Record<string, unknown>
    const { data: version, error: versionError } = await client.from('legal_compliance_obligation_versions')
      .update({
        issue_date: draft.issue_date,
        expiry_date: draft.expiry_date || null,
        responsible_person_id: draft.responsible_person_id,
        compliance_status: draft.compliance_status,
        ...(document ? {
          document_path: document.path,
          document_name: document.name,
          document_mime_type: document.mimeType,
          document_size: document.size,
          uploaded_by: userId,
          uploaded_at: new Date().toISOString(),
        } : {}),
      })
      .eq('organization_id', organizationId)
      .eq('obligation_id', obligationId)
      .eq('is_active', true)
      .select('*')
      .single()
    if (versionError || !version) throw new Error(versionError?.message || 'Unable to update the active obligation version.')
    notifyLegalComplianceSummaryUpdated(organizationId)
    return { ...parent, active_version: version } as LegalComplianceObligation
  }

  const { data: createdParent, error: parentError } = await client.from('legal_compliance_obligations')
    .insert({ ...parentValues, created_by: userId })
    .select('*')
    .single()
  if (parentError || !createdParent) throw new Error(parentError?.message || 'Unable to create the obligation.')
  parent = createdParent as Record<string, unknown>
  const { data: createdVersion, error: versionError } = await client.from('legal_compliance_obligation_versions')
    .insert({
      organization_id: organizationId,
      obligation_id: createdParent.id,
      version_number: 1,
      is_active: true,
      issue_date: draft.issue_date,
      expiry_date: draft.expiry_date || null,
      responsible_person_id: draft.responsible_person_id,
      compliance_status: draft.compliance_status,
      uploaded_by: userId,
    })
    .select('*')
    .single()
  if (versionError || !createdVersion) {
    const { error: cleanupError } = await client.from('legal_compliance_obligations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', createdParent.id)
      .eq('organization_id', organizationId)
    if (cleanupError) throw new Error('The obligation was created but its initial version could not be saved or cleaned up. Contact your Super Admin.')
    throw new Error(versionError?.message || 'Unable to create the initial obligation version.')
  }
  notifyLegalComplianceSummaryUpdated(organizationId)
  return { ...parent, active_version: createdVersion } as LegalComplianceObligation
}

export function validateLegalComplianceDocument(file: File): void {
  getDocumentUploadMimeType(file)
}

export async function uploadLegalComplianceDocument(
  client: SupabaseClient,
  organizationId: string,
  obligationId: string,
  versionId: string,
  file: File,
): Promise<ComplianceDocumentInput> {
  validateLegalComplianceDocument(file)
  const mimeType = getDocumentUploadMimeType(file)
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${organizationId}/${obligationId}/${versionId}/${crypto.randomUUID()}-${safeFilename}`
  const { error } = await client.storage.from(LEGAL_COMPLIANCE_BUCKET).upload(path, file, { upsert: false, contentType: mimeType })
  if (error) throw new Error(error.message || 'Unable to upload the supporting document.')
  return { path, name: file.name, mimeType, size: file.size }
}

export async function setLegalComplianceDocument(
  client: SupabaseClient,
  organizationId: string,
  versionId: string,
  document: ComplianceDocumentInput | null,
  uploadedBy: string,
): Promise<void> {
  const { error } = await client.from('legal_compliance_obligation_versions')
    .update({
      document_path: document?.path ?? null,
      document_name: document?.name ?? null,
      document_mime_type: document?.mimeType ?? null,
      document_size: document?.size ?? null,
      uploaded_by: document ? uploadedBy : null,
      uploaded_at: new Date().toISOString(),
    })
    .eq('id', versionId)
    .eq('organization_id', organizationId)
    .select('id')
    .single()
  if (error) throw new Error(error.message || 'Unable to save supporting document details.')
}

export async function removeLegalComplianceDocument(client: SupabaseClient, path: string): Promise<void> {
  const { error } = await client.storage.from(LEGAL_COMPLIANCE_BUCKET).remove([path])
  if (error) throw new Error(error.message || 'Unable to remove the supporting document.')
}

export async function downloadLegalComplianceDocument(
  client: SupabaseClient,
  record: LegalComplianceObligation,
): Promise<{ blob: Blob; filename: string }> {
  return downloadLegalComplianceVersionDocument(client, record.active_version)
}

export async function downloadLegalComplianceVersionDocument(
  client: SupabaseClient,
  version: LegalComplianceVersion,
): Promise<{ blob: Blob; filename: string }> {
  const { document_path: path, document_name: filename } = version
  if (!path || !filename) throw new Error('No supporting document is attached.')
  const { data, error } = await client.storage.from(LEGAL_COMPLIANCE_BUCKET).download(path)
  if (error || !data) throw new Error(error?.message || 'Unable to download the supporting document.')
  return { blob: data, filename }
}

export async function beginLegalComplianceRenewal(client: SupabaseClient, organizationId: string, obligationId: string, draft: LegalComplianceDraft): Promise<LegalComplianceVersion> {
  const { data, error } = await client.rpc('begin_legal_compliance_renewal', {
    p_organization_id: organizationId,
    p_obligation_id: obligationId,
    p_issue_date: draft.issue_date,
    p_expiry_date: draft.expiry_date || null,
    p_responsible_person_id: draft.responsible_person_id,
    p_compliance_status: draft.compliance_status,
  })
  if (error || !data) throw new Error(error?.message || 'Unable to start the compliance renewal.')
  return data as LegalComplianceVersion
}

export async function activateLegalComplianceRenewal(client: SupabaseClient, organizationId: string, obligationId: string, versionId: string): Promise<LegalComplianceVersion> {
  const { data, error } = await client.rpc('activate_legal_compliance_renewal', {
    p_organization_id: organizationId,
    p_obligation_id: obligationId,
    p_version_id: versionId,
  })
  if (error || !data) throw new Error(error?.message || 'Unable to activate the compliance renewal.')
  notifyLegalComplianceSummaryUpdated(organizationId)
  return data as LegalComplianceVersion
}

export async function abandonLegalComplianceRenewal(client: SupabaseClient, organizationId: string, obligationId: string, versionId: string): Promise<void> {
  const { error } = await client.rpc('abandon_legal_compliance_renewal', {
    p_organization_id: organizationId,
    p_obligation_id: obligationId,
    p_version_id: versionId,
  })
  if (error) throw new Error(error.message || 'Unable to discard the unfinished renewal.')
}

export async function softDeleteLegalComplianceObligation(
  client: SupabaseClient,
  organizationId: string,
  obligationId: string,
): Promise<void> {
  const { error } = await client.from('legal_compliance_obligations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', obligationId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
  if (error) throw new Error(error.message || 'Unable to delete the obligation.')
  notifyLegalComplianceSummaryUpdated(organizationId)
}