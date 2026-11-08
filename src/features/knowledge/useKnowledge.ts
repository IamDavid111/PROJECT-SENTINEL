import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getKnowledgeDocument, listKnowledgeDocuments } from './knowledgeService'
import { invalidateKnowledge, knowledgeQueryKeys } from './knowledgeQueryKeys'

export type KnowledgeScope = { organizationId: string; userId: string }

export function useKnowledgeDocuments(client: SupabaseClient, scope: KnowledgeScope) {
  return useQuery({
    queryKey: knowledgeQueryKeys.list(scope.organizationId, scope.userId),
    queryFn: () => listKnowledgeDocuments(client),
    enabled: Boolean(scope.organizationId && scope.userId),
    retry: false,
  })
}

export function useKnowledgeDocument(client: SupabaseClient, scope: KnowledgeScope, documentId: string | null) {
  return useQuery({
    queryKey: knowledgeQueryKeys.detail(scope.organizationId, scope.userId, documentId ?? ''),
    queryFn: () => getKnowledgeDocument(client, documentId!),
    enabled: Boolean(scope.organizationId && scope.userId && documentId),
    retry: false,
  })
}

/** Sites and member names for labels and pickers; member RLS already limits both to the caller's organization. */
export function useKnowledgeDirectory(client: SupabaseClient, organizationId: string) {
  return useQuery({
    queryKey: knowledgeQueryKeys.directory(organizationId),
    queryFn: async () => {
      const [sites, people, settings] = await Promise.all([
        client.from('sites').select('id, name').eq('organization_id', organizationId).order('name'),
        client.from('profiles').select('id, full_name').eq('organization_id', organizationId).order('full_name'),
        client.from('company_settings').select('operational_sites').eq('organization_id', organizationId).maybeSingle(),
      ])
      if (sites.error || people.error || settings.error) throw new Error('Unable to load sites and members.')
      const configuredNames = Array.isArray(settings.data?.operational_sites)
        ? settings.data.operational_sites.flatMap((entry: unknown) => {
          if (typeof entry === 'string') return entry.trim() ? [entry.trim().toLowerCase()] : []
          if (!entry || typeof entry !== 'object') return []
          const item = entry as { name?: unknown; active?: unknown; deleted?: unknown }
          return typeof item.name === 'string' && item.name.trim() && item.active !== false && item.deleted !== true
            ? [item.name.trim().toLowerCase()]
            : []
        })
        : []
      const allSites = (sites.data ?? []) as Array<{ id: string; name: string }>
      return {
        sites: allSites,
        activeSites: allSites.filter((site) => configuredNames.includes(site.name.trim().toLowerCase())),
        people: (people.data ?? []) as Array<{ id: string; full_name: string }>,
      }
    },
    enabled: Boolean(organizationId),
    staleTime: 300_000,
  })
}

export function useKnowledgeMutation<TInput, TResult>(organizationId: string, run: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: run,
    // Always refetch, including after failures, so the UI reflects the server's authoritative state.
    onSettled: () => invalidateKnowledge(queryClient, organizationId),
  })
}
