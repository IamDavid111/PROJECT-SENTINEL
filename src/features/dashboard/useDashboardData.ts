import { useQuery, type QueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'

import { getDashboardSnapshot } from './dashboardService'
import type { DashboardFilters } from './dashboardTypes'

export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  snapshot: (organizationId: string, filters: DashboardFilters) => ['dashboard', organizationId, filters] as const,
}

export function useDashboardData(client: SupabaseClient, organizationId: string, filters: DashboardFilters) {
  return useQuery({
    queryKey: dashboardQueryKeys.snapshot(organizationId, filters),
    queryFn: () => getDashboardSnapshot(client, organizationId, filters),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

export function invalidateDashboardData(queryClient: QueryClient, organizationId: string) {
  return queryClient.invalidateQueries({ queryKey: ['dashboard', organizationId] })
}
