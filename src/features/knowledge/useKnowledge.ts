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
      const [sites, people] = await Promise.all([
        client.from('sites').select('id, name').eq('organization_id', organizationId).order('name'),
        client.from('profiles').select('id, full_name').eq('organization_id', organizationId).order('full_name'),
      ])
      if (sites.error || people.error) throw new Error('Unable to load sites and members.')
      return {
        sites: (sites.data ?? []) as Array<{ id: string; name: string }>,
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
