export const incidentReportTypes = [
  'incident',
  'near_miss',
  'unsafe_act',
  'unsafe_condition',
  'environmental_incident',
] as const

export type IncidentReportType = (typeof incidentReportTypes)[number]

export const incidentStatuses = ['draft', 'submitted', 'under_review', 'investigation', 'corrective_action', 'pending_verification', 'closed'] as const
export type IncidentStatus = (typeof incidentStatuses)[number]

export const incidentSeverities = ['low', 'medium', 'high', 'critical'] as const
export type IncidentSeverity = (typeof incidentSeverities)[number]

export type IncidentPersonType = 'affected_person' | 'witness'

export type IncidentEvidence = {
  id: string
  organizationId: string
  incidentId: string
  storagePath: string
  originalFilename: string
  mimeType: string
  fileSize: number
  uploadedBy: string
  createdAt: string
}

export type IncidentPerson = {
  id: string
  organizationId: string
  incidentId: string
  personType: IncidentPersonType
  profileId: string | null
  fullName: string
  organizationName: string | null
  contactDetails: string | null
  createdAt: string
}

export type IncidentSummary = {
  id: string
  organizationId: string
  referenceNumber: string
  reportType: IncidentReportType
  status: IncidentStatus
  title: string
  occurredAt: string | null
  reportedAt: string | null
  siteId: string | null
  facilityId: string | null
  location: string | null
  department: string | null
  severity: string | null
  potentialSeverity: string | null
  incidentCategory: string | null
  siteName?: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type IncidentDetail = IncidentSummary & {
  description: string | null
  workActivityContext: string | null
  reportedBy: string
  contractorInvolved: boolean
  contractorOrganization: string | null
  environmentalImpact: boolean
  injuryOrIllness: boolean
  propertyDamage: boolean
  workRelated: boolean
  immediateCorrection: string | null
  priority: string | null
  gpsCoordinates: string | null
  weatherConditions: string | null
  equipmentInvolved: string | null
  peopleInvolved: string | null
  witnesses: string | null
  potentialRootCause: string | null
  digitalSignature: string | null
  accuracyConfirmed: boolean
  evidence: IncidentEvidence[]
  people: IncidentPerson[]
}

export type IncidentDraftInput = {
  reportType: IncidentReportType
  title?: string
  description?: string
  occurredAt?: string
  siteId?: string
  facilityId?: string
  location?: string
  department?: string
  workActivityContext?: string
  severity?: string
  potentialSeverity?: string
  incidentCategory?: string
  contractorInvolved?: boolean
  contractorOrganization?: string
  environmentalImpact?: boolean
  injuryOrIllness?: boolean
  propertyDamage?: boolean
  workRelated?: boolean
  immediateCorrection?: string
  priority?: string
  gpsCoordinates?: string
  weatherConditions?: string
  equipmentInvolved?: string
  peopleInvolved?: string
  witnesses?: string
  potentialRootCause?: string
  digitalSignature?: string
  accuracyConfirmed?: boolean
}

export type IncidentSubmissionInput = IncidentDraftInput & {
  title: string
  description: string
  occurredAt: string
  siteId: string
  location: string
  severity: string
}

export type IncidentListFilters = {
  search?: string
  status?: IncidentStatus | 'all'
  reportType?: IncidentReportType | 'all'
  severity?: string | 'all'
  siteId?: string | 'all'
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}
