-- Prompt 4 Batch 8: independent corrective-action verification.
-- Batch 7 owns action creation, assignment, and general progress UI.

create or replace function public.can_verify_corrective_action(target_organization_id uuid, target_action_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.corrective_actions action
    where action.id = target_action_id
      and action.organization_id = target_organization_id
      and public.is_org_member(target_organization_id)
      and public.has_org_role(target_organization_id, array[
        'Super Administrator', 'Organization Administrator', 'QHSE Manager',
        'Site Supervisor', 'Safety Officer / HSE Officer'
      ]::public.membership_role[])
      and action.assigned_owner_id is distinct from (select auth.uid())
  );
$$;
revoke all on function public.can_verify_corrective_action(uuid, uuid) from public, anon;
grant execute on function public.can_verify_corrective_action(uuid, uuid) to authenticated;
create or replace function public.submit_corrective_action_for_verification(target_action_id uuid)
returns public.corrective_actions
language plpgsql security definer set search_path = public
as $$
declare
  action_record public.corrective_actions;
begin
  select * into action_record from public.corrective_actions where id = target_action_id for update;
  if action_record.id is null then raise exception 'Corrective action not found'; end if;
  if not public.can_manage_corrective_action(action_record.organization_id, action_record.id) then raise exception 'You are not authorized to complete this corrective action'; end if;
  if action_record.assigned_owner_id is distinct from (select auth.uid()) and not public.has_org_role(action_record.organization_id, array['Super Administrator', 'Organization Administrator', 'QHSE Manager', 'Site Supervisor', 'Safety Officer / HSE Officer']::public.membership_role[]) then raise exception 'Only the action owner or an authorized manager can submit completion'; end if;
  if action_record.status not in ('assigned', 'in_progress', 'rejected') then raise exception 'Corrective action is not ready for verification'; end if;
  update public.corrective_actions set status = 'pending_verification', completion_date = current_date where id = action_record.id;
  insert into public.activity_logs (organization_id, user_id, activity, metadata) values (action_record.organization_id, (select auth.uid()), 'Corrective action verification requested', jsonb_build_object('corrective_action_id', action_record.id, 'incident_id', action_record.incident_id));
  return (select action from public.corrective_actions action where action.id = action_record.id);
end;
$$;
create or replace function public.verify_corrective_action(target_action_id uuid, approved boolean, notes text)
returns public.corrective_actions
language plpgsql security definer set search_path = public
as $$
declare
  action_record public.corrective_actions;
  next_status public.corrective_action_status;
  current_user_id uuid := (select auth.uid());
begin
  select * into action_record from public.corrective_actions where id = target_action_id for update;
  if action_record.id is null then raise exception 'Corrective action not found'; end if;
  if not public.can_verify_corrective_action(action_record.organization_id, action_record.id) then raise exception 'You are not authorized to verify this corrective action'; end if;
  if action_record.status <> 'pending_verification' then raise exception 'Corrective action is not pending verification'; end if;
  if not approved and char_length(btrim(coalesce(notes, ''))) < 3 then raise exception 'Rejection notes are required'; end if;

  next_status := case when approved then 'verified'::public.corrective_action_status else 'in_progress'::public.corrective_action_status end;
  update public.corrective_actions
  set status = next_status,
      verification_status = case when approved then 'approved' else 'rejected' end,
      verification_date = now(),
      verified_by = current_user_id,
      verification_notes = nullif(btrim(notes), '')
  where id = action_record.id;

  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  values (action_record.organization_id, current_user_id, case when approved then 'Corrective action verification approved' else 'Corrective action verification rejected' end, jsonb_build_object('corrective_action_id', action_record.id, 'incident_id', action_record.incident_id, 'verification_status', case when approved then 'approved' else 'rejected' end, 'notes', nullif(btrim(notes), '')));
  return (select action from public.corrective_actions action where action.id = action_record.id);
end;
$$;
revoke all on function public.submit_corrective_action_for_verification(uuid) from public, anon;
revoke all on function public.verify_corrective_action(uuid, boolean, text) from public, anon;
grant execute on function public.submit_corrective_action_for_verification(uuid) to authenticated;
grant execute on function public.verify_corrective_action(uuid, boolean, text) to authenticated;
create or replace function public.enforce_corrective_action_verification()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.organization_id <> old.organization_id or new.incident_id <> old.incident_id then raise exception 'Corrective action ownership cannot be changed'; end if;
  if new.status = 'pending_verification' and old.status <> 'pending_verification' and new.completion_date is null then raise exception 'Completion date is required before verification'; end if;
  if old.status = 'pending_verification' and new.status not in ('pending_verification', 'verified', 'in_progress') then raise exception 'Pending verification may only be approved or returned for rework'; end if;
  if new.status = 'verified' then
    if new.verified_by is null or new.verification_date is null or new.verification_status <> 'approved' then raise exception 'Approved verification metadata is required'; end if;
    if new.verified_by = new.assigned_owner_id then raise exception 'Action owner cannot verify their own action'; end if;
  end if;
  if new.verification_status = 'rejected' and char_length(btrim(coalesce(new.verification_notes, ''))) < 3 then raise exception 'Rejection notes are required'; end if;
  return new;
end;
$$;
drop trigger if exists corrective_actions_verification_integrity on public.corrective_actions;
create trigger corrective_actions_verification_integrity before update on public.corrective_actions for each row execute function public.enforce_corrective_action_verification();
