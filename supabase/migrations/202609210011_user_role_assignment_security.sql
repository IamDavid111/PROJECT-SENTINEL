create or replace function public.update_user_role(
  p_organization_id uuid,
  p_target_user_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_role text := trim(p_role);
  target_membership public.memberships;
  previous_role text;
  custom_role_exists boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_role(p_organization_id, array[
    'Super Administrator', 'Organization Administrator'
  ]::public.membership_role[]) then
    raise exception 'Only organization administrators can change user roles';
  end if;

  if normalized_role = '' then
    raise exception 'Role is required';
  end if;

  if not public.is_builtin_role_name(normalized_role) then
    select exists (
      select 1
      from public.custom_roles
      where organization_id = p_organization_id
        and name = normalized_role
        and is_active = true
    ) into custom_role_exists;
    if not custom_role_exists then
      raise exception 'The selected role is not active in this organization';
    end if;
  end if;

  select * into target_membership
    from public.memberships
   where user_id = p_target_user_id
     and organization_id = p_organization_id
   for update;

  if not found then
    raise exception 'The target user does not belong to this organization';
  end if;

  previous_role := target_membership.role;
  if previous_role = normalized_role then
    return jsonb_build_object('updated', false, 'role', normalized_role);
  end if;

  update public.memberships
     set role = normalized_role
   where id = target_membership.id;

  insert into public.role_audit_events (
    organization_id,
    actor_id,
    action,
    before_data,
    after_data,
    reason
  ) values (
    p_organization_id,
    current_user_id,
    'updated',
    jsonb_build_object('user_id', p_target_user_id, 'role', previous_role),
    jsonb_build_object('user_id', p_target_user_id, 'role', normalized_role),
    'Organization member role changed'
  );

  return jsonb_build_object('updated', true, 'role', normalized_role);
end;
$$;

revoke all on function public.update_user_role(uuid, uuid, text) from public, anon;
grant execute on function public.update_user_role(uuid, uuid, text) to authenticated;
