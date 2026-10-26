create or replace function public.is_valid_custom_permission_list(permission_list jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  allowed_permissions text[] := public.custom_role_permissions_allowed() || array['view_all_assigned_actions']::text[];
  permission_value text;
begin
  if jsonb_typeof(permission_list) is distinct from 'array' then
    return false;
  end if;

  for permission_value in
    select jsonb_array_elements_text(permission_list)
  loop
    if permission_value = any(allowed_permissions) = false then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.can_view_action(target_organization_id uuid, target_action_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.actions action
    where action.id = target_action_id and action.organization_id = target_organization_id
      and public.is_org_member(target_organization_id)
      and (
        public.has_inspection_action_permission(target_organization_id, 'manage_actions')
        or action.assignee_id = (select auth.uid())
        or public.has_inspection_action_permission(target_organization_id, 'view_all_assigned_actions')
      )
  );
$$;

revoke all on function public.can_view_action(uuid, uuid) from public, anon;
grant execute on function public.can_view_action(uuid, uuid) to authenticated;

create policy action_evidence_insert_assignee_only
  on storage.objects as restrictive
  for insert to authenticated
  with check (
    bucket_id <> 'incident-evidence'
    or (storage.foldername(name))[2] <> 'actions'
    or exists (
      select 1 from public.actions action
      where action.id::text = (storage.foldername(name))[3]
        and action.organization_id::text = (storage.foldername(name))[1]
        and action.assignee_id = (select auth.uid())
    )
  );
