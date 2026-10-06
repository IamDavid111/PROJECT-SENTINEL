import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { safetyFiltersSchema, type SafetyFilters, type SafetyScope } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { getSafetySnapshot } from './safetyIntelligenceService'
import { invalidateSafetyIntelligence, safetyIntelligenceQueryKeys } from './safetyIntelligenceQueryKeys'

export function useSafetyIntelligence(client: SupabaseClient, scope: SafetyScope, input: SafetyFilters) {
  const filters = safetyFiltersSchema.parse(input)
  const queryClient = useQueryClient()
  useEffect(() => {
    const updated = (event: Event) => {
      const detail = (event as CustomEvent<{ organizationId?: string }>).detail
      if (detail?.organizationId === scope.organizationId) void invalidateSafetyIntelligence(queryClient, scope.organizationId)
    }
    window.addEventListener('incident-records-updated', updated)
    return () => window.removeEventListener('incident-records-updated', updated)
  }, [queryClient, scope.organizationId])
  return useQuery({
    queryKey: safetyIntelligenceQueryKeys.snapshot(scope, filters),
    queryFn: async () => {
      const snapshot = await getSafetySnapshot(client, filters)
      // Cache hints cannot authorize reads; reject a stale identity/permission hint instead of caching under it.
      if (snapshot.scope.userId !== scope.userId || snapshot.scope.organizationId !== scope.organizationId
        || snapshot.scope.visibility !== scope.visibility || snapshot.scope.siteId !== scope.siteId
        || snapshot.scope.siteId !== filters.siteId) {
        throw new Error('Safety intelligence access changed. Reload your organization context.')
      }
      return snapshot
    },
    enabled: Boolean(scope.organizationId && scope.userId),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    // Refresh deterministic database observations only; this never invokes an AI provider.
    refetchInterval: 3_600_000,
    refetchIntervalInBackground: false,
    retry: false,
  })
}
