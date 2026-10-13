-- Trusted AI lifecycle records are separate from user-submitted general activity entries.
create table public.ai_request_logs (
  request_id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature text not null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  prompt_version text not null,
  model_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed')),
  error_code text,
  response_metadata jsonb not null default '{}'::jsonb,
  -- Reserved for later phases; the foundation does not persist retrieved data or response content.
  retrieved_operational_records jsonb,
  retrieved_knowledge_documents jsonb,
  response_text text,
  human_decision text check (human_decision in ('accepted', 'rejected')),
  human_decided_by uuid references auth.users(id) on delete set null,
  human_decided_at timestamptz,
  constraint ai_request_logs_completion_consistency check (
    (status = 'pending' and completed_at is null)
    or (status in ('succeeded', 'failed') and completed_at is not null)
  ),
  constraint ai_request_logs_error_consistency check (
    (status = 'failed' and error_code is not null)
    or (status <> 'failed' and error_code is null)
  ),
  constraint ai_request_logs_human_decision_consistency check (
    (human_decision is null and human_decided_by is null and human_decided_at is null)
    or (human_decision is not null and human_decided_at is not null)
  )
);

create index ai_request_logs_organization_requested_idx
  on public.ai_request_logs (organization_id, requested_at desc);
create index ai_request_logs_user_requested_idx
  on public.ai_request_logs (user_id, requested_at desc);

-- No client policies: future audit access must explicitly enforce tenant and content permissions.
alter table public.ai_request_logs enable row level security;

revoke all on public.ai_request_logs from public, anon, authenticated;
grant all on public.ai_request_logs to service_role;
