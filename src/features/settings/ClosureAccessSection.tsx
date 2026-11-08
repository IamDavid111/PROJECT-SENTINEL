import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Alert, Avatar, Badge, Button, SearchField, Skeleton, Toggle } from '../../components/ui'
import { getIncidentClosureCandidates, searchIncidentClosureCandidates, setIncidentClosureDelegate } from '../incidents/incidentClosureService'
import { invalidateSafetyIntelligence } from '../safety-intelligence/safetyIntelligenceQueryKeys'
import { SettingsSectionShell } from './SettingsSectionShell'

export function ClosureAccessSection({ client, organizationId, userId }: {
  client: SupabaseClient
  organizationId: string
  userId: string
}) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const candidates = useQuery({
    queryKey: ['incident-closure-candidates', organizationId, userId],
    queryFn: () => getIncidentClosureCandidates(client),
  })
  const update = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => setIncidentClosureDelegate(client, id, enabled),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['incident-closure-candidates'] }),
        queryClient.invalidateQueries({ queryKey: ['incident-closure-access'] }),
        invalidateSafetyIntelligence(queryClient, organizationId),
      ])
    },
  })
  const matches = searchIncidentClosureCandidates(candidates.data || [], search)
  const delegates = (candidates.data || [])
    .filter((candidate) => candidate.delegated && candidate.role !== 'Super Administrator')
    .sort((left, right) => left.full_name.localeCompare(right.full_name) || left.user_id.localeCompare(right.user_id))

  return (
    <SettingsSectionShell
      title="Incident closure access"
      description="Super administrators always have access. Delegates can view all organization incidents. Changing a user's role requires delegation again."
      action={<Badge tone="info">Saves immediately</Badge>}
    >
      {candidates.isPending ? (
        <Skeleton className="h-20" />
      ) : candidates.isError ? (
        <Alert tone="danger">
          {candidates.error.message}
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void candidates.refetch()}>Retry</Button>
        </Alert>
      ) : (
        <>
          <section aria-labelledby="closure-delegate-search" className="grid gap-3">
            <h3 id="closure-delegate-search" className="text-sm font-semibold text-foreground">Find users to delegate</h3>
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search organization users by name"
              label="Search organization users"
            />
            {!search.trim() ? (
              <p className="text-sm text-muted">Type a name to find users in your organization.</p>
            ) : !matches.length ? (
              <p className="text-sm text-muted">No matching users found in your organization.</p>
            ) : (
              <div className="grid gap-2">
                {matches.map((candidate) => (
                  <div key={candidate.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={candidate.full_name} size="sm" />
                      <div className="grid min-w-0 gap-0.5">
                        <span className="truncate text-sm font-medium text-foreground">{candidate.full_name}</span>
                        <span className="truncate text-xs text-muted">{candidate.role} · {candidate.account_status}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {candidate.role === 'Super Administrator' && <Badge tone="success">Always</Badge>}
                      <Toggle
                        checked={candidate.role === 'Super Administrator' || candidate.delegated}
                        disabled={update.isPending || candidate.role === 'Super Administrator' || (candidate.account_status !== 'active' && !candidate.delegated)}
                        onCheckedChange={(enabled) => update.mutate({ id: candidate.user_id, enabled })}
                        aria-label={`Allow ${candidate.full_name} to close incidents`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="closure-delegate-register">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 id="closure-delegate-register" className="text-sm font-semibold text-foreground">Delegated users</h3>
              <Badge tone="neutral">{delegates.length} {delegates.length === 1 ? 'delegate' : 'delegates'}</Badge>
            </div>
            {delegates.length ? (
              <ol className="grid gap-2">
                {delegates.map((candidate, index) => (
                  <li key={candidate.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-soft font-mono text-xs text-muted" aria-label={`Register number ${index + 1}`}>
                        {index + 1}
                      </span>
                      <Avatar name={candidate.full_name} size="sm" />
                      <div className="grid min-w-0 gap-0.5">
                        <span className="truncate text-sm font-medium text-foreground">{candidate.full_name}</span>
                        <span className="truncate text-xs text-muted">{candidate.role} · {candidate.account_status}</span>
                      </div>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: candidate.user_id, enabled: false })}
                      aria-label={`Disable incident closure access for ${candidate.full_name}`}
                    >
                      Disable
                    </Button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rounded-xl border border-dashed border-line px-4 py-5 text-sm text-muted">No users have been delegated incident closure access.</p>
            )}
          </section>
        </>
      )}

      {update.isError && <Alert tone="danger">{update.error.message}</Alert>}
      {update.isSuccess && <Alert tone="success">Closure access updated.</Alert>}
    </SettingsSectionShell>
  )
}
