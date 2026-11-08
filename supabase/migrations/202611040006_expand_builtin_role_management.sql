create or replace function public.is_org_manageable_builtin_role_key(p_role_key text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_role_key = any(array[
    'Organization Administrator',
    'QHSE Manager',
    'Site Supervisor',
    'Safety Officer / HSE Officer',
    'Auditor',
    'Contractor',
    'Executive / Management',
    'Field Worker',
    'Maintenance Engineer'
  ]::text[]);
$$;

create or replace function public.update_organization_builtin_role(
  p_organization_id uuid,
  p_role_key text,
  p_display_name text,
  p_is_active boolean,
  p_permissions jsonb
)
returns public.organization_builtin_role_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  role_setting public.organization_builtin_role_settings;
  old_data jsonb;
  normalized_name text := nullif(btrim(p_display_name), '');
  permission_name text;
  has_executive_permission boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  perform 1 from public.organizations
  where id = p_organization_id
  for update;
  if not found then
    raise exception 'Organization not found';
  end if;
  if not exists (
    select 1
    from public.memberships membership
    join public.profiles profile
      on profile.id = membership.user_id
     and profile.organization_id = membership.organization_id
    where membership.organization_id = p_organization_id
      and membership.user_id = auth.uid()
      and membership.role = 'Super Administrator'
      and profile.account_status = 'active'
  ) then
    raise exception 'Only an active Super Administrator can manage built-in roles' using errcode = '42501';
  end if;
  if not public.is_org_manageable_builtin_role_key(p_role_key) then
    raise exception 'This built-in role is protected from organization-level changes' using errcode = '42501';
  end if;
  if normalized_name is null or p_is_active is null then
    raise exception 'A role name and active state are required';
  end if;
  if lower(normalized_name) <> lower(p_role_key)
    and public.is_builtin_role_name(normalized_name) then
    raise exception 'Built-in role names are reserved';
  end if;
  if jsonb_typeof(p_permissions) is distinct from 'array' then
    raise exception 'Role permissions must be a JSON array';
  end if;
  for permission_name in select jsonb_array_elements_text(p_permissions)
  loop
    if permission_name is null or permission_name <> all(public.custom_role_permissions_allowed()) then
      raise exception 'One or more permissions are not recognized';
    end if;
  end loop;
  if exists (
    select 1
    from public.organization_builtin_role_settings other_setting
    where other_setting.organization_id = p_organization_id
      and other_setting.role_key <> p_role_key
      and not other_setting.is_deleted
      and lower(other_setting.display_name) = lower(normalized_name)
  ) or exists (
    select 1
    from public.custom_roles custom_role
    where custom_role.organization_id = p_organization_id
      and lower(custom_role.name) = lower(normalized_name)
  ) then
    raise exception 'A built-in or custom role already uses this name';
  end if;

  select * into role_setting
  from public.organization_builtin_role_settings
  where organization_id = p_organization_id
    and role_key = p_role_key
    and not is_deleted
  for update;
  if not found then
    raise exception 'Built-in role settings were not found';
  end if;
  old_data := jsonb_build_object(
    'display_name', role_setting.display_name,
    'is_active', role_setting.is_active,
    'permissions', role_setting.permissions
  );

  has_executive_permission := role_setting.permissions ? 'view_executive_analytics'
    or p_permissions ? 'view_executive_analytics';
  if has_executive_permission
    and not public.has_org_role(p_organization_id, array['Super Administrator']::public.membership_role[]) then
    raise exception 'Only a Super Administrator can grant or revoke Executive Analytics access' using errcode = '42501';
  end if;

  update public.organization_builtin_role_settings
  set display_name = normalized_name,
      is_active = p_is_active,
      permissions = p_permissions,
      updated_by = auth.uid(),
      updated_at = now()
  where organization_id = p_organization_id
    and role_key = p_role_key
  returning * into role_setting;

  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  values (
    p_organization_id,
    auth.uid(),
    case
      when role_setting.display_name is distinct from p_role_key then 'Built-in role updated'
      else 'Built-in role permissions updated'
    end,
    jsonb_build_object(
      'role_key', p_role_key,
      'before', old_data,
      'role_name', role_setting.display_name,
      'is_active', role_setting.is_active,
      'permissions', role_setting.permissions,
      'action', 'UPDATE_BUILTIN_ROLE'
    )
  );
  return role_setting;
end;
$$;

create or replace function public.delete_organization_builtin_role(
  p_organization_id uuid,
  p_role_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  role_setting public.organization_builtin_role_settings;
  assigned_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  perform 1 from public.organizations
  where id = p_organization_id
  for update;
  if not found then
    raise exception 'Organization not found';
  end if;
  if not exists (
    select 1
    from public.memberships membership
    join public.profiles profile
      on profile.id = membership.user_id
     and profile.organization_id = membership.organization_id
    where membership.organization_id = p_organization_id
      and membership.user_id = auth.uid()
      and membership.role = 'Super Administrator'
      and profile.account_status = 'active'
  ) then
    raise exception 'Only an active Super Administrator can delete built-in roles' using errcode = '42501';
  end if;
  if not public.is_org_manageable_builtin_role_key(p_role_key) then
    raise exception 'This built-in role is protected from organization-level deletion' using errcode = '42501';
  end if;

  select * into role_setting
  from public.organization_builtin_role_settings
  where organization_id = p_organization_id
    and role_key = p_role_key
    and not is_deleted
  for update;
  if not found then
    raise exception 'Built-in role not found or already deleted';
  end if;

  select count(*) into assigned_count
  from public.memberships
  where organization_id = p_organization_id
    and role = p_role_key;
  if assigned_count > 0 then
    insert into public.activity_logs (organization_id, user_id, activity, metadata)
    values (
      p_organization_id,
      auth.uid(),
      'Built-in role deletion blocked',
      jsonb_build_object(
        'role_key', p_role_key,
        'role_name', role_setting.display_name,
        'action', 'DELETE_ROLE_BLOCKED_ASSIGNED',
        'assigned_user_count', assigned_count
      )
    );
    return jsonb_build_object('deleted', false, 'assigned_user_count', assigned_count);
  end if;

  update public.organization_builtin_role_settings
  set is_deleted = true,
      is_active = false,
      updated_by = auth.uid(),
      updated_at = now()
  where organization_id = p_organization_id
    and role_key = p_role_key;

  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  values (
    p_organization_id,
    auth.uid(),
    'Built-in role deleted',
    jsonb_build_object(
      'role_key', p_role_key,
      'role_name', role_setting.display_name,
      'action', 'DELETE_BUILTIN_ROLE'
    )
  );
  return jsonb_build_object('deleted', true, 'assigned_user_count', 0);
end;
$$;

revoke all on function public.is_org_manageable_builtin_role_key(text) from public, anon;
grant execute on function public.is_org_manageable_builtin_role_key(text) to authenticated;

notify pgrst, 'reload schema';
