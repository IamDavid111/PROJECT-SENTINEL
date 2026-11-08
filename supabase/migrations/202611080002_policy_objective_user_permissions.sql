create table public.organization_policy_objective_permission_overrides (
  organization_id uuid not null,
  user_id uuid not null,
  permission_key text not null check (permission_key in (
    'view_policy_objectives_register',
    'manage_policy_objectives',
    'view_legal_compliance_register'
  )),
  is_granted boolean not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, permission_key),
  foreign key (user_id, organization_id)
    references public.memberships(user_id, organization_id) on delete cascade
);

alter table public.organization_policy_objective_permission_overrides enable row level security;
revoke all on public.organization_policy_objective_permission_overrides from public, anon, authenticated;
grant all on public.organization_policy_objective_permission_overrides to service_role;

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
        when p_permission in ('view_policy_objectives_register', 'manage_policy_objectives', 'view_legal_compliance_register')
          and exists (
            select 1
            from public.organization_policy_objective_permission_overrides permission_override
            where permission_override.organization_id = membership.organization_id
              and permission_override.user_id = membership.user_id
              and permission_override.permission_key = p_permission
          ) then (
            select permission_override.is_granted
            from public.organization_policy_objective_permission_overrides permission_override
            where permission_override.organization_id = membership.organization_id
              and permission_override.user_id = membership.user_id
              and permission_override.permission_key = p_permission
          )
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

create or replace function public.get_policy_objective_user_permission_overrides(
  p_organization_id uuid,
  p_target_user_id uuid
)
returns table(permission_key text, is_granted boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_org_admin_for_role_management(p_organization_id) then
    raise exception 'Only a Super Administrator can manage individual Policy and Objectives permissions'
      using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.memberships membership
    join public.profiles profile
      on profile.id = membership.user_id
     and profile.organization_id = membership.organization_id
    where membership.organization_id = p_organization_id
      and membership.user_id = p_target_user_id
      and profile.account_status = 'active'
  ) then
    raise exception 'The selected user is not an active member of this organization'
      using errcode = '22023';
  end if;

  return query
  select permission.permission_key, permission_override.is_granted
  from unnest(array[
    'view_policy_objectives_register',
    'manage_policy_objectives',
    'view_legal_compliance_register'
  ]::text[]) as permission(permission_key)
  left join public.organization_policy_objective_permission_overrides permission_override
    on permission_override.organization_id = p_organization_id
   and permission_override.user_id = p_target_user_id
   and permission_override.permission_key = permission.permission_key;
end;
$$;

create or replace function public.set_policy_objective_user_permission_override(
  p_organization_id uuid,
  p_target_user_id uuid,
  p_permission_key text,
  p_is_granted boolean default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_org_admin_for_role_management(p_organization_id) then
    raise exception 'Only a Super Administrator can manage individual Policy and Objectives permissions'
      using errcode = '42501';
  end if;
  if p_permission_key not in (
    'view_policy_objectives_register',
    'manage_policy_objectives',
    'view_legal_compliance_register'
  ) then
    raise exception 'Unsupported Policy and Objectives permission'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.memberships membership
    join public.profiles profile
      on profile.id = membership.user_id
     and profile.organization_id = membership.organization_id
    where membership.organization_id = p_organization_id
      and membership.user_id = p_target_user_id
      and profile.account_status = 'active'
      and membership.role <> 'Super Administrator'
  ) then
    raise exception 'The selected user is not an eligible active organization member'
      using errcode = '22023';
  end if;

  if p_is_granted is null then
    delete from public.organization_policy_objective_permission_overrides
    where organization_id = p_organization_id
      and user_id = p_target_user_id
      and permission_key = p_permission_key;
  else
    insert into public.organization_policy_objective_permission_overrides (
      organization_id, user_id, permission_key, is_granted, updated_by, updated_at
    ) values (
      p_organization_id, p_target_user_id, p_permission_key, p_is_granted, auth.uid(), now()
    )
    on conflict (organization_id, user_id, permission_key) do update
    set is_granted = excluded.is_granted,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
  end if;

  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  values (
    p_organization_id,
    auth.uid(),
    'Policy and Objectives user permission changed',
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'permission_key', p_permission_key,
      'is_granted', p_is_granted
    )
  );
end;
$$;

revoke all on function public.get_policy_objective_user_permission_overrides(uuid, uuid) from public, anon;
revoke all on function public.set_policy_objective_user_permission_override(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.get_policy_objective_user_permission_overrides(uuid, uuid) to authenticated;
grant execute on function public.set_policy_objective_user_permission_override(uuid, uuid, text, boolean) to authenticated;