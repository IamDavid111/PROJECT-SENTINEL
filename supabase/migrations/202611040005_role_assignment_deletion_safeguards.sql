alter table public.organization_builtin_role_settings
  add column if not exists is_deleted boolean not null default false;

alter table public.custom_roles
  add column if not exists is_deleted boolean not null default false;

update public.custom_roles
set is_deleted = true
where is_active = false
  and not is_deleted
  and not exists (
    select 1
    from public.memberships membership
    where membership.organization_id = custom_roles.organization_id
      and membership.role = custom_roles.name
  );

drop index if exists public.organization_builtin_role_display_name_uidx;
create unique index organization_builtin_role_display_name_uidx
  on public.organization_builtin_role_settings (organization_id, lower(display_name))
  where not is_deleted;

create or replace function public.is_org_admin_for_role_management(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships membership
    join public.profiles profile
      on profile.id = membership.user_id
     and profile.organization_id = membership.organization_id
    where membership.user_id = auth.uid()
      and membership.organization_id = p_organization_id
      and membership.role = 'Super Administrator'
      and profile.account_status = 'active'
  );
$$;

create or replace function public.has_org_permission(
  p_organization_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships membership
    join public.profiles profile
      on profile.id = membership.user_id
     and profile.organization_id = membership.organization_id
    where membership.organization_id = p_organization_id
      and membership.user_id = auth.uid()
      and profile.account_status = 'active'
      and case
        when membership.role = 'Super Administrator' then true
        when public.is_builtin_role_name(membership.role) then exists (
          select 1
          from public.organization_builtin_role_settings role_setting
          where role_setting.organization_id = membership.organization_id
            and role_setting.role_key = membership.role
            and not role_setting.is_deleted
            and role_setting.permissions ? p_permission
        )
        else exists (
          select 1
          from public.custom_roles custom_role
          where custom_role.organization_id = membership.organization_id
            and custom_role.name = membership.role
            and not custom_role.is_deleted
            and custom_role.permissions ? p_permission
        )
      end
  );
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
  if p_role_key not in (
    'Organization Administrator', 'QHSE Manager', 'Site Supervisor',
    'Safety Officer / HSE Officer'
  ) then
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
  if p_role_key not in (
    'Organization Administrator', 'QHSE Manager', 'Site Supervisor',
    'Safety Officer / HSE Officer'
  ) then
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

create or replace function public.update_custom_role(
  p_role_id uuid,
  p_name text,
  p_description text,
  p_permissions jsonb,
  p_scope jsonb,
  p_is_active boolean
)
returns public.custom_roles
language plpgsql
security definer
set search_path = public
as $$
declare
  role_record public.custom_roles;
  old_data jsonb;
  new_name text;
  new_description text;
  new_permissions jsonb;
  new_scope jsonb;
  new_active boolean;
  previous_rename_context text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  select organization_id into role_record.organization_id
  from public.custom_roles
  where id = p_role_id;
  if not found then
    raise exception 'Custom role not found';
  end if;
  perform 1 from public.organizations
  where id = role_record.organization_id
  for update;

  select * into role_record
  from public.custom_roles
  where id = p_role_id
  for update;
  if not found or role_record.is_deleted then
    raise exception 'Custom role not found or archived';
  end if;
  if role_record.is_system then
    raise exception 'Built-in roles cannot be changed through the custom role API';
  end if;
  if not public.is_org_admin_for_role_management(role_record.organization_id) then
    raise exception 'Only authorized organization administrators can update custom roles' using errcode = '42501';
  end if;

  old_data := jsonb_build_object(
    'name', role_record.name,
    'description', role_record.description,
    'permissions', role_record.permissions,
    'scope', role_record.scope,
    'is_active', role_record.is_active
  );
  new_name := coalesce(nullif(btrim(p_name), ''), role_record.name);
  new_description := case when p_description is null then role_record.description else nullif(btrim(p_description), '') end;
  new_permissions := coalesce(p_permissions, role_record.permissions);
  new_scope := coalesce(p_scope, role_record.scope);
  new_active := coalesce(p_is_active, role_record.is_active);

  if new_name = '' or public.is_builtin_role_name(new_name) then
    raise exception 'A valid custom role name is required';
  end if;
  if not public.is_valid_custom_permission_list(new_permissions) then
    raise exception 'One or more permission keys are not valid for this organization';
  end if;
  if jsonb_typeof(new_scope) not in ('object', 'null') then
    raise exception 'Role scope must be a JSON object';
  end if;
  if exists (
    select 1 from public.custom_roles other_role
    where other_role.organization_id = role_record.organization_id
      and lower(other_role.name) = lower(new_name)
      and other_role.id <> p_role_id
  ) or exists (
    select 1 from public.organization_builtin_role_settings builtin_role
    where builtin_role.organization_id = role_record.organization_id
      and not builtin_role.is_deleted
      and lower(builtin_role.display_name) = lower(new_name)
  ) then
    raise exception 'A role with this name already exists in this organization' using errcode = '23505';
  end if;

  previous_rename_context := current_setting('app.custom_role_rename', true);
  if new_name is distinct from role_record.name then
    perform set_config('app.custom_role_rename', 'on', true);
  end if;
  update public.custom_roles
  set name = new_name,
      description = new_description,
      permissions = new_permissions,
      scope = new_scope,
      is_active = new_active,
      updated_at = now()
  where id = p_role_id
  returning * into role_record;
  if new_name is distinct from (old_data ->> 'name') then
    perform set_config('app.custom_role_rename', coalesce(previous_rename_context, ''), true);
  end if;

  insert into public.role_audit_events (
    organization_id, actor_id, target_role_id, action, before_data, after_data, reason
  ) values (
    role_record.organization_id,
    auth.uid(),
    role_record.id,
    'updated',
    old_data,
    jsonb_build_object(
      'name', role_record.name,
      'description', role_record.description,
      'permissions', role_record.permissions,
      'scope', role_record.scope,
      'is_active', role_record.is_active
    ),
    'Custom role updated by organization administrator'
  );
  return role_record;
end;
$$;

drop function if exists public.delete_custom_role(uuid);

create function public.delete_custom_role(p_role_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  role_record public.custom_roles;
  assigned_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  select organization_id into role_record.organization_id
  from public.custom_roles
  where id = p_role_id;
  if not found then
    raise exception 'Custom role not found';
  end if;
  perform 1 from public.organizations
  where id = role_record.organization_id
  for update;

  select * into role_record
  from public.custom_roles
  where id = p_role_id
  for update;
  if not found or role_record.is_deleted then
    raise exception 'Custom role not found or already deleted';
  end if;
  if role_record.is_system then
    raise exception 'Built-in roles cannot be deleted';
  end if;
  if not public.is_org_admin_for_role_management(role_record.organization_id) then
    raise exception 'Only authorized organization administrators can delete custom roles' using errcode = '42501';
  end if;

  select count(*) into assigned_count
  from public.memberships
  where organization_id = role_record.organization_id
    and role = role_record.name;
  if assigned_count > 0 then
    insert into public.activity_logs (organization_id, user_id, activity, metadata)
    values (
      role_record.organization_id,
      auth.uid(),
      'Custom role deletion blocked',
      jsonb_build_object(
        'role_id', role_record.id,
        'role_name', role_record.name,
        'action', 'DELETE_ROLE_BLOCKED_ASSIGNED',
        'assigned_user_count', assigned_count
      )
    );
    insert into public.role_audit_events (
      organization_id, actor_id, target_role_id, action, before_data, after_data, reason
    ) values (
      role_record.organization_id,
      auth.uid(),
      role_record.id,
      'rejected',
      jsonb_build_object('name', role_record.name, 'is_active', role_record.is_active),
      jsonb_build_object('assigned_user_count', assigned_count),
      'Deletion blocked because users remain assigned to the role'
    );
    return jsonb_build_object('deleted', false, 'assigned_user_count', assigned_count);
  end if;

  update public.custom_roles
  set is_active = false,
      is_deleted = true,
      updated_at = now()
  where id = p_role_id
  returning * into role_record;

  insert into public.role_audit_events (
    organization_id, actor_id, target_role_id, action, before_data, after_data, reason
  ) values (
    role_record.organization_id,
    auth.uid(),
    role_record.id,
    'deleted',
    jsonb_build_object('name', role_record.name, 'is_active', true, 'is_deleted', false),
    jsonb_build_object('name', role_record.name, 'is_active', false, 'is_deleted', true),
    'Custom role deleted after verifying no user assignments'
  );
  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  values (
    role_record.organization_id,
    auth.uid(),
    'Custom role deleted',
    jsonb_build_object('role_id', role_record.id, 'role_name', role_record.name, 'action', 'DELETE_CUSTOM_ROLE')
  );
  return jsonb_build_object('deleted', true, 'assigned_user_count', 0);
end;
$$;

create or replace function public.restore_custom_role(p_role_id uuid)
returns public.custom_roles
language plpgsql
security definer
set search_path = public
as $$
declare
  role_record public.custom_roles;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  select organization_id into role_record.organization_id
  from public.custom_roles
  where id = p_role_id;
  if not found then
    raise exception 'Custom role not found';
  end if;
  perform 1 from public.organizations
  where id = role_record.organization_id
  for update;

  select * into role_record
  from public.custom_roles
  where id = p_role_id and is_deleted
  for update;
  if not found then
    raise exception 'Archived custom role not found';
  end if;
  if not public.is_org_admin_for_role_management(role_record.organization_id) then
    raise exception 'Not authorized to restore this role' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.custom_roles other_role
    where other_role.organization_id = role_record.organization_id
      and lower(other_role.name) = lower(role_record.name)
      and other_role.id <> role_record.id
      and not other_role.is_deleted
  ) then
    raise exception 'An active role already uses this name' using errcode = '23505';
  end if;
  update public.custom_roles
  set is_deleted = false, is_active = true, updated_at = now()
  where id = p_role_id
  returning * into role_record;
  insert into public.role_audit_events (
    organization_id, actor_id, target_role_id, action, before_data, after_data, reason
  ) values (
    role_record.organization_id, auth.uid(), role_record.id, 'updated',
    jsonb_build_object('name', role_record.name, 'is_active', false, 'is_deleted', true),
    jsonb_build_object('name', role_record.name, 'is_active', true, 'is_deleted', false),
    'Custom role restored by organization administrator'
  );
  return role_record;
end;
$$;

create or replace function public.enforce_builtin_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.role is not distinct from new.role then
    return new;
  end if;
  if current_setting('app.super_admin_removal_target', true) = new.user_id::text then
    return new;
  end if;
  if current_setting('app.custom_role_rename', true) = 'on' then
    return new;
  end if;
  perform 1 from public.organizations
  where id = new.organization_id
  for update;
  if public.is_builtin_role_name(new.role) then
    if new.role = 'Super Administrator' then
      return new;
    end if;
    if not exists (
      select 1 from public.organization_builtin_role_settings role_setting
      where role_setting.organization_id = new.organization_id
        and role_setting.role_key = new.role
        and role_setting.is_active
        and not role_setting.is_deleted
    ) then
      raise exception 'This built-in role is disabled or deleted for new assignments' using errcode = '42501';
    end if;
  elsif not exists (
    select 1 from public.custom_roles custom_role
    where custom_role.organization_id = new.organization_id
      and custom_role.name = new.role
      and custom_role.is_active
      and not custom_role.is_deleted
  ) then
    raise exception 'This custom role is disabled or deleted for new assignments' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_enforce_builtin_role_assignment on public.memberships;
create trigger memberships_enforce_builtin_role_assignment
before insert or update of role on public.memberships
for each row execute function public.enforce_builtin_role_assignment();

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
  actor_id uuid := auth.uid();
  normalized_role text := btrim(p_role);
  target_membership public.memberships;
  role_is_valid boolean;
begin
  if actor_id is null or not public.has_org_permission(p_organization_id, 'manage_user_roles') then
    raise exception 'You are not authorized to change user roles' using errcode = '42501';
  end if;
  if normalized_role is null or normalized_role = '' or normalized_role = 'Super Administrator' then
    raise exception 'Use a valid non-Super Administrator role';
  end if;
  perform 1 from public.organizations
  where id = p_organization_id
  for update;

  select * into target_membership
  from public.memberships
  where user_id = p_target_user_id
    and organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'The target user does not belong to this organization';
  end if;
  if target_membership.role = 'Super Administrator' then
    raise exception 'Use the Super Administrator removal action to change this role' using errcode = '42501';
  end if;

  if public.is_builtin_role_name(normalized_role) then
    select exists (
      select 1 from public.organization_builtin_role_settings role_setting
      where role_setting.organization_id = p_organization_id
        and role_setting.role_key = normalized_role
        and role_setting.is_active
        and not role_setting.is_deleted
    ) into role_is_valid;
  else
    select exists (
      select 1 from public.custom_roles custom_role
      where custom_role.organization_id = p_organization_id
        and custom_role.name = normalized_role
        and custom_role.is_active
        and not custom_role.is_deleted
    ) into role_is_valid;
  end if;
  if not role_is_valid then
    raise exception 'The selected role is not active in this organization';
  end if;

  update public.memberships
  set role = normalized_role
  where id = target_membership.id;
  insert into public.role_audit_events (
    organization_id, actor_id, action, before_data, after_data, reason
  ) values (
    p_organization_id, actor_id, 'updated',
    jsonb_build_object('user_id', p_target_user_id, 'role', target_membership.role),
    jsonb_build_object('user_id', p_target_user_id, 'role', normalized_role),
    'Organization member role changed'
  );
  return jsonb_build_object('updated', true, 'role', normalized_role);
end;
$$;

drop function if exists public.list_organization_builtin_roles(uuid);

create function public.list_organization_builtin_roles(p_organization_id uuid)
returns table(role_key text, display_name text, is_active boolean, is_deleted boolean, permissions jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_org_member(p_organization_id) then
    raise exception 'Organization membership is required' using errcode = '42501';
  end if;
  return query
  select setting.role_key, setting.display_name, setting.is_active, setting.is_deleted, setting.permissions
  from public.organization_builtin_role_settings setting
  where setting.organization_id = p_organization_id
  order by setting.display_name;
end;
$$;

revoke all on function public.update_organization_builtin_role(uuid, text, text, boolean, jsonb) from public, anon;
revoke all on function public.delete_organization_builtin_role(uuid, text) from public, anon;
revoke all on function public.update_custom_role(uuid, text, text, jsonb, jsonb, boolean) from public, anon;
revoke all on function public.delete_custom_role(uuid) from public, anon;
revoke all on function public.restore_custom_role(uuid) from public, anon;
revoke all on function public.update_user_role(uuid, uuid, text) from public, anon;
revoke all on function public.list_organization_builtin_roles(uuid) from public, anon;
revoke all on function public.enforce_builtin_role_assignment() from public, anon, authenticated;

grant execute on function public.update_organization_builtin_role(uuid, text, text, boolean, jsonb) to authenticated;
grant execute on function public.delete_organization_builtin_role(uuid, text) to authenticated;
grant execute on function public.update_custom_role(uuid, text, text, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.delete_custom_role(uuid) to authenticated;
grant execute on function public.restore_custom_role(uuid) to authenticated;
grant execute on function public.update_user_role(uuid, uuid, text) to authenticated;
grant execute on function public.list_organization_builtin_roles(uuid) to authenticated;

notify pgrst, 'reload schema';
