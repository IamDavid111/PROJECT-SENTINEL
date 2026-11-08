create table if not exists public.organization_builtin_role_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_key text not null,
  display_name text not null,
  is_active boolean not null default true,
  permissions jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, role_key),
  check (role_key <> 'Super Administrator'),
  check (length(btrim(display_name)) > 0),
  check (jsonb_typeof(permissions) = 'array')
);

create unique index if not exists organization_builtin_role_display_name_uidx
  on public.organization_builtin_role_settings (organization_id, lower(display_name));

create or replace function public.custom_role_permissions_allowed()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array[
    'view_dashboard', 'view_kpis', 'view_analytics', 'report_incident',
    'view_own_reports', 'view_all_assigned_actions', 'view_all_incidents',
    'manage_incidents', 'review_incidents', 'close_incidents', 'view_users',
    'invite_users', 'edit_users', 'suspend_users', 'deactivate_users',
    'manage_user_roles', 'view_roles_permissions', 'manage_roles_permissions',
    'view_all_reports', 'manage_reports', 'export_reports', 'manage_qhse',
    'manage_corrective_actions', 'manage_facility_risks', 'access_administration',
    'use_ai_assistant', 'view_executive_analytics', 'view_marketplace',
    'create_inspection', 'create_corrective_action', 'start_audit', 'view_reports',
    'manage_users', 'view_profile', 'view_activity', 'manage_settings',
    'view_knowledge_documents', 'manage_knowledge_documents',
    'approve_knowledge_documents', 'view_confidential_knowledge',
    'view_restricted_knowledge'
  ];
$$;

create or replace function public.default_builtin_role_permissions(p_role_key text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case p_role_key
    when 'Organization Administrator' then
      '["view_dashboard","view_kpis","report_incident","view_own_reports","view_analytics","access_administration","view_users","invite_users","edit_users","suspend_users","deactivate_users","manage_user_roles","view_roles_permissions","manage_roles_permissions","view_all_incidents","manage_incidents","view_all_reports","export_reports","manage_settings","view_knowledge_documents","manage_knowledge_documents","approve_knowledge_documents","view_confidential_knowledge","view_restricted_knowledge","use_ai_assistant","view_marketplace","create_inspection","create_corrective_action","start_audit","view_reports","view_profile","view_activity"]'::jsonb
    when 'QHSE Manager' then
      '["view_dashboard","view_kpis","report_incident","view_own_reports","view_analytics","view_all_incidents","manage_incidents","review_incidents","close_incidents","view_all_reports","manage_reports","manage_qhse","manage_corrective_actions","manage_facility_risks","view_knowledge_documents","manage_knowledge_documents","approve_knowledge_documents","view_confidential_knowledge","view_restricted_knowledge","use_ai_assistant","view_marketplace","create_inspection","create_corrective_action","start_audit","view_reports","view_profile","view_activity"]'::jsonb
    when 'Site Supervisor' then
      '["view_dashboard","view_kpis","report_incident","view_own_reports","view_analytics","view_all_incidents","review_incidents","view_all_reports","manage_corrective_actions","view_knowledge_documents","use_ai_assistant","create_inspection","create_corrective_action","view_profile"]'::jsonb
    when 'Safety Officer / HSE Officer' then
      '["view_dashboard","view_kpis","report_incident","view_own_reports","view_analytics","view_all_incidents","review_incidents","manage_incidents","view_all_reports","manage_corrective_actions","manage_facility_risks","view_knowledge_documents","manage_knowledge_documents","approve_knowledge_documents","view_confidential_knowledge","use_ai_assistant","create_inspection","create_corrective_action","start_audit","view_profile"]'::jsonb
    when 'Field Worker' then
      '["view_dashboard","view_kpis","report_incident","view_own_reports","view_analytics","view_knowledge_documents","use_ai_assistant","view_profile"]'::jsonb
    when 'Contractor' then
      '["view_dashboard","view_kpis","report_incident","view_own_reports","view_analytics","view_knowledge_documents","use_ai_assistant","create_inspection","view_marketplace","view_profile"]'::jsonb
    when 'Executive / Management' then
      '["view_dashboard","view_kpis","report_incident","view_own_reports","view_analytics","view_all_incidents","view_all_reports","view_knowledge_documents","use_ai_assistant","view_reports","view_profile"]'::jsonb
    when 'Maintenance Engineer' then
      '["view_dashboard","view_kpis","report_incident","view_own_reports","view_analytics","view_all_incidents","view_all_reports","manage_corrective_actions","view_knowledge_documents","use_ai_assistant","create_corrective_action","view_marketplace","view_profile"]'::jsonb
    when 'Auditor' then
      '["view_dashboard","view_kpis","report_incident","view_own_reports","view_analytics","view_knowledge_documents","use_ai_assistant","start_audit","view_reports","view_profile","view_activity"]'::jsonb
    else null
  end;
$$;

create or replace function public.seed_organization_builtin_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role_key text;
begin
  foreach role_key in array array[
    'Organization Administrator', 'QHSE Manager', 'Site Supervisor',
    'Safety Officer / HSE Officer', 'Field Worker', 'Contractor',
    'Executive / Management', 'Maintenance Engineer', 'Auditor'
  ] loop
    insert into public.organization_builtin_role_settings (
      organization_id, role_key, display_name, permissions
    ) values (
      new.id, role_key, role_key, public.default_builtin_role_permissions(role_key)
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists organizations_seed_builtin_roles on public.organizations;
create trigger organizations_seed_builtin_roles
after insert on public.organizations
for each row execute function public.seed_organization_builtin_roles();

insert into public.organization_builtin_role_settings (
  organization_id, role_key, display_name, permissions
)
select organization.id, role_key, role_key, public.default_builtin_role_permissions(role_key)
from public.organizations organization
cross join unnest(array[
  'Organization Administrator', 'QHSE Manager', 'Site Supervisor',
  'Safety Officer / HSE Officer', 'Field Worker', 'Contractor',
  'Executive / Management', 'Maintenance Engineer', 'Auditor'
]) as roles(role_key)
on conflict (organization_id, role_key) do nothing;

alter table public.organization_builtin_role_settings enable row level security;
drop policy if exists organization_builtin_role_settings_select_member on public.organization_builtin_role_settings;
create policy organization_builtin_role_settings_select_member
on public.organization_builtin_role_settings
for select to authenticated
using (public.is_org_member(organization_id));

revoke all on public.organization_builtin_role_settings from public, anon, authenticated;
grant select on public.organization_builtin_role_settings to authenticated;

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
            and role_setting.permissions ? p_permission
        )
        else exists (
          select 1
          from public.custom_roles custom_role
          where custom_role.organization_id = membership.organization_id
            and custom_role.name = membership.role
            and custom_role.is_active
            and custom_role.permissions ? p_permission
        )
      end
  );
$$;

create or replace function public.is_org_admin_for_role_management(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_permission(p_organization_id, 'manage_roles_permissions');
$$;

drop function if exists public.list_organization_builtin_roles(uuid);
create or replace function public.list_organization_builtin_roles(p_organization_id uuid)
returns table(role_key text, display_name text, is_active boolean, permissions jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_org_member(p_organization_id) then
    raise exception 'Organization membership is required' using errcode = '42501';
  end if;
  return query
  select setting.role_key, setting.display_name, setting.is_active, setting.permissions
  from public.organization_builtin_role_settings setting
  where setting.organization_id = p_organization_id
  order by setting.display_name;
end;
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
  if not public.is_org_admin_for_role_management(p_organization_id) then
    raise exception 'You are not authorized to manage organization roles' using errcode = '42501';
  end if;
  if p_role_key = 'Super Administrator' or not public.is_builtin_role_name(p_role_key) then
    raise exception 'This built-in role cannot be changed';
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
    if permission_name <> all(public.custom_role_permissions_allowed()) then
      raise exception 'One or more permissions are not recognized';
    end if;
  end loop;
  if exists (
    select 1
    from public.organization_builtin_role_settings other_setting
    where other_setting.organization_id = p_organization_id
      and other_setting.role_key <> p_role_key
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
  for update;
  if not found then
    raise exception 'Built-in role settings were not found';
  end if;

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
    'Built-in role settings changed',
    jsonb_build_object(
      'role_key', p_role_key,
      'display_name', role_setting.display_name,
      'is_active', role_setting.is_active,
      'permissions', role_setting.permissions,
      'action', 'UPDATE_BUILTIN_ROLE'
    )
  );
  return role_setting;
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
  if public.is_builtin_role_name(new.role)
    and new.role <> 'Super Administrator'
    and not exists (
      select 1
      from public.organization_builtin_role_settings role_setting
      where role_setting.organization_id = new.organization_id
        and role_setting.role_key = new.role
        and role_setting.is_active
    ) then
    raise exception 'This built-in role is disabled for new assignments' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_enforce_builtin_role_assignment on public.memberships;
create trigger memberships_enforce_builtin_role_assignment
before insert or update of role on public.memberships
for each row execute function public.enforce_builtin_role_assignment();

create or replace function public.guard_membership_tenant_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.organization_id is distinct from old.organization_id then
    raise exception 'Membership identity and organization cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_guard_tenant_identity on public.memberships;
create trigger memberships_guard_tenant_identity
before update on public.memberships
for each row execute function public.guard_membership_tenant_identity();

drop policy if exists memberships_manage_admin on public.memberships;
drop policy if exists memberships_update_roles on public.memberships;
create policy memberships_update_roles
on public.memberships
for update to authenticated
using (
  public.is_org_member(organization_id)
  and public.has_org_permission(organization_id, 'manage_user_roles')
)
with check (
  public.is_org_member(organization_id)
  and public.has_org_permission(organization_id, 'manage_user_roles')
  and exists (
    select 1 from public.profiles profile
    where profile.id = memberships.user_id
      and profile.organization_id = memberships.organization_id
  )
);

create or replace function public.enforce_profile_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id then
    raise exception 'Profile identity and organization cannot be changed';
  end if;

  if old.account_status::text = 'pending'
    and new.account_status::text = 'active'
    and old.id = auth.uid()
    and exists (
      select 1 from public.admin_invitations invitation
      where invitation.invited_user_id = old.id
        and invitation.organization_id = old.organization_id
        and invitation.status = 'pending'
        and invitation.expires_at > now()
    ) then
    return new;
  end if;

  if new.account_status is distinct from old.account_status then
    if new.account_status::text = 'suspended' then
      if not public.has_org_permission(old.organization_id, 'suspend_users') then
        raise exception 'You are not authorized to suspend this user' using errcode = '42501';
      end if;
    elsif new.account_status::text = 'inactive' then
      if not public.has_org_permission(old.organization_id, 'deactivate_users') then
        raise exception 'You are not authorized to deactivate this user' using errcode = '42501';
      end if;
    elsif not public.has_org_permission(old.organization_id, 'edit_users') then
      raise exception 'You are not authorized to change this user status' using errcode = '42501';
    end if;
  elsif old.id <> auth.uid()
    and not public.has_org_permission(old.organization_id, 'edit_users') then
    raise exception 'You are not authorized to edit this user' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_role_permissions on public.profiles;
create trigger profiles_enforce_role_permissions
before update on public.profiles
for each row execute function public.enforce_profile_role_permissions();

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin
on public.profiles
for update to authenticated
using (
  id = auth.uid()
  or (
    public.is_org_member(organization_id)
    and (
      public.has_org_permission(organization_id, 'edit_users')
      or public.has_org_permission(organization_id, 'suspend_users')
      or public.has_org_permission(organization_id, 'deactivate_users')
    )
  )
)
with check (
  id = auth.uid()
  or (
    public.is_org_member(organization_id)
    and (
      public.has_org_permission(organization_id, 'edit_users')
      or public.has_org_permission(organization_id, 'suspend_users')
      or public.has_org_permission(organization_id, 'deactivate_users')
    )
  )
);

create or replace function public.has_inspection_action_permission(
  target_organization_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case target_permission
    when 'manage_actions' then
      public.has_org_permission(target_organization_id, 'manage_corrective_actions')
      or public.has_org_permission(target_organization_id, 'create_corrective_action')
    else public.has_org_permission(target_organization_id, target_permission)
  end;
$$;

create or replace function public.has_knowledge_permission(
  target_organization_id uuid,
  permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_permission(target_organization_id, permission);
$$;

create or replace function public.knowledge_role_has_permission(
  target_organization_id uuid,
  role_name text,
  permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when role_name = 'Super Administrator' then true
    when public.is_builtin_role_name(role_name) then exists (
      select 1
      from public.organization_builtin_role_settings role_setting
      where role_setting.organization_id = target_organization_id
        and role_setting.role_key = role_name
        and role_setting.permissions ? permission
    )
    else exists (
      select 1
      from public.custom_roles custom_role
      where custom_role.organization_id = target_organization_id
        and custom_role.name = role_name
        and custom_role.is_active
        and custom_role.permissions ? permission
    )
  end;
$$;

create or replace function public.can_use_ai_sessions(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_permission(target_organization_id, 'use_ai_assistant');
$$;

create or replace function public.can_close_incidents(target_organization_id uuid)
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
      and membership.organization_id = target_organization_id
      and profile.account_status = 'active'
      and (
        public.has_org_permission(target_organization_id, 'close_incidents')
        or exists (
          select 1
          from public.incident_closure_delegates delegate
          where delegate.organization_id = membership.organization_id
            and delegate.user_id = membership.user_id
            and delegate.granted_role = membership.role
        )
      )
  );
$$;

create or replace function public.can_create_incident(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_permission(target_organization_id, 'report_incident');
$$;

create or replace function public.can_manage_incident(
  target_organization_id uuid,
  target_incident_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.incidents incident
    where incident.id = target_incident_id
      and incident.organization_id = target_organization_id
      and public.is_org_member(target_organization_id)
      and (
        public.has_org_permission(target_organization_id, 'manage_incidents')
        or (
          incident.created_by = auth.uid()
          and incident.status = 'draft'
        )
      )
  );
$$;

create or replace function public.can_view_incident(
  target_organization_id uuid,
  target_incident_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.incidents incident
    where incident.id = target_incident_id
      and incident.organization_id = target_organization_id
      and public.is_org_member(target_organization_id)
      and (
        (
          incident.status = 'draft'
          and incident.created_by = auth.uid()
        )
        or (
          incident.status <> 'draft'
          and (
            public.has_org_permission(target_organization_id, 'view_all_incidents')
            or public.can_close_incidents(target_organization_id)
            or (
              (incident.created_by = auth.uid() or incident.reported_by = auth.uid())
              and public.has_org_permission(target_organization_id, 'view_own_reports')
            )
          )
        )
      )
  );
$$;

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
    select 1 from public.investigations investigation
    where investigation.id = target_investigation_id
      and investigation.organization_id = target_organization_id
      and public.is_org_member(target_organization_id)
      and (
        public.has_org_permission(target_organization_id, 'view_all_incidents')
        or investigation.assigned_investigator_id = auth.uid()
        or investigation.investigation_lead_id = auth.uid()
        or (
          investigation.created_by = auth.uid()
          and public.has_org_permission(target_organization_id, 'view_own_reports')
        )
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
    select 1 from public.investigations investigation
    where investigation.id = target_investigation_id
      and investigation.organization_id = target_organization_id
      and public.is_org_member(target_organization_id)
      and (
        public.has_org_permission(target_organization_id, 'manage_incidents')
        or investigation.assigned_investigator_id = auth.uid()
        or investigation.investigation_lead_id = auth.uid()
      )
  );
$$;

create or replace function public.can_assign_investigation(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_permission(target_organization_id, 'manage_incidents');
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
    select 1 from public.investigations investigation
    where investigation.id = target_investigation_id
      and investigation.organization_id = target_organization_id
      and public.has_org_permission(target_organization_id, 'manage_incidents')
      and investigation.status = 'not_started'
  );
$$;

create or replace function public.can_create_corrective_action(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_permission(target_organization_id, 'create_corrective_action')
    or public.has_org_permission(target_organization_id, 'manage_corrective_actions');
$$;

create or replace function public.can_manage_corrective_action(
  target_organization_id uuid,
  target_action_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.corrective_actions action
    where action.id = target_action_id
      and action.organization_id = target_organization_id
      and public.is_org_member(target_organization_id)
      and (
        public.has_org_permission(target_organization_id, 'manage_corrective_actions')
        or action.assigned_owner_id = auth.uid()
        or action.created_by = auth.uid()
      )
  );
$$;

create or replace function public.can_verify_corrective_action(
  target_organization_id uuid,
  target_action_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.corrective_actions action
    where action.id = target_action_id
      and action.organization_id = target_organization_id
      and public.is_org_member(target_organization_id)
      and (
        public.has_org_permission(target_organization_id, 'manage_corrective_actions')
        or public.has_org_permission(target_organization_id, 'manage_qhse')
      )
      and action.assigned_owner_id is distinct from auth.uid()
  );
$$;

create or replace function public.can_view_corrective_action(
  target_organization_id uuid,
  target_action_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.corrective_actions action
    where action.id = target_action_id
      and action.organization_id = target_organization_id
      and public.is_org_member(target_organization_id)
      and (
        public.has_org_permission(target_organization_id, 'view_all_incidents')
        or public.has_org_permission(target_organization_id, 'view_all_assigned_actions')
        or action.assigned_owner_id = auth.uid()
        or action.created_by = auth.uid()
      )
  );
$$;

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
  previous_role text;
  role_is_valid boolean;
begin
  if actor_id is null then
    raise exception 'Authentication is required';
  end if;
  if not public.has_org_permission(p_organization_id, 'manage_user_roles') then
    raise exception 'You are not authorized to change user roles' using errcode = '42501';
  end if;
  if normalized_role is null or normalized_role = '' or normalized_role = 'Super Administrator' then
    raise exception 'Use a valid non-Super Administrator role';
  end if;

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
    ) into role_is_valid;
  else
    select exists (
      select 1 from public.custom_roles custom_role
      where custom_role.organization_id = p_organization_id
        and custom_role.name = normalized_role
        and custom_role.is_active
    ) into role_is_valid;
  end if;
  if not role_is_valid then
    raise exception 'The selected role is not active in this organization';
  end if;

  previous_role := target_membership.role;
  if previous_role = normalized_role then
    return jsonb_build_object('updated', false, 'role', normalized_role);
  end if;

  update public.memberships
  set role = normalized_role
  where id = target_membership.id;

  insert into public.role_audit_events (
    organization_id, actor_id, action, before_data, after_data, reason
  ) values (
    p_organization_id,
    actor_id,
    'updated',
    jsonb_build_object('user_id', p_target_user_id, 'role', previous_role),
    jsonb_build_object('user_id', p_target_user_id, 'role', normalized_role),
    'Organization member role changed'
  );
  return jsonb_build_object('updated', true, 'role', normalized_role);
end;
$$;

create or replace function public.enforce_builtin_role_name_uniqueness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.organizations
  where id = new.organization_id
  for update;
  if exists (
    select 1 from public.organization_builtin_role_settings role_setting
    where role_setting.organization_id = new.organization_id
      and lower(role_setting.display_name) = lower(btrim(new.name))
  ) then
    raise exception 'A built-in role already uses this name';
  end if;
  return new;
end;
$$;

drop trigger if exists custom_roles_builtin_name_unique on public.custom_roles;
create trigger custom_roles_builtin_name_unique
before insert or update of name, organization_id on public.custom_roles
for each row execute function public.enforce_builtin_role_name_uniqueness();

create or replace function public.sync_custom_role_rename()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'A custom role cannot be moved between organizations';
  end if;
  if new.name is distinct from old.name then
    update public.memberships
    set role = new.name
    where organization_id = old.organization_id
      and role = old.name;
  end if;
  return new;
end;
$$;

drop trigger if exists custom_roles_sync_membership_names on public.custom_roles;
create trigger custom_roles_sync_membership_names
after update of name, organization_id on public.custom_roles
for each row execute function public.sync_custom_role_rename();

drop trigger if exists memberships_enforce_builtin_role_assignment on public.memberships;
create trigger memberships_enforce_builtin_role_assignment
before insert or update of role on public.memberships
for each row execute function public.enforce_builtin_role_assignment();

revoke all on function public.default_builtin_role_permissions(text) from public, anon, authenticated;
revoke all on function public.seed_organization_builtin_roles() from public, anon, authenticated;
revoke all on function public.is_org_admin_for_role_management(uuid) from public, anon, authenticated;
revoke all on function public.has_org_permission(uuid, text) from public, anon;
revoke all on function public.list_organization_builtin_roles(uuid) from public, anon;
revoke all on function public.update_organization_builtin_role(uuid, text, text, boolean, jsonb) from public, anon;
revoke all on function public.enforce_builtin_role_assignment() from public, anon, authenticated;
revoke all on function public.enforce_builtin_role_name_uniqueness() from public, anon, authenticated;
revoke all on function public.sync_custom_role_rename() from public, anon, authenticated;
revoke all on function public.guard_membership_tenant_identity() from public, anon, authenticated;
revoke all on function public.enforce_profile_role_permissions() from public, anon, authenticated;

grant execute on function public.has_org_permission(uuid, text) to authenticated;
grant execute on function public.is_org_admin_for_role_management(uuid) to authenticated;
grant execute on function public.list_organization_builtin_roles(uuid) to authenticated;
grant execute on function public.update_organization_builtin_role(uuid, text, text, boolean, jsonb) to authenticated;
grant execute on function public.has_inspection_action_permission(uuid, text) to authenticated;
grant execute on function public.can_create_corrective_action(uuid) to authenticated;
grant execute on function public.has_knowledge_permission(uuid, text) to authenticated;
grant execute on function public.knowledge_role_has_permission(uuid, text, text) to authenticated;
grant execute on function public.can_use_ai_sessions(uuid) to authenticated;
grant execute on function public.can_close_incidents(uuid) to authenticated;
grant execute on function public.can_create_incident(uuid) to authenticated;
grant execute on function public.can_manage_incident(uuid, uuid) to authenticated;
grant execute on function public.can_view_incident(uuid, uuid) to authenticated;
grant execute on function public.can_view_investigation(uuid, uuid) to authenticated;
grant execute on function public.can_manage_investigation(uuid, uuid) to authenticated;
grant execute on function public.can_assign_investigation(uuid) to authenticated;
grant execute on function public.can_delete_investigation(uuid, uuid) to authenticated;
grant execute on function public.can_manage_corrective_action(uuid, uuid) to authenticated;
grant execute on function public.can_verify_corrective_action(uuid, uuid) to authenticated;
grant execute on function public.can_view_corrective_action(uuid, uuid) to authenticated;
revoke all on function public.update_user_role(uuid, uuid, text) from public, anon;
grant execute on function public.update_user_role(uuid, uuid, text) to authenticated;
