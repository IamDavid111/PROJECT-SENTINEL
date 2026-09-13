-- Prompt 4 Batch 2: normalized investigation foundation and tenant-aware RLS.
-- Workflow transition enforcement is intentionally implemented in Batch 3.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'investigation_status' and typnamespace = 'public'::regnamespace) then
    create type public.investigation_status as enum (
      'not_started',
      'assigned',
      'in_progress',
      'pending_review',
      'completed'
    );
  end if;
end;
$$;

-- Composite references make the organization boundary part of every assignment relationship.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_id_organization_unique'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_id_organization_unique unique (id, organization_id);
  end if;
end;
$$;

create index if not exists incidents_organization_id_workflow_status_idx
  on public.incidents(organization_id, status)
  where status in ('investigation', 'corrective_action', 'pending_verification');

create table public.investigations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  incident_id uuid not null,
  status public.investigation_status not null default 'not_started',
  assigned_investigator_id uuid,
  investigation_lead_id uuid,
  assigned_by uuid,
  assigned_at timestamptz,
  started_at timestamptz,
  target_completion_date date,
  completed_at timestamptz,
  investigation_summary text,
  findings_summary text,
  conclusions text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investigations_id_organization_unique unique (id, organization_id),
  constraint investigations_incident_unique unique (organization_id, incident_id),
  constraint investigations_incident_same_organization
    foreign key (incident_id, organization_id)
    references public.incidents(id, organization_id)
    on delete cascade,
  constraint investigations_assigned_investigator_same_organization
    foreign key (assigned_investigator_id, organization_id)
    references public.profiles(id, organization_id)
    on delete restrict,
  constraint investigations_lead_same_organization
    foreign key (investigation_lead_id, organization_id)
    references public.profiles(id, organization_id)
    on delete restrict,
  constraint investigations_assigned_by_same_organization
    foreign key (assigned_by, organization_id)
    references public.profiles(id, organization_id)
    on delete restrict,
  constraint investigations_created_by_same_organization
    foreign key (created_by, organization_id)
    references public.profiles(id, organization_id)
    on delete restrict,
  constraint investigations_assignment_metadata
    check (
      (assigned_investigator_id is null and assigned_by is null and assigned_at is null)
      or (assigned_investigator_id is not null and assigned_by is not null and assigned_at is not null)
    ),
  constraint investigations_started_at_after_assignment
    check (started_at is null or assigned_at is null or started_at >= assigned_at),
  constraint investigations_completed_at_after_start
    check (completed_at is null or started_at is null or completed_at >= started_at),
  constraint investigations_target_date_valid
    check (target_completion_date is null or target_completion_date >= created_at::date)
);

create index investigations_organization_id_idx
  on public.investigations(organization_id);

create index investigations_organization_id_incident_id_idx
  on public.investigations(organization_id, incident_id);

create index investigations_organization_id_status_idx
  on public.investigations(organization_id, status);

create index investigations_organization_id_investigator_idx
  on public.investigations(organization_id, assigned_investigator_id)
  where assigned_investigator_id is not null;

create index investigations_organization_id_target_date_idx
  on public.investigations(organization_id, target_completion_date)
  where target_completion_date is not null;

create trigger investigations_set_updated_at
before update on public.investigations
for each row execute function public.set_updated_at();

create or replace function public.can_view_investigation(
  target_organization_id uuid,
  target_investigation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.investigations investigation
    where investigation.id = target_investigation_id
      and investigation.organization_id = target_organization_id
      and public.is_org_member(target_organization_id)
      and (
        public.has_org_role(target_organization_id, array[
          'Super Administrator',
          'Organization Administrator',
          'QHSE Manager',
          'Site Supervisor',
          'Safety Officer / HSE Officer',
          'Auditor',
          'Executive / Management'
        ]::public.membership_role[])
        or investigation.assigned_investigator_id = (select auth.uid())
        or investigation.investigation_lead_id = (select auth.uid())
        or investigation.created_by = (select auth.uid())
      )
  );
$$;

create or replace function public.can_manage_investigation(
  target_organization_id uuid,
  target_investigation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.investigations investigation
    where investigation.id = target_investigation_id
      and investigation.organization_id = target_organization_id
      and public.is_org_member(target_organization_id)
      and (
        public.has_org_role(target_organization_id, array[
          'Super Administrator',
          'Organization Administrator',
          'QHSE Manager',
          'Site Supervisor',
          'Safety Officer / HSE Officer'
        ]::public.membership_role[])
        or investigation.assigned_investigator_id = (select auth.uid())
        or investigation.investigation_lead_id = (select auth.uid())
      )
  );
$$;

create or replace function public.can_assign_investigation(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_role(target_organization_id, array[
    'Super Administrator',
    'Organization Administrator',
    'QHSE Manager',
    'Site Supervisor',
    'Safety Officer / HSE Officer'
  ]::public.membership_role[]);
$$;

create or replace function public.can_delete_investigation(
  target_organization_id uuid,
  target_investigation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.investigations investigation
    where investigation.id = target_investigation_id
      and investigation.organization_id = target_organization_id
      and public.has_org_role(target_organization_id, array[
        'Super Administrator',
        'Organization Administrator'
      ]::public.membership_role[])
      and investigation.status = 'not_started'
  );
$$;

revoke all on function public.can_view_investigation(uuid, uuid) from public, anon;
revoke all on function public.can_manage_investigation(uuid, uuid) from public, anon;
revoke all on function public.can_assign_investigation(uuid) from public, anon;
revoke all on function public.can_delete_investigation(uuid, uuid) from public, anon;
grant execute on function public.can_view_investigation(uuid, uuid) to authenticated;
grant execute on function public.can_manage_investigation(uuid, uuid) to authenticated;
grant execute on function public.can_assign_investigation(uuid) to authenticated;
grant execute on function public.can_delete_investigation(uuid, uuid) to authenticated;

grant select, insert, update, delete on public.investigations to authenticated;
alter table public.investigations enable row level security;

create policy investigations_select_authorized on public.investigations
for select to authenticated
using (public.can_view_investigation(organization_id, id));

create policy investigations_insert_authorized on public.investigations
for insert to authenticated
with check (
  public.can_assign_investigation(organization_id)
  and created_by = (select auth.uid())
  and public.is_org_member(organization_id)
);

create policy investigations_update_authorized on public.investigations
for update to authenticated
using (public.can_manage_investigation(organization_id, id))
with check (
  public.is_org_member(organization_id)
  and (
    public.can_manage_investigation(organization_id, id)
    or public.can_assign_investigation(organization_id)
  )
);

create policy investigations_delete_authorized on public.investigations
for delete to authenticated
using (public.can_delete_investigation(organization_id, id));
