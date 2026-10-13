import type { IncidentListFilters, IncidentListScope } from './incidentTypes'

// Hooks append the authenticated user ID to these prefixes because RLS results differ within an organization.
// The common 'all' prefix also lets mutations invalidate every incident query at once.
export const incidentQueryKeys = {
  all: ['incidents'] as const,
  organization: (organizationId: string) => ['incidents', 'organization', organizationId] as const,
  list: (organizationId: string, scope: IncidentListScope, filters: IncidentListFilters) => ['incidents', 'list', organizationId, scope, filters] as const,
  detail: (organizationId: string, incidentId: string) => ['incidents', 'detail', organizationId, incidentId] as const,
  evidence: (organizationId: string, incidentId: string) => ['incidents', 'evidence', organizationId, incidentId] as const,
  activity: (organizationId: string, incidentId: string) => ['incidents', 'activity', organizationId, incidentId] as const,
}
