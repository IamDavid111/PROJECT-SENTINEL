import type { QueryClient } from '@tanstack/react-query'

// Keys include organization and user so a different session never reuses another caller's authorized results.
export const knowledgeQueryKeys = {
  organization: (organizationId: string) => ['knowledge', organizationId] as const,
  list: (organizationId: string, userId: string) => ['knowledge', organizationId, userId, 'list'] as const,
  detail: (organizationId: string, userId: string, documentId: string) =>
    ['knowledge', organizationId, userId, 'detail', documentId] as const,
  directory: (organizationId: string) => ['knowledge', organizationId, 'directory'] as const,
}

export function invalidateKnowledge(client: QueryClient, organizationId: string) {
  return client.invalidateQueries({ queryKey: knowledgeQueryKeys.organization(organizationId) })
}
