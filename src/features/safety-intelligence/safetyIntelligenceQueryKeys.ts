import type { QueryClient } from '@tanstack/react-query'
import { safetyMethodologyVersion, type SafetyFilters, type SafetyScope } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'

export const safetyIntelligenceQueryKeys = {
  all: ['safety-intelligence'] as const,
  organization: (organizationId: string) => ['safety-intelligence', organizationId] as const,
  // Prevent another user, scope or methodology from reusing an incompatible cached result.
  snapshot: (scope: SafetyScope, filters: SafetyFilters) => [
    'safety-intelligence', scope.organizationId, scope.userId, scope.visibility,
    scope.siteId ?? null, safetyMethodologyVersion, filters,
  ] as const,
}
export function invalidateSafetyIntelligence(client: QueryClient, organizationId: string) {
  return client.invalidateQueries({ queryKey: safetyIntelligenceQueryKeys.organization(organizationId) })
}
