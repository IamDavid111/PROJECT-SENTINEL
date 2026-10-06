import { useQuery, type QueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'

import { getDashboardSnapshot } from './dashboardService'
import type { DashboardFilters } from './dashboardTypes'

export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
HEAD
  snapshot: (organizationId: string, currentUserId: string, filters: DashboardFilters) => ['dashboard', organizationId, currentUserId, filters] as const,

  // Each organization/filter combination is cached separately so changing filters cannot reuse the wrong snapshot.
  snapshot: (organizationId: string, filters: DashboardFilters) => ['dashboard', organizationId, filters] as const,
main
}

export function useDashboardData(client: SupabaseClient, organizationId: string, filters: DashboardFilters, currentUserId: string) {
  return useQuery({
    queryKey: dashboardQueryKeys.snapshot(organizationId, currentUserId, filters),
    queryFn: () => getDashboardSnapshot(client, organizationId, filters, currentUserId),
    enabled: Boolean(organizationId && currentUserId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

// The organization prefix invalidates every dashboard snapshot for that tenant, regardless of its active filters.
export function invalidateDashboardData(queryClient: QueryClient, organizationId: string) {
  return queryClient.invalidateQueries({ queryKey: ['dashboard', organizationId] })
}
