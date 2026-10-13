import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { safetyFiltersSchema, type SafetyFilters, type SafetyScope } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { getSafetySnapshot } from './safetyIntelligenceService'
import { invalidateSafetyIntelligence, resetSafetyIntelligenceAccess, safetyIntelligenceQueryKeys } from './safetyIntelligenceQueryKeys'

export function useSafetyIntelligence(client: SupabaseClient, scope: SafetyScope, input: SafetyFilters, enabled = true) {
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
  useEffect(() => {
    if (!enabled || !scope.organizationId || !scope.userId) return
    let active = true
    const accessChanged = () => {
      if (active) void resetSafetyIntelligenceAccess(queryClient, scope).catch((error: unknown) => {
        console.error('Executive Analytics access refresh failed', error)
      })
    }
    // Subscribe only to caller-readable records. The next snapshot still reauthorizes on the server.
    const channel = client.channel(`executive-analytics-access:${scope.organizationId}:${scope.userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_roles',
        filter: `organization_id=eq.${scope.organizationId}` }, accessChanged)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memberships',
        filter: `user_id=eq.${scope.userId}` }, accessChanged)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles',
        filter: `id=eq.${scope.userId}` }, accessChanged)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`Executive Analytics access subscription ${status}; rechecking server authorization.`)
          accessChanged()
        }
      })
    return () => {
      active = false
      void client.removeChannel(channel)
    }
  }, [client, enabled, queryClient, scope.organizationId, scope.userId])
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
    enabled: enabled && Boolean(scope.organizationId && scope.userId),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    // Refresh deterministic database observations only; this never invokes an AI provider.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  })
}
