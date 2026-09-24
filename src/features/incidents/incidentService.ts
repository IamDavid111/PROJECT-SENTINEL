import type { SupabaseClient } from '@supabase/supabase-js'

import { incidentEvidenceMetadataSchema, incidentSubmissionSchema } from './incidentSchemas'
import type { IncidentDetail, IncidentDraftInput, IncidentEvidence, IncidentListFilters, IncidentListScope, IncidentPerson, IncidentStatus, IncidentSummary, IncidentSubmissionInput } from './incidentTypes'

const defaultPageSize = 25
const megabyte = 1024 * 1024
const totalEvidenceLimit = 250 * megabyte
const photoLimit = 10 * megabyte
const videoLimit = 100 * megabyte
const documentLimit = 15 * megabyte

type OrganizationContext = {
  userId: string
  organizationId: string
}

type IncidentRow = {
  id: string
  organization_id: string
  reference_number: string
  report_type: IncidentSummary['reportType']
  status: IncidentStatus
  title: string
  description: string | null
  occurred_at: string | null
  reported_at: string | null
  site_id: string | null
  facility_id: string | null
  location: string | null
  department: string | null
  shift: string | null
  work_activity_context: string | null
  reported_by: string
  created_by: string
  contractor_involved: boolean
  contractor_organization: string | null
  severity: string | null
  potential_severity: string | null
  incident_category: string | null
  priority: string | null
  gps_coordinates: string | null
  weather_conditions: string | null
  equipment_involved: string | null
  people_involved: string | null
  witnesses: string | null
  potential_root_cause: string | null
  digital_signature: string | null
  accuracy_confirmed: boolean
  environmental_impact: boolean
  injury_or_illness: boolean
  property_damage: boolean
  work_related: boolean
  immediate_correction: string | null
  created_at: string
  updated_at: string
}

type IncidentPersonRow = {
  id: string
  organization_id: string
  incident_id: string
  person_type: IncidentPerson['personType']
  profile_id: string | null
  full_name: string
  organization_name: string | null
  contact_details: string | null
  created_at: string
}

type IncidentEvidenceRow = {
  id: string
  organization_id: string
  incident_id: string
  storage_path: string
  original_filename: string
  mime_type: string
  file_size: number
  uploaded_by: string
  created_at: string
}

export type IncidentListResult = {
  items: IncidentSummary[]
  page: number
  pageSize: number
  total: number
}

export type IncidentActivity = {
  id: string
  activity: string
  metadata: Record<string, unknown>
  userId: string | null
  createdAt: string
  location: string | null
}

function toIncidentSummary(row: IncidentRow): IncidentSummary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    referenceNumber: row.reference_number,
    reportType: row.report_type,
    status: row.status,
    title: row.title,
    occurredAt: row.occurred_at,
    reportedAt: row.reported_at,
    siteId: row.site_id,
    facilityId: row.facility_id,
    location: row.location,
    department: row.department,
    shift: row.shift,
    severity: row.severity,
    potentialSeverity: row.potential_severity,
    incidentCategory: row.incident_category,
    siteName: null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toIncidentEvidence(row: IncidentEvidenceRow): IncidentEvidence {
  return {
    id: row.id,
    organizationId: row.organization_id,
    incidentId: row.incident_id,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  }
}

function toIncidentPerson(row: IncidentPersonRow): IncidentPerson {
  return {
    id: row.id,
    organizationId: row.organization_id,
    incidentId: row.incident_id,
    personType: row.person_type,
    profileId: row.profile_id,
    fullName: row.full_name,
    organizationName: row.organization_name,
    contactDetails: row.contact_details,
    createdAt: row.created_at,
  }
}

function escapeSearch(value: string) {
  return value.replace(/[%,().]/g, (character) => `\\${character}`)
}

export async function getOrganizationContext(client: SupabaseClient): Promise<OrganizationContext> {
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError || !user) throw new Error('Your session is no longer valid.')

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()
  if (profileError || !profile?.organization_id) throw new Error('Your account is not assigned to an organization.')

  const { data: membership, error: membershipError } = await client
    .from('memberships')
    .select('id')
    .eq('user_id', user.id)
    .eq('organization_id', profile.organization_id)
    .maybeSingle()
  if (membershipError || !membership) throw new Error('You do not have access to this organization.')

  return { userId: user.id, organizationId: profile.organization_id }
}

export async function getIncidents(client: SupabaseClient, filters: IncidentListFilters = {}, scope: IncidentListScope = 'organization'): Promise<IncidentListResult> {
  const context = await getOrganizationContext(client)
  const page = filters.page || 1
  const pageSize = filters.pageSize || defaultPageSize
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  let query = client
    .from('incidents')
    .select('id, organization_id, reference_number, report_type, status, title, description, occurred_at, reported_at, site_id, facility_id, location, department, shift, work_activity_context, reported_by, created_by, contractor_involved, contractor_organization, severity, potential_severity, incident_category, environmental_impact, injury_or_illness, property_damage, work_related, immediate_correction, priority, gps_coordinates, weather_conditions, equipment_involved, people_involved, witnesses, potential_root_cause, digital_signature, accuracy_confirmed, created_at, updated_at', { count: 'exact' })
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (scope === 'own') query = query.or(`created_by.eq.${context.userId},reported_by.eq.${context.userId}`)

  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.reportType && filters.reportType !== 'all') query = query.eq('report_type', filters.reportType)
  if (filters.incidentCategory && filters.incidentCategory !== 'all') query = query.eq('incident_category', filters.incidentCategory)
  if (filters.severity && filters.severity !== 'all') query = query.eq('severity', filters.severity)
  if (filters.siteId && filters.siteId !== 'all') query = query.eq('site_id', filters.siteId)
  if (filters.department && filters.department !== 'all') query = query.eq('department', filters.department)
  if (filters.search) {
    const search = escapeSearch(filters.search)
    query = query.or(`reference_number.ilike.%${search}%,title.ilike.%${search}%,location.ilike.%${search}%`)
  }
  if (filters.dateFrom) query = query.gte('occurred_at', `${filters.dateFrom}T00:00:00.000Z`)
  if (filters.dateTo) query = query.lte('occurred_at', `${filters.dateTo}T23:59:59.999Z`)

  const { data, error, count } = await query
  if (error) throw new Error('Unable to load incident reports.')
  return { items: (data || []).map(toIncidentSummary), page, pageSize, total: count || 0 }
}

export async function getIncident(client: SupabaseClient, incidentId: string): Promise<IncidentDetail> {
  const context = await getOrganizationContext(client)
  const { data: incident, error: incidentError } = await client
    .from('incidents')
    .select('*')
    .eq('id', incidentId)
    .eq('organization_id', context.organizationId)
    .single()
  if (incidentError || !incident) throw new Error('Incident report not found.')

  const [{ data: people, error: peopleError }, { data: evidence, error: evidenceError }] = await Promise.all([
    client.from('incident_people').select('*').eq('incident_id', incidentId).eq('organization_id', context.organizationId).order('created_at'),
    client.from('incident_evidence').select('*').eq('incident_id', incidentId).eq('organization_id', context.organizationId).order('created_at'),
  ])
  if (peopleError || evidenceError) throw new Error('Unable to load incident details.')

  return {
    ...toIncidentSummary(incident as IncidentRow),
    description: incident.description,
    workActivityContext: incident.work_activity_context,
    shift: incident.shift,
    reportedBy: incident.reported_by,
    contractorInvolved: incident.contractor_involved,
    contractorOrganization: incident.contractor_organization,
    environmentalImpact: incident.environmental_impact,
    injuryOrIllness: incident.injury_or_illness,
    propertyDamage: incident.property_damage,
    workRelated: incident.work_related,
    immediateCorrection: incident.immediate_correction,
    priority: incident.priority,
    gpsCoordinates: incident.gps_coordinates,
    weatherConditions: incident.weather_conditions,
    equipmentInvolved: incident.equipment_involved,
    peopleInvolved: incident.people_involved,
    witnesses: incident.witnesses,
    potentialRootCause: incident.potential_root_cause,
    digitalSignature: incident.digital_signature,
    accuracyConfirmed: incident.accuracy_confirmed,
    evidence: (evidence || []).map(toIncidentEvidence),
    people: (people || []).map(toIncidentPerson),
  }
}

function toIncidentPayload(input: IncidentDraftInput) {
  return {
    report_type: input.reportType,
    title: input.title || 'Untitled draft',
    description: input.description || null,
    occurred_at: input.occurredAt || null,
    site_id: input.siteId || null,
    facility_id: input.facilityId || null,
    location: input.location || null,
    department: input.department || null,
    shift: input.shift || null,
    work_activity_context: input.workActivityContext || null,
    contractor_involved: input.contractorInvolved || false,
    contractor_organization: input.contractorOrganization || null,
    severity: input.severity || null,
    potential_severity: input.potentialSeverity || null,
    incident_category: input.incidentCategory || null,
    environmental_impact: input.environmentalImpact || false,
    injury_or_illness: input.injuryOrIllness || false,
    property_damage: input.propertyDamage || false,
    work_related: input.workRelated ?? true,
    immediate_correction: input.immediateCorrection || null,
    priority: input.priority || null,
    gps_coordinates: input.gpsCoordinates || null,
    weather_conditions: input.weatherConditions || null,
    equipment_involved: input.equipmentInvolved || null,
    people_involved: input.peopleInvolved || null,
    witnesses: input.witnesses || null,
    potential_root_cause: input.potentialRootCause || null,
    digital_signature: input.digitalSignature || null,
    accuracy_confirmed: input.accuracyConfirmed || false,
  }
}

export async function createIncidentDraft(client: SupabaseClient, input: IncidentDraftInput, options: { clientSubmissionId?: string } = {}): Promise<IncidentSummary> {
  const context = await getOrganizationContext(client)
  if (options.clientSubmissionId) {
    const { data: existing, error: existingError } = await client
      .from('incidents')
      .select('*')
      .eq('organization_id', context.organizationId)
      .eq('client_submission_id', options.clientSubmissionId)
      .maybeSingle()
    if (existingError) throw new Error('Unable to check the queued incident submission.')
    if (existing) return toIncidentSummary(existing as IncidentRow)
  }
  const payload = {
    organization_id: context.organizationId,
    reported_by: context.userId,
    created_by: context.userId,
    status: 'draft',
    ...toIncidentPayload(input),
    ...(options.clientSubmissionId ? { client_submission_id: options.clientSubmissionId } : {}),
  }
  const { data, error } = await client.from('incidents').insert(payload).select('*').single()
  if (error || !data) throw new Error(error?.message || 'Unable to save the incident draft.')
  await client.from('activity_logs').insert({ organization_id: context.organizationId, user_id: context.userId, activity: 'Incident draft created', metadata: { incident_id: data.id } })
  return toIncidentSummary(data as IncidentRow)
}

export async function updateIncidentDraft(client: SupabaseClient, incidentId: string, input: IncidentDraftInput): Promise<IncidentSummary> {
  const context = await getOrganizationContext(client)
  const { data, error } = await client.from('incidents').update(toIncidentPayload(input)).eq('id', incidentId).eq('organization_id', context.organizationId).eq('created_by', context.userId).eq('status', 'draft').select('*').single()
  if (error || !data) throw new Error(error?.message || 'Unable to update the incident draft.')
  await client.from('activity_logs').insert({ organization_id: context.organizationId, user_id: context.userId, activity: 'Incident draft updated', metadata: { incident_id: incidentId } })
  await client.from('activity_logs').insert({ organization_id: context.organizationId, user_id: context.userId, activity: 'Incident updated', metadata: { incident_id: incidentId, status: 'draft' } })
  return toIncidentSummary(data as IncidentRow)
}

export async function submitIncident(client: SupabaseClient, incidentId: string, input: IncidentSubmissionInput): Promise<IncidentSummary> {
  const validated = incidentSubmissionSchema.safeParse(input)
  if (!validated.success) throw new Error(validated.error.issues[0]?.message || 'Incident submission is invalid.')
  const context = await getOrganizationContext(client)
  const { data, error } = await client.from('incidents').update({ ...toIncidentPayload(validated.data), status: 'submitted', reported_at: new Date().toISOString() }).eq('id', incidentId).eq('organization_id', context.organizationId).eq('created_by', context.userId).eq('status', 'draft').select('*').single()
  if (error || !data) throw new Error(error?.message || 'Unable to submit the incident report.')
  await client.from('activity_logs').insert({ organization_id: context.organizationId, user_id: context.userId, activity: 'Incident submitted', metadata: { incident_id: incidentId, report_type: validated.data.reportType } })
  await client.from('activity_logs').insert({ organization_id: context.organizationId, user_id: context.userId, activity: 'Incident status changed', metadata: { incident_id: incidentId, from_status: 'draft', to_status: 'submitted' } })
  return toIncidentSummary(data as IncidentRow)
}

export async function submitNewIncident(client: SupabaseClient, input: IncidentSubmissionInput): Promise<IncidentSummary> {
  const validated = incidentSubmissionSchema.safeParse(input)
  if (!validated.success) throw new Error(validated.error.issues[0]?.message || 'Incident submission is invalid.')
  const { data, error } = await client.rpc('submit_new_incident', { p_input: validated.data }).single()
  if (error || !data) throw new Error(error?.message || 'Unable to submit the incident report.')
  return toIncidentSummary(data as IncidentRow)
}

export async function uploadIncidentEvidence(client: SupabaseClient, incidentId: string, file: File): Promise<IncidentEvidence> {
  const context = await getOrganizationContext(client)
  const metadata = incidentEvidenceMetadataSchema.safeParse({ incidentId, originalFilename: file.name, mimeType: file.type, fileSize: file.size })
  if (!metadata.success) throw new Error(metadata.error.issues[0]?.message || 'Evidence file is invalid.')
  const fileLimit = file.type.startsWith('image/') ? photoLimit : file.type.startsWith('video/') ? videoLimit : documentLimit
  const fileLimitLabel = file.type.startsWith('image/') ? '10 MB' : file.type.startsWith('video/') ? '100 MB' : '15 MB'
  if (file.size > fileLimit) throw new Error(`This file is too large. ${file.type.startsWith('image/') ? 'Photos' : file.type.startsWith('video/') ? 'Videos' : 'Documents'} must be ${fileLimitLabel} or smaller.`)
  const { data: existingEvidence, error: evidenceLookupError } = await client
    .from('incident_evidence')
    .select('file_size')
    .eq('incident_id', incidentId)
    .eq('organization_id', context.organizationId)
  if (evidenceLookupError) throw new Error('Unable to verify the incident attachment limit.')
  const existingTotal = (existingEvidence || []).reduce((total, evidence) => total + Number(evidence.file_size || 0), 0)
  if (existingTotal + file.size > totalEvidenceLimit) throw new Error('This upload would exceed the 250 MB total attachment limit for this incident.')
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${context.organizationId}/${incidentId}/${context.userId}/${crypto.randomUUID()}-${safeFilename}`
  const { error: uploadError } = await client.storage.from('incident-evidence').upload(storagePath, file, { upsert: false, contentType: file.type })
  if (uploadError) throw new Error('Unable to upload incident evidence.')
  const { data, error } = await client.from('incident_evidence').insert({ organization_id: context.organizationId, incident_id: incidentId, storage_path: storagePath, original_filename: file.name, mime_type: file.type, file_size: file.size, uploaded_by: context.userId }).select('*').single()
  if (error || !data) {
    await client.storage.from('incident-evidence').remove([storagePath])
    throw new Error('Unable to record incident evidence.')
  }
  await client.from('activity_logs').insert({ organization_id: context.organizationId, user_id: context.userId, activity: 'Incident evidence uploaded', metadata: { incident_id: incidentId, evidence_id: data.id } })
  return toIncidentEvidence(data as IncidentEvidenceRow)
}

export async function deleteIncidentEvidence(client: SupabaseClient, evidenceId: string): Promise<void> {
  const context = await getOrganizationContext(client)
  const { data: evidence, error: evidenceError } = await client.from('incident_evidence').select('id, incident_id, storage_path').eq('id', evidenceId).eq('organization_id', context.organizationId).single()
  if (evidenceError || !evidence) throw new Error('Evidence not found.')
  const { error: storageError } = await client.storage.from('incident-evidence').remove([evidence.storage_path])
  if (storageError) throw new Error('Unable to remove evidence file.')
  const { error: deleteError } = await client.from('incident_evidence').delete().eq('id', evidenceId).eq('organization_id', context.organizationId)
  if (deleteError) throw new Error('Unable to remove evidence metadata.')
  await client.from('activity_logs').insert({ organization_id: context.organizationId, user_id: context.userId, activity: 'Incident evidence removed', metadata: { incident_id: evidence.incident_id, evidence_id: evidenceId } })
}

export async function downloadIncidentEvidence(client: SupabaseClient, evidenceId: string): Promise<{ blob: Blob; filename: string }> {
  const context = await getOrganizationContext(client)
  const { data: evidence, error: evidenceError } = await client
    .from('incident_evidence')
    .select('storage_path, original_filename, incident_id')
    .eq('id', evidenceId)
    .eq('organization_id', context.organizationId)
    .single()
  if (evidenceError || !evidence) throw new Error('Evidence not found or unavailable.')
  const { data, error: downloadError } = await client.storage.from('incident-evidence').download(evidence.storage_path)
  if (downloadError || !data) throw new Error('Unable to download evidence.')
  await client.from('activity_logs').insert({ organization_id: context.organizationId, user_id: context.userId, activity: 'Incident evidence downloaded', metadata: { incident_id: evidence.incident_id, evidence_id: evidenceId } })
  return { blob: data, filename: evidence.original_filename }
}

export async function getIncidentEvidence(client: SupabaseClient, incidentId: string): Promise<IncidentEvidence[]> {
  const context = await getOrganizationContext(client)
  const { data, error } = await client.from('incident_evidence').select('*').eq('incident_id', incidentId).eq('organization_id', context.organizationId).order('created_at')
  if (error) throw new Error('Unable to load incident evidence.')
  return (data || []).map(toIncidentEvidence)
}

export async function getIncidentActivity(client: SupabaseClient, incidentId: string): Promise<IncidentActivity[]> {
  const context = await getOrganizationContext(client)
  const { data, error } = await client.from('activity_logs').select('id, activity, metadata, user_id, created_at, location').eq('organization_id', context.organizationId).contains('metadata', { incident_id: incidentId }).order('created_at', { ascending: false }).limit(100)
  if (error) throw new Error('Unable to load incident activity.')
  return (data || []).map((item) => ({ id: item.id, activity: item.activity, metadata: item.metadata as Record<string, unknown>, userId: item.user_id, createdAt: item.created_at, location: item.location }))
}
