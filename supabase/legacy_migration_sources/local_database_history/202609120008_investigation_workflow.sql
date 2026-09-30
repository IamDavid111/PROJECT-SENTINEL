-- Prompt 4 Batch 3: investigation service operations and controlled workflow.

create or replace function public.transition_incident_status(
  target_incident_id uuid,
  target_status public.incident_status
)
returns public.incidents
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_incident public.incidents;
begin
  select * into current_incident
  from public.incidents
  where id = target_incident_id
  for update;

  if current_incident.id is null then
    raise exception 'Incident not found';
  end if;

  update public.incidents
  set status = target_status
  where id = target_incident_id;

  return (select incident from public.incidents incident where incident.id = target_incident_id);
end;
$$;
create or replace function public.enforce_incident_workflow_transition()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception 'Incident organization cannot be changed';
  end if;

  if new.status = old.status then
    return new;
  end if;

  if not public.has_org_role(old.organization_id, array[
    'Super Administrator',
    'Organization Administrator',
    'QHSE Manager',
    'Site Supervisor',
    'Safety Officer / HSE Officer'
  ]::public.membership_role[]) then
    if not (old.status = 'draft' and new.status = 'submitted' and old.created_by = (select auth.uid())) then
      raise exception 'You are not authorized to change this incident status';
    end if;
  end if;

  if not (
    (old.status = 'submitted' and new.status = 'under_review')
    or (old.status = 'under_review' and new.status = 'investigation')
    or (old.status = 'investigation' and new.status = 'corrective_action')
    or (old.status = 'corrective_action' and new.status = 'pending_verification')
    or (old.status = 'pending_verification' and new.status = 'closed')
    or (old.status = 'draft' and new.status = 'submitted')
  ) then
    raise exception 'Invalid incident workflow transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;
drop trigger if exists incidents_enforce_integrity on public.incidents;
create trigger incidents_enforce_integrity
before update on public.incidents
for each row execute function public.enforce_incident_workflow_transition();
create or replace function public.create_investigation(
  target_incident_id uuid,
  target_investigator_id uuid,
  target_lead_id uuid default null,
  target_completion_date date default null
)
returns public.investigations
language plpgsql
security definer
set search_path = public
as $$
declare
  incident_record public.incidents;
  created_investigation public.investigations;
  current_user_id uuid := (select auth.uid());
begin
  select * into incident_record
  from public.incidents
  where id = target_incident_id
  for update;

  if incident_record.id is null then
    raise exception 'Incident not found';
  end if;
  if not public.can_assign_investigation(incident_record.organization_id) then
    raise exception 'You are not authorized to assign an investigation';
  end if;
  if target_investigator_id is null then
    raise exception 'An investigator is required';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = target_investigator_id
      and organization_id = incident_record.organization_id
  ) then
    raise exception 'Investigator must belong to the incident organization';
  end if;
  if target_lead_id is not null and not exists (
    select 1 from public.profiles
    where id = target_lead_id
      and organization_id = incident_record.organization_id
  ) then
    raise exception 'Investigation lead must belong to the incident organization';
  end if;
  if incident_record.status not in ('submitted', 'under_review') then
    raise exception 'Incident is not ready for investigation';
  end if;

  if incident_record.status = 'submitted' then
    update public.incidents set status = 'under_review' where id = incident_record.id;
  end if;

  insert into public.investigations (
    organization_id,
    incident_id,
    status,
    assigned_investigator_id,
    investigation_lead_id,
    assigned_by,
    assigned_at,
    target_completion_date,
    created_by
  ) values (
    incident_record.organization_id,
    incident_record.id,
    'assigned',
    target_investigator_id,
    target_lead_id,
    current_user_id,
    now(),
    target_completion_date,
    current_user_id
  ) returning * into created_investigation;

  update public.incidents set status = 'investigation' where id = incident_record.id;
  return created_investigation;
end;
$$;
create or replace function public.record_investigation_activity(
  target_organization_id uuid,
  target_investigation_id uuid,
  activity_name text,
  activity_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.can_view_investigation(target_organization_id, target_investigation_id) then
    raise exception 'You are not authorized to record investigation activity';
  end if;
  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  values (
    target_organization_id,
    (select auth.uid()),
    activity_name,
    activity_metadata || jsonb_build_object('investigation_id', target_investigation_id)
  );
end;
$$;
revoke all on function public.transition_incident_status(uuid, public.incident_status) from public, anon;
revoke all on function public.create_investigation(uuid, uuid, uuid, date) from public, anon;
revoke all on function public.record_investigation_activity(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.transition_incident_status(uuid, public.incident_status) to authenticated;
grant execute on function public.create_investigation(uuid, uuid, uuid, date) to authenticated;
grant execute on function public.record_investigation_activity(uuid, uuid, text, jsonb) to authenticated;
create or replace function public.enforce_investigation_workflow()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.organization_id <> old.organization_id
    or new.incident_id <> old.incident_id
    or new.created_by <> old.created_by then
    raise exception 'Investigation ownership cannot be changed';
  end if;

  if new.assigned_investigator_id is distinct from old.assigned_investigator_id
    or new.investigation_lead_id is distinct from old.investigation_lead_id
    or new.assigned_by is distinct from old.assigned_by
    or new.assigned_at is distinct from old.assigned_at then
    if not public.can_assign_investigation(old.organization_id) then
      raise exception 'You are not authorized to assign this investigation';
    end if;
    if new.assigned_by <> (select auth.uid()) then
      raise exception 'Assignment actor must be the authenticated user';
    end if;
  end if;

  if new.status <> old.status then
    if not (
      (old.status = 'assigned' and new.status = 'in_progress')
      or (old.status = 'in_progress' and new.status = 'pending_review')
      or (old.status = 'pending_review' and new.status = 'completed')
    ) then
      raise exception 'Invalid investigation workflow transition from % to %', old.status, new.status;
    end if;
    if not public.can_manage_investigation(old.organization_id, old.id) then
      raise exception 'You are not authorized to change this investigation status';
    end if;
  end if;

  if new.status = 'in_progress' and new.started_at is null then
    new.started_at = now();
  end if;
  if new.status = 'completed' and new.completed_at is null then
    new.completed_at = now();
  end if;
  return new;
end;
$$;
drop policy if exists investigations_insert_authorized on public.investigations;
create policy investigations_insert_authorized on public.investigations
for insert to authenticated
with check (
  public.can_assign_investigation(organization_id)
  and created_by = (select auth.uid())
  and (assigned_by is null or assigned_by = (select auth.uid()))
  and public.is_org_member(organization_id)
);
drop trigger if exists investigations_enforce_workflow on public.investigations;
create trigger investigations_enforce_workflow
before update on public.investigations
for each row execute function public.enforce_investigation_workflow();
