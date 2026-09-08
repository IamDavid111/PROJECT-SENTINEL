import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  createIncidentDraft,
  deleteIncidentEvidence,
  getIncident,
  getIncidentActivity,
  getIncidentEvidence,
  getIncidents,
  getOrganizationContext,
  downloadIncidentEvidence,
  submitIncident,
  updateIncidentDraft,
  uploadIncidentEvidence,
  type IncidentActivity,
  type IncidentListResult,
} from './incidentService'
import { incidentQueryKeys } from './incidentQueryKeys'
import type { IncidentDetail, IncidentDraftInput, IncidentEvidence, IncidentListFilters, IncidentSubmissionInput, IncidentSummary } from './incidentTypes'

export function useIncidentOrganization(client: SupabaseClient) {
  const session = useQuery({
    queryKey: ['incident-auth-session'],
    queryFn: async () => {
      const { data, error } = await client.auth.getSession()
      if (error || !data.session?.user.id) throw new Error('Your session is no longer valid.')
      return data.session.user.id
    },
    staleTime: 0,
    refetchOnMount: true,
  })
  return useQuery({
    queryKey: ['organization-context', session.data || 'pending'],
    queryFn: () => getOrganizationContext(client),
    enabled: Boolean(session.data),
    staleTime: 60_000,
    refetchOnMount: true,
  })
}

export function useIncidents(client: SupabaseClient, filters: IncidentListFilters = {}) {
  const organization = useIncidentOrganization(client)
  return useQuery<IncidentListResult>({
    queryKey: incidentQueryKeys.list(organization.data?.organizationId || 'pending', filters),
    queryFn: () => getIncidents(client, filters),
    enabled: Boolean(organization.data?.organizationId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

export function useIncident(client: SupabaseClient, incidentId: string | null) {
  const organization = useIncidentOrganization(client)
  return useQuery<IncidentDetail>({
    queryKey: incidentQueryKeys.detail(organization.data?.organizationId || 'pending', incidentId || 'pending'),
    queryFn: () => getIncident(client, incidentId as string),
    enabled: Boolean(organization.data?.organizationId && incidentId),
    staleTime: 30_000,
  })
}

export function useCreateIncidentDraft(client: SupabaseClient) {
  const queryClient = useQueryClient()
  return useMutation<IncidentSummary, Error, IncidentDraftInput>({
    mutationFn: (input) => createIncidentDraft(client, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: incidentQueryKeys.all }),
  })
}

export function useUpdateIncidentDraft(client: SupabaseClient) {
  const queryClient = useQueryClient()
  return useMutation<IncidentSummary, Error, { incidentId: string; input: IncidentDraftInput }>({
    mutationFn: ({ incidentId, input }) => updateIncidentDraft(client, incidentId, input),
    onSuccess: (incident) => {
      queryClient.invalidateQueries({ queryKey: incidentQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: ['incidents', 'detail', incident.organizationId, incident.id] })
    },
  })
}

export function useSubmitIncident(client: SupabaseClient) {
  const queryClient = useQueryClient()
  return useMutation<IncidentSummary, Error, { incidentId: string; input: IncidentSubmissionInput }>({
    mutationFn: ({ incidentId, input }) => submitIncident(client, incidentId, input),
    onSuccess: (incident) => {
      queryClient.invalidateQueries({ queryKey: incidentQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: ['incidents', 'detail', incident.organizationId, incident.id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', incident.organizationId] })
    },
  })
}

export function useIncidentEvidence(client: SupabaseClient, incidentId: string | null) {
  const organization = useIncidentOrganization(client)
  return useQuery<IncidentEvidence[]>({
    queryKey: incidentQueryKeys.evidence(organization.data?.organizationId || 'pending', incidentId || 'pending'),
    queryFn: () => getIncidentEvidence(client, incidentId as string),
    enabled: Boolean(organization.data?.organizationId && incidentId),
    staleTime: 30_000,
  })
}

export function useUploadIncidentEvidence(client: SupabaseClient) {
  const queryClient = useQueryClient()
  return useMutation<IncidentEvidence, Error, { incidentId: string; file: File }>({
    mutationFn: ({ incidentId, file }) => uploadIncidentEvidence(client, incidentId, file),
    onSuccess: (evidence) => {
      queryClient.invalidateQueries({ queryKey: incidentQueryKeys.evidence(evidence.organizationId, evidence.incidentId) })
      queryClient.invalidateQueries({ queryKey: incidentQueryKeys.detail(evidence.organizationId, evidence.incidentId) })
      queryClient.invalidateQueries({ queryKey: ['dashboard', evidence.organizationId] })
    },
  })
}

export function useDeleteIncidentEvidence(client: SupabaseClient) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { evidenceId: string; organizationId: string; incidentId: string }>({
    mutationFn: ({ evidenceId }) => deleteIncidentEvidence(client, evidenceId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: incidentQueryKeys.evidence(variables.organizationId, variables.incidentId) })
      queryClient.invalidateQueries({ queryKey: incidentQueryKeys.detail(variables.organizationId, variables.incidentId) })
    },
  })
}

export function useDownloadIncidentEvidence(client: SupabaseClient) {
  return useMutation<{ blob: Blob; filename: string }, Error, string>({
    mutationFn: (evidenceId) => downloadIncidentEvidence(client, evidenceId),
  })
}

export function useIncidentActivity(client: SupabaseClient, incidentId: string | null) {
  const organization = useIncidentOrganization(client)
  return useQuery<IncidentActivity[]>({
    queryKey: incidentQueryKeys.activity(organization.data?.organizationId || 'pending', incidentId || 'pending'),
    queryFn: () => getIncidentActivity(client, incidentId as string),
    enabled: Boolean(organization.data?.organizationId && incidentId),
    staleTime: 30_000,
  })
}
