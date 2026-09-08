import type { IncidentListFilters } from './incidentTypes'

export const incidentQueryKeys = {
  all: ['incidents'] as const,
  organization: (organizationId: string) => ['incidents', 'organization', organizationId] as const,
  list: (organizationId: string, filters: IncidentListFilters) => ['incidents', 'list', organizationId, filters] as const,
  detail: (organizationId: string, incidentId: string) => ['incidents', 'detail', organizationId, incidentId] as const,
  evidence: (organizationId: string, incidentId: string) => ['incidents', 'evidence', organizationId, incidentId] as const,
  activity: (organizationId: string, incidentId: string) => ['incidents', 'activity', organizationId, incidentId] as const,
}
