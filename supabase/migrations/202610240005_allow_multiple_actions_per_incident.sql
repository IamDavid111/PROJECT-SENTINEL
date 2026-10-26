drop index if exists public.actions_organization_incident_type_unique;

create or replace function public.set_action_ownership_and_resolution()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  current_organization_id uuid;
  can_manage boolean;
  incident_status public.incident_status;
begin
  select profile.organization_id into current_organization_id
  from public.profiles profile join public.memberships membership
    on membership.user_id = profile.id and membership.organization_id = profile.organization_id
  where profile.id = (select auth.uid()) and profile.account_status = 'active';
  if current_organization_id is null then raise exception 'An active organization membership is required'; end if;
  can_manage := public.has_inspection_action_permission(current_organization_id, 'manage_actions');

  if tg_op = 'INSERT' then
    if not can_manage then raise exception 'You are not authorized to create actions'; end if;
    if new.due_at <= now() then raise exception 'The due date and time must be in the future'; end if;
    if not exists (
      select 1 from public.memberships membership join public.profiles profile on profile.id = membership.user_id
      where membership.user_id = new.assignee_id and membership.organization_id = current_organization_id and profile.account_status = 'active'
    ) then raise exception 'The assignee must be an active member of this organization'; end if;
    new.organization_id := current_organization_id;
    new.created_by := (select auth.uid());
    new.status := 'open'; new.resolved_at := null; new.resolved_by := null; new.assigned_at := now();
    if new.incident_id is not null then
      select incident.status into incident_status
      from public.incidents incident
      where incident.id = new.incident_id and incident.organization_id = current_organization_id
      for update;
      if not found then raise exception 'The selected incident is unavailable in this organization'; end if;
      if incident_status in ('draft', 'closed') then raise exception 'Actions can only be assigned to submitted, open incidents'; end if;
    end if;
  else
    if new.organization_id <> old.organization_id or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'Action ownership fields cannot be changed';
    end if;
    if new.incident_id is distinct from old.incident_id then
      raise exception 'An action cannot be moved to a different incident';
    end if;
    if old.status = 'resolved' then raise exception 'Resolved actions cannot be changed'; end if;
    if new.type is distinct from old.type
      or new.description is distinct from old.description
      or new.site_id is distinct from old.site_id
      or new.due_at is distinct from old.due_at
      or new.assignee_id is distinct from old.assignee_id and not can_manage then
      raise exception 'Action details cannot be changed';
    end if;
    if new.status = 'open' and (new.resolution_notes is distinct from old.resolution_notes
      or new.proof_storage_path is distinct from old.proof_storage_path
      or new.proof_file_name is distinct from old.proof_file_name
      or new.proof_file_type is distinct from old.proof_file_type
      or new.proof_file_size is distinct from old.proof_file_size) then
      raise exception 'Resolution details can only be submitted when resolving an action';
    end if;
    if new.assignee_id is distinct from old.assignee_id then
      if not can_manage then raise exception 'Only an action manager can reassign this action'; end if;
      if not exists (
        select 1 from public.memberships membership join public.profiles profile on profile.id = membership.user_id
        where membership.user_id = new.assignee_id and membership.organization_id = old.organization_id and profile.account_status = 'active'
      ) then raise exception 'The assignee must be an active member of this organization'; end if;
      new.assigned_at := now();
    else new.assigned_at := old.assigned_at;
    end if;
    if new.status = 'resolved' and old.status = 'open' then
      if old.assignee_id <> (select auth.uid()) then
        raise exception 'Only the assigned user can resolve this action';
      end if;
      if new.proof_storage_path is not null and new.proof_storage_path not like current_organization_id::text || '/actions/' || new.id::text || '/' || (select auth.uid())::text || '/%' then
        raise exception 'Action proof path is invalid';
      end if;
      new.resolved_at := now(); new.resolved_by := (select auth.uid());
    elsif new.status is distinct from old.status then raise exception 'Invalid action status transition';
    else new.resolved_at := null; new.resolved_by := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
