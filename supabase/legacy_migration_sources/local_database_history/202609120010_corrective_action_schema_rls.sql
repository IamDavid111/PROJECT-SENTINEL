-- Prompt 4 Batch 6: normalized incident-linked corrective actions and tenant-aware RLS.
-- Due state is derived from due_date and status; overdue is not a stored status.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'corrective_action_status' and typnamespace = 'public'::regnamespace) then
    create type public.corrective_action_status as enum (
      'open',
      'assigned',
      'in_progress',
      'pending_verification',
      'verified',
      'closed',
      'rejected'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'corrective_action_priority' and typnamespace = 'public'::regnamespace) then
    create type public.corrective_action_priority as enum ('low', 'medium', 'high', 'critical');
  end if;
end;
$$;
create table public.corrective_action_sequences (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  next_value bigint not null default 1 check (next_value > 0),
  updated_at timestamptz not null default now()
);
create table public.corrective_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference_number text not null,
  incident_id uuid not null,
  investigation_id uuid,
  title text not null check (char_length(btrim(title)) >= 3),
  description text,
  action_category text,
  priority public.corrective_action_priority not null default 'medium',
  status public.corrective_action_status not null default 'open',
  assigned_owner_id uuid,
  assigned_by uuid,
  assigned_at timestamptz,
  due_date date,
  completion_date date,
  verification_status text,
  verification_date timestamptz,
  verified_by uuid,
  verification_notes text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corrective_actions_reference_per_organization unique (organization_id, reference_number),
  constraint corrective_actions_id_organization_unique unique (id, organization_id),
  constraint corrective_actions_incident_same_organization
    foreign key (incident_id, organization_id)
    references public.incidents(id, organization_id)
    on delete cascade,
  constraint corrective_actions_investigation_same_organization
    foreign key (investigation_id, organization_id)
    references public.investigations(id, organization_id)
    on delete set null,
  constraint corrective_actions_owner_same_organization
    foreign key (assigned_owner_id, organization_id)
    references public.profiles(id, organization_id)
    on delete restrict,
  constraint corrective_actions_assigned_by_same_organization
    foreign key (assigned_by, organization_id)
    references public.profiles(id, organization_id)
    on delete restrict,
  constraint corrective_actions_verified_by_same_organization
    foreign key (verified_by, organization_id)
    references public.profiles(id, organization_id)
    on delete restrict,
  constraint corrective_actions_created_by_same_organization
    foreign key (created_by, organization_id)
    references public.profiles(id, organization_id)
    on delete restrict,
  constraint corrective_actions_assignment_metadata
    check (
      (assigned_owner_id is null and assigned_by is null and assigned_at is null)
      or (assigned_owner_id is not null and assigned_by is not null and assigned_at is not null)
    ),
  constraint corrective_actions_due_date_valid
    check (due_date is null or due_date >= created_at::date),
  constraint corrective_actions_completion_date_valid
    check (completion_date is null or completion_date >= created_at::date),
  constraint corrective_actions_verification_metadata
    check (
      (verification_status is null and verification_date is null and verified_by is null)
      or (verification_status is not null and verification_date is not null and verified_by is not null)
    )
);
create index corrective_action_sequences_updated_at_idx on public.corrective_action_sequences(updated_at);
create index corrective_actions_organization_status_idx on public.corrective_actions(organization_id, status);
create index corrective_actions_organization_incident_idx on public.corrective_actions(organization_id, incident_id);
create index corrective_actions_organization_investigation_idx on public.corrective_actions(organization_id, investigation_id) where investigation_id is not null;
create index corrective_actions_organization_owner_idx on public.corrective_actions(organization_id, assigned_owner_id) where assigned_owner_id is not null;
create index corrective_actions_organization_due_date_idx on public.corrective_actions(organization_id, due_date) where due_date is not null;
create index corrective_actions_organization_priority_idx on public.corrective_actions(organization_id, priority);
create trigger corrective_action_sequences_set_updated_at before update on public.corrective_action_sequences for each row execute function public.set_updated_at();
create trigger corrective_actions_set_updated_at before update on public.corrective_actions for each row execute function public.set_updated_at();
create or replace function public.enforce_corrective_action_parent_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.investigation_id is not null and not exists (
    select 1
    from public.investigations investigation
    where investigation.id = new.investigation_id
      and investigation.organization_id = new.organization_id
      and investigation.incident_id = new.incident_id
  ) then
    raise exception 'Corrective action investigation must belong to the same incident';
  end if;
  return new;
end;
$$;
create trigger corrective_actions_parent_integrity
before insert or update on public.corrective_actions
for each row execute function public.enforce_corrective_action_parent_integrity();
create or replace function public.next_corrective_action_reference(target_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  allocated_value bigint;
begin
  insert into public.corrective_action_sequences (organization_id, next_value)
  values (target_organization_id, 2)
  on conflict (organization_id) do nothing;

  update public.corrective_action_sequences
  set next_value = next_value + 1
  where organization_id = target_organization_id
  returning next_value - 1 into allocated_value;

  return format('CA-%s-%s', to_char(current_date, 'YYYY'), lpad(allocated_value::text, 6, '0'));
end;
$$;
create or replace function public.assign_corrective_action_reference()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.reference_number is null or btrim(new.reference_number) = '' then
    new.reference_number := public.next_corrective_action_reference(new.organization_id);
  end if;
  return new;
end;
$$;
create trigger corrective_actions_assign_reference
before insert on public.corrective_actions
for each row execute function public.assign_corrective_action_reference();
create or replace function public.can_view_corrective_action(target_organization_id uuid, target_action_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.corrective_actions action
    where action.id = target_action_id
      and action.organization_id = target_organization_id
      and public.is_org_member(target_organization_id)
      and (
        public.has_org_role(target_organization_id, array[
          'Super Administrator', 'Organization Administrator', 'QHSE Manager',
          'Site Supervisor', 'Safety Officer / HSE Officer', 'Auditor',
          'Executive / Management'
        ]::public.membership_role[])
        or action.assigned_owner_id = (select auth.uid())
        or action.created_by = (select auth.uid())
      )
  );
$$;
create or replace function public.can_manage_corrective_action(target_organization_id uuid, target_action_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.corrective_actions action
    where action.id = target_action_id
      and action.organization_id = target_organization_id
      and public.is_org_member(target_organization_id)
      and (
        public.has_org_role(target_organization_id, array[
          'Super Administrator', 'Organization Administrator', 'QHSE Manager',
          'Site Supervisor', 'Safety Officer / HSE Officer'
        ]::public.membership_role[])
        or action.assigned_owner_id = (select auth.uid())
        or action.created_by = (select auth.uid())
      )
  );
$$;
create or replace function public.can_create_corrective_action(target_organization_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_org_role(target_organization_id, array[
    'Super Administrator', 'Organization Administrator', 'QHSE Manager',
    'Site Supervisor', 'Safety Officer / HSE Officer'
  ]::public.membership_role[]);
$$;
revoke all on function public.next_corrective_action_reference(uuid) from public, anon, authenticated;
revoke all on function public.assign_corrective_action_reference() from public, anon, authenticated;
revoke all on function public.can_view_corrective_action(uuid, uuid) from public, anon;
revoke all on function public.can_manage_corrective_action(uuid, uuid) from public, anon;
revoke all on function public.can_create_corrective_action(uuid) from public, anon;
grant execute on function public.can_view_corrective_action(uuid, uuid) to authenticated;
grant execute on function public.can_manage_corrective_action(uuid, uuid) to authenticated;
grant execute on function public.can_create_corrective_action(uuid) to authenticated;
grant select, insert, update, delete on public.corrective_actions to authenticated;
alter table public.corrective_action_sequences enable row level security;
alter table public.corrective_actions enable row level security;
create policy corrective_action_sequences_no_direct_access on public.corrective_action_sequences
for all to authenticated using (false) with check (false);
create policy corrective_actions_select_authorized on public.corrective_actions
for select to authenticated using (public.can_view_corrective_action(organization_id, id));
create policy corrective_actions_insert_authorized on public.corrective_actions
for insert to authenticated
with check (
  public.can_create_corrective_action(organization_id)
  and public.is_org_member(organization_id)
  and created_by = (select auth.uid())
  and (assigned_by is null or assigned_by = (select auth.uid()))
);
create policy corrective_actions_update_authorized on public.corrective_actions
for update to authenticated
using (public.can_manage_corrective_action(organization_id, id))
with check (
  public.is_org_member(organization_id)
  and (assigned_by is null or assigned_by = (select auth.uid()) or public.has_org_role(organization_id, array['Super Administrator', 'Organization Administrator', 'QHSE Manager']::public.membership_role[]))
);
create policy corrective_actions_delete_authorized on public.corrective_actions
for delete to authenticated
using (
  public.has_org_role(organization_id, array['Super Administrator', 'Organization Administrator']::public.membership_role[])
  and status = 'open'
);
