create table if not exists public.custom_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  permissions jsonb not null default '[]'::jsonb,
  scope jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.role_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  target_role_id uuid references public.custom_roles(id) on delete set null,
  action text not null check (action in ('created', 'updated', 'deleted', 'rejected')),
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists custom_roles_organization_id_idx on public.custom_roles (organization_id, is_active);
create index if not exists custom_roles_name_idx on public.custom_roles (organization_id, lower(name));
create unique index if not exists custom_roles_organization_lower_name_uidx
  on public.custom_roles (organization_id, lower(name));
create index if not exists role_audit_events_org_created_idx on public.role_audit_events (organization_id, created_at desc);

create or replace function public.is_builtin_role_name(candidate_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(candidate_name)) in (
    'super administrator',
    'organization administrator',
    'qhse manager',
    'site supervisor',
    'safety officer / hse officer',
    'auditor',
    'maintenance engineer',
    'field worker',
    'contractor',
    'executive / management'
  );
$$;

create or replace function public.custom_role_permissions_allowed()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array[
    'view_dashboard',
    'report_incident',
    'use_ai_assistant',
    'view_executive_analytics',
    'view_marketplace',
    'create_inspection',
    'create_corrective_action',
    'start_audit',
    'view_reports',
    'manage_users',
    'view_profile',
    'view_activity',
    'manage_settings'
  ];
$$;

create or replace function public.is_valid_custom_permission_list(permission_list jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  allowed_permissions text[] := public.custom_role_permissions_allowed();
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

create or replace function public.is_org_admin_for_role_management(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and organization_id = p_organization_id
      and role = any(array['Super Administrator', 'Organization Administrator']::text[])
  );
$$;

create or replace function public.list_custom_roles(p_organization_id uuid)
returns table (
  id uuid,
  organization_id uuid,
  name text,
  description text,
  permissions jsonb,
  scope jsonb,
  is_system boolean,
  is_active boolean,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select cr.id,
         cr.organization_id,
         cr.name,
         cr.description,
         cr.permissions,
         cr.scope,
         cr.is_system,
         cr.is_active,
         cr.created_by,
         cr.created_at,
         cr.updated_at
  from public.custom_roles cr
  where cr.organization_id = p_organization_id
    and public.is_org_member(p_organization_id)
    and cr.is_active = true
  order by cr.name asc;
$$;

create or replace function public.create_custom_role(
  p_organization_id uuid,
  p_name text,
  p_description text,
  p_permissions jsonb,
  p_scope jsonb
)
returns public.custom_roles
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text := trim(p_name);
  normalized_description text := nullif(trim(p_description), '');
  normalized_permissions jsonb := coalesce(p_permissions, '[]'::jsonb);
  normalized_scope jsonb := coalesce(p_scope, '{}'::jsonb);
  new_role public.custom_roles;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_organization_id is null then
    raise exception 'Organization is required';
  end if;

  if normalized_name = '' then
    raise exception 'Role name is required';
  end if;

  if public.is_builtin_role_name(normalized_name) then
    raise exception 'This role name is reserved for a built-in system role';
  end if;

  if not public.is_org_admin_for_role_management(p_organization_id) then
    raise exception 'Only organization administrators can create custom roles';
  end if;

  if not public.is_valid_custom_permission_list(normalized_permissions) then
    raise exception 'One or more permission keys are not valid for this organization';
  end if;

  if jsonb_typeof(normalized_scope) not in ('object', 'null') then
    raise exception 'Role scope must be a JSON object';
  end if;

  if exists (
    select 1
    from public.custom_roles
    where organization_id = p_organization_id
      and lower(name) = lower(normalized_name)
      and is_active = true
  ) then
    raise exception 'A custom role with this name already exists in this organization';
  end if;

  insert into public.custom_roles (
    organization_id,
    name,
    description,
    permissions,
    scope,
    is_system,
    is_active,
    created_by
  )
  values (
    p_organization_id,
    normalized_name,
    normalized_description,
    normalized_permissions,
    normalized_scope,
    false,
    true,
    auth.uid()
  )
  returning * into new_role;

  insert into public.role_audit_events (
    organization_id,
    actor_id,
    target_role_id,
    action,
    before_data,
    after_data,
    reason
  )
  values (
    p_organization_id,
    auth.uid(),
    new_role.id,
    'created',
    '{}'::jsonb,
    jsonb_build_object(
      'role_id', new_role.id,
      'name', new_role.name,
      'permissions', new_role.permissions,
      'scope', new_role.scope,
      'organization_id', new_role.organization_id
    ),
    'Custom role created by organization administrator'
  );

  return new_role;
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
  new_name text;
  new_description text;
  new_permissions jsonb;
  new_scope jsonb;
  new_active boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select * into role_record
  from public.custom_roles
  where id = p_role_id;

  if role_record.id is null then
    raise exception 'Custom role not found';
  end if;

  if role_record.is_system then
    raise exception 'Built-in roles cannot be changed through the custom role API';
  end if;

  if not public.is_org_admin_for_role_management(role_record.organization_id) then
    raise exception 'Only organization administrators can update custom roles';
  end if;

  new_name := coalesce(trim(p_name), role_record.name);
  new_description := case when p_description is null then role_record.description else nullif(trim(p_description), '') end;
  new_permissions := coalesce(p_permissions, role_record.permissions);
  new_scope := coalesce(p_scope, role_record.scope);
  new_active := coalesce(p_is_active, role_record.is_active);

  if new_name = '' then
    raise exception 'Role name is required';
  end if;

  if public.is_builtin_role_name(new_name) then
    raise exception 'This role name is reserved for a built-in system role';
  end if;

  if not public.is_valid_custom_permission_list(new_permissions) then
    raise exception 'One or more permission keys are not valid for this organization';
  end if;

  if jsonb_typeof(new_scope) not in ('object', 'null') then
    raise exception 'Role scope must be a JSON object';
  end if;

  if exists (
    select 1
    from public.custom_roles
    where organization_id = role_record.organization_id
      and lower(name) = lower(new_name)
      and id <> p_role_id
      and is_active = true
  ) then
    raise exception 'A custom role with this name already exists in this organization';
  end if;

  update public.custom_roles
  set
    name = new_name,
    description = new_description,
    permissions = new_permissions,
    scope = new_scope,
    is_active = new_active,
    updated_at = now()
  where id = p_role_id;

  select * into role_record
  from public.custom_roles
  where id = p_role_id;

  insert into public.role_audit_events (
    organization_id,
    actor_id,
    target_role_id,
    action,
    before_data,
    after_data,
    reason
  )
  values (
    role_record.organization_id,
    auth.uid(),
    role_record.id,
    'updated',
    jsonb_build_object(
      'name', role_record.name,
      'permissions', role_record.permissions,
      'scope', role_record.scope,
      'is_active', role_record.is_active
    ),
    jsonb_build_object(
      'name', role_record.name,
      'permissions', role_record.permissions,
      'scope', role_record.scope,
      'is_active', role_record.is_active
    ),
    'Custom role updated by organization administrator'
  );

  return role_record;
end;
$$;

create or replace function public.delete_custom_role(p_role_id uuid)
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

  select * into role_record
  from public.custom_roles
  where id = p_role_id;

  if role_record.id is null then
    raise exception 'Custom role not found';
  end if;

  if role_record.is_system then
    raise exception 'Built-in roles cannot be deleted';
  end if;

  if not public.is_org_admin_for_role_management(role_record.organization_id) then
    raise exception 'Only organization administrators can delete custom roles';
  end if;

  update public.custom_roles
  set is_active = false,
      updated_at = now()
  where id = p_role_id;

  select * into role_record
  from public.custom_roles
  where id = p_role_id;

  insert into public.role_audit_events (
    organization_id,
    actor_id,
    target_role_id,
    action,
    before_data,
    after_data,
    reason
  )
  values (
    role_record.organization_id,
    auth.uid(),
    role_record.id,
    'deleted',
    jsonb_build_object(
      'name', role_record.name,
      'permissions', role_record.permissions,
      'scope', role_record.scope,
      'is_active', true
    ),
    jsonb_build_object(
      'name', role_record.name,
      'permissions', role_record.permissions,
      'scope', role_record.scope,
      'is_active', false
    ),
    'Custom role archived by organization administrator'
  );

  return role_record;
end;
$$;

alter table public.custom_roles enable row level security;
alter table public.role_audit_events enable row level security;

create policy custom_roles_select_member on public.custom_roles
for select to authenticated
using (public.is_org_member(organization_id));

create policy custom_roles_insert_admin on public.custom_roles
for insert to authenticated
with check (
  public.is_org_admin_for_role_management(organization_id)
  and auth.uid() = created_by
);

create policy custom_roles_update_admin on public.custom_roles
for update to authenticated
using (public.is_org_admin_for_role_management(organization_id))
with check (public.is_org_admin_for_role_management(organization_id));

create policy custom_roles_delete_admin on public.custom_roles
for delete to authenticated
using (public.is_org_admin_for_role_management(organization_id));

create policy role_audit_events_select_member on public.role_audit_events
for select to authenticated
using (public.is_org_member(organization_id));

create policy role_audit_events_insert_admin on public.role_audit_events
for insert to authenticated
with check (
  public.is_org_admin_for_role_management(organization_id)
  and actor_id = auth.uid()
);

revoke all on public.custom_roles from public;
revoke all on public.role_audit_events from public;

grant select on public.custom_roles to authenticated;
grant select on public.role_audit_events to authenticated;

grant execute on function public.list_custom_roles(uuid) to authenticated;
grant execute on function public.create_custom_role(uuid, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.update_custom_role(uuid, text, text, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.delete_custom_role(uuid) to authenticated;
