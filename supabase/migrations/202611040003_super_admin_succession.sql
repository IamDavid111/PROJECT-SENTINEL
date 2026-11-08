alter table public.organizations
  add column if not exists original_super_admin_id uuid references auth.users(id) on delete restrict,
  add column if not exists super_admin_authority_relinquished_at timestamptz,
  add column if not exists super_admin_authority_relinquished_by uuid references auth.users(id) on delete set null;

alter table public.memberships
  add column if not exists super_admin_previous_role text;

update public.organizations organization
set original_super_admin_id = (
  select membership.user_id
  from public.memberships membership
  join public.profiles profile
    on profile.id = membership.user_id
   and profile.organization_id = membership.organization_id
  where membership.organization_id = organization.id
    and membership.role = 'Super Administrator'
  order by (profile.account_status = 'active') desc, membership.created_at, membership.user_id
  limit 1
)
where organization.original_super_admin_id is null;

do $$
begin
  if exists (
    select 1 from public.organizations where original_super_admin_id is null
  ) then
    raise exception 'Every organization must have an existing Super Administrator before this migration can be applied';
  end if;
end;
$$;

alter table public.organizations
  alter column original_super_admin_id set not null;

create or replace function public.guard_super_admin_succession_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.original_super_admin_id is distinct from auth.uid()
      and current_setting('app.super_admin_initialization', true) is distinct from 'on' then
      raise exception 'The original Super Administrator is assigned during organization creation';
    end if;
    return new;
  end if;

  if (new.original_super_admin_id, new.super_admin_authority_relinquished_at, new.super_admin_authority_relinquished_by)
      is distinct from
     (old.original_super_admin_id, old.super_admin_authority_relinquished_at, old.super_admin_authority_relinquished_by)
    and current_setting('app.super_admin_succession_write', true) is distinct from 'on' then
    raise exception 'Super Administrator succession fields can only be changed through the succession operations';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_guard_super_admin_succession on public.organizations;
create trigger organizations_guard_super_admin_succession
before insert or update on public.organizations
for each row execute function public.guard_super_admin_succession_fields();

create or replace function public.guard_super_admin_membership_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_organization_id uuid;
  target_user_id uuid;
  target_role text;
  original_user_id uuid;
  relinquished_at timestamptz;
  actor_id uuid := auth.uid();
  active_count integer;
begin
  if tg_op = 'UPDATE' and old.role is not distinct from new.role then
    return new;
  end if;
  if tg_op = 'DELETE' and old.role <> 'Super Administrator' then
    return old;
  end if;
  if tg_op = 'INSERT' and new.role <> 'Super Administrator' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.role <> 'Super Administrator' and new.role <> 'Super Administrator' then
    return new;
  end if;

  if tg_op = 'DELETE' then
    target_organization_id := old.organization_id;
    target_user_id := old.user_id;
    target_role := null;
  else
    target_organization_id := new.organization_id;
    target_user_id := new.user_id;
    target_role := new.role;
  end if;

  select organization.original_super_admin_id, organization.super_admin_authority_relinquished_at
    into original_user_id, relinquished_at
    from public.organizations organization
   where organization.id = target_organization_id
   for update;
  if not found then
    raise exception 'Organization not found';
  end if;

  if target_role = 'Super Administrator' then
    if target_user_id = original_user_id
      and tg_op = 'INSERT'
      and actor_id = original_user_id
      and current_setting('app.super_admin_initialization', true) = 'on' then
      return new;
    end if;

    if current_setting('app.super_admin_appointment_target', true) = target_user_id::text
      and actor_id = original_user_id
      and target_user_id <> original_user_id then
      select count(*) into active_count
      from public.memberships membership
      join public.profiles profile
        on profile.id = membership.user_id
       and profile.organization_id = membership.organization_id
      where membership.organization_id = target_organization_id
        and membership.role = 'Super Administrator'
        and profile.account_status = 'active'
        and membership.user_id <> target_user_id;
      if active_count >= 3 then
        raise exception 'An organization can have no more than three active Super Administrators';
      end if;
      return new;
    end if;

    raise exception 'Only the Original Super Administrator can appoint additional Super Administrators';
  end if;

  if current_setting('app.super_admin_removal_target', true) is distinct from target_user_id::text
    or not exists (
      select 1
      from public.memberships actor_membership
      join public.profiles actor_profile
        on actor_profile.id = actor_membership.user_id
       and actor_profile.organization_id = actor_membership.organization_id
      where actor_membership.user_id = actor_id
        and actor_membership.organization_id = target_organization_id
        and actor_membership.role = 'Super Administrator'
        and actor_profile.account_status = 'active'
    )
    or (relinquished_at is null and actor_id <> original_user_id) then
    raise exception 'You are not authorized to remove this Super Administrator';
  end if;

  select count(*) into active_count
  from public.memberships membership
  join public.profiles profile
    on profile.id = membership.user_id
   and profile.organization_id = membership.organization_id
  where membership.organization_id = target_organization_id
    and membership.role = 'Super Administrator'
    and profile.account_status = 'active'
    and membership.user_id <> target_user_id;
  if active_count < 1 then
    raise exception 'An organization must retain at least one active Super Administrator';
  end if;

  if target_user_id = original_user_id and relinquished_at is null then
    raise exception 'The Original Super Administrator is protected from removal';
  end if;
  if target_user_id = actor_id then
    raise exception 'You cannot remove your own Super Administrator role';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_guard_super_admin_succession on public.memberships;
create trigger memberships_guard_super_admin_succession
before insert or update of role or delete on public.memberships
for each row execute function public.guard_super_admin_membership_change();

create or replace function public.guard_super_admin_account_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.account_status is distinct from new.account_status
    and exists (
      select 1
      from public.memberships membership
      where membership.user_id = old.id
        and membership.organization_id = old.organization_id
        and membership.role = 'Super Administrator'
    ) then
    raise exception 'Remove the Super Administrator role before changing this account status';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_super_admin_account_status on public.profiles;
create trigger profiles_guard_super_admin_account_status
before update of account_status on public.profiles
for each row execute function public.guard_super_admin_account_status();

create or replace function public.get_super_admin_succession(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  original_user_id uuid;
  relinquished_at timestamptz;
  active_count integer;
  caller_role text;
begin
  if auth.uid() is null or not public.is_org_member(p_organization_id) then
    raise exception 'Organization membership is required';
  end if;

  select organization.original_super_admin_id, organization.super_admin_authority_relinquished_at
    into original_user_id, relinquished_at
    from public.organizations organization
   where organization.id = p_organization_id;
  if not found then
    raise exception 'Organization not found';
  end if;

  select count(*) into active_count
  from public.memberships membership
  join public.profiles profile
    on profile.id = membership.user_id
   and profile.organization_id = membership.organization_id
  where membership.organization_id = p_organization_id
    and membership.role = 'Super Administrator'
    and profile.account_status = 'active';

  select membership.role into caller_role
  from public.memberships membership
  join public.profiles profile
    on profile.id = membership.user_id
   and profile.organization_id = membership.organization_id
  where membership.organization_id = p_organization_id
    and membership.user_id = auth.uid()
    and profile.account_status = 'active';

  return jsonb_build_object(
    'original_super_admin_id', original_user_id,
    'active_super_admin_count', active_count,
    'maximum_super_admin_count', 3,
    'authority_relinquished_at', relinquished_at,
    'is_original_super_admin', auth.uid() = original_user_id,
    'can_appoint', auth.uid() = original_user_id and caller_role = 'Super Administrator' and active_count < 3,
    'can_relinquish', auth.uid() = original_user_id and caller_role = 'Super Administrator' and relinquished_at is null,
    'can_remove', caller_role = 'Super Administrator' and (relinquished_at is not null or auth.uid() = original_user_id)
  );
end;
$$;

create or replace function public.appoint_super_administrator(
  p_organization_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  organization public.organizations;
  target_membership public.memberships;
  target_status public.account_status;
  active_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select * into organization
  from public.organizations
  where id = p_organization_id
  for update;
  if not found then
    raise exception 'Organization not found';
  end if;
  if organization.original_super_admin_id <> auth.uid() then
    raise exception 'Only the Original Super Administrator can appoint additional Super Administrators';
  end if;
  if not exists (
    select 1
    from public.memberships actor_membership
    join public.profiles actor_profile
      on actor_profile.id = actor_membership.user_id
     and actor_profile.organization_id = actor_membership.organization_id
    where actor_membership.organization_id = p_organization_id
      and actor_membership.user_id = auth.uid()
      and actor_membership.role = 'Super Administrator'
      and actor_profile.account_status = 'active'
  ) then
    raise exception 'The Original Super Administrator must be active';
  end if;

  select * into target_membership
  from public.memberships
  where organization_id = p_organization_id
    and user_id = p_target_user_id
  for update;
  if not found then
    raise exception 'The selected user is not an organization member';
  end if;
  select account_status into target_status
  from public.profiles
  where organization_id = p_organization_id
    and id = p_target_user_id
  for update;
  if not found then
    raise exception 'The selected user profile was not found';
  end if;
  if target_status <> 'active' then
    raise exception 'Only active organization members can be appointed';
  end if;
  if p_target_user_id = organization.original_super_admin_id then
    raise exception 'The Original Super Administrator cannot be appointed again';
  end if;
  if target_membership.role = 'Super Administrator' then
    raise exception 'This user is already a Super Administrator';
  end if;

  select count(*) into active_count
  from public.memberships membership
  join public.profiles profile
    on profile.id = membership.user_id
   and profile.organization_id = membership.organization_id
  where membership.organization_id = p_organization_id
    and membership.role = 'Super Administrator'
    and profile.account_status = 'active';
  if active_count >= 3 then
    raise exception 'The maximum of three active Super Administrators has been reached';
  end if;

  perform set_config('app.super_admin_appointment_target', p_target_user_id::text, true);
  update public.memberships
     set role = 'Super Administrator',
         super_admin_previous_role = target_membership.role
   where id = target_membership.id;
  perform set_config('app.super_admin_appointment_target', '', true);

  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  values (
    p_organization_id,
    auth.uid(),
    'Additional Super Administrator appointed',
    jsonb_build_object('target_user_id', p_target_user_id, 'previous_role', target_membership.role)
  );

  return jsonb_build_object('appointed', true, 'user_id', p_target_user_id);
end;
$$;

create or replace function public.remove_super_administrator(
  p_organization_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  organization public.organizations;
  target_membership public.memberships;
  target_status public.account_status;
  restored_role text;
  active_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select * into organization
  from public.organizations
  where id = p_organization_id
  for update;
  if not found then
    raise exception 'Organization not found';
  end if;
  if not exists (
    select 1
    from public.memberships actor_membership
    join public.profiles actor_profile
      on actor_profile.id = actor_membership.user_id
     and actor_profile.organization_id = actor_membership.organization_id
    where actor_membership.organization_id = p_organization_id
      and actor_membership.user_id = auth.uid()
      and actor_membership.role = 'Super Administrator'
      and actor_profile.account_status = 'active'
  ) then
    raise exception 'Only an active Super Administrator can remove a Super Administrator';
  end if;
  if organization.super_admin_authority_relinquished_at is null
    and organization.original_super_admin_id <> auth.uid() then
    raise exception 'Only the Original Super Administrator can remove Super Administrators until exclusive authority is relinquished';
  end if;
  if p_target_user_id = auth.uid() then
    raise exception 'You cannot remove your own Super Administrator role';
  end if;

  select * into target_membership
  from public.memberships
  where organization_id = p_organization_id
    and user_id = p_target_user_id
  for update;
  if not found or target_membership.role <> 'Super Administrator' then
    raise exception 'The selected user is not an active Super Administrator';
  end if;
  select account_status into target_status
  from public.profiles
  where organization_id = p_organization_id
    and id = p_target_user_id
  for update;
  if not found then
    raise exception 'The selected user profile was not found';
  end if;
  if p_target_user_id = organization.original_super_admin_id
    and organization.super_admin_authority_relinquished_at is null then
    raise exception 'The Original Super Administrator is protected from removal';
  end if;

  select count(*) into active_count
  from public.memberships membership
  join public.profiles profile
    on profile.id = membership.user_id
   and profile.organization_id = membership.organization_id
  where membership.organization_id = p_organization_id
    and membership.role = 'Super Administrator'
    and profile.account_status = 'active';
  if active_count < 1 or (target_status = 'active' and active_count <= 1) then
    raise exception 'An organization must retain at least one active Super Administrator';
  end if;

  restored_role := target_membership.super_admin_previous_role;
  if restored_role is null or restored_role = 'Super Administrator'
    or (not public.is_builtin_role_name(restored_role) and not exists (
      select 1 from public.custom_roles role_record
      where role_record.organization_id = p_organization_id
        and role_record.name = restored_role
        and role_record.is_active = true
    )) then
    restored_role := 'Field Worker';
  end if;

  perform set_config('app.super_admin_removal_target', p_target_user_id::text, true);
  update public.memberships
     set role = restored_role,
         super_admin_previous_role = null
   where id = target_membership.id;
  perform set_config('app.super_admin_removal_target', '', true);

  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  values (
    p_organization_id,
    auth.uid(),
    'Super Administrator removed',
    jsonb_build_object('target_user_id', p_target_user_id, 'restored_role', restored_role)
  );

  return jsonb_build_object('removed', true, 'user_id', p_target_user_id, 'restored_role', restored_role);
end;
$$;

create or replace function public.relinquish_super_admin_removal_authority(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  organization public.organizations;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select * into organization
  from public.organizations
  where id = p_organization_id
  for update;
  if not found then
    raise exception 'Organization not found';
  end if;
  if organization.original_super_admin_id <> auth.uid() then
    raise exception 'Only the Original Super Administrator can relinquish exclusive removal authority';
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
    raise exception 'The Original Super Administrator must be active';
  end if;
  if organization.super_admin_authority_relinquished_at is not null then
    raise exception 'Exclusive removal authority has already been relinquished';
  end if;

  perform set_config('app.super_admin_succession_write', 'on', true);
  update public.organizations
     set super_admin_authority_relinquished_at = now(),
         super_admin_authority_relinquished_by = auth.uid()
   where id = p_organization_id;
  perform set_config('app.super_admin_succession_write', '', true);

  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  values (
    p_organization_id,
    auth.uid(),
    'Super Administrator exclusive removal authority relinquished',
    jsonb_build_object(
      'original_super_admin_id', organization.original_super_admin_id,
      'action', 'RELINQUISH_EXCLUSIVE_REMOVAL_AUTHORITY'
    )
  );

  return jsonb_build_object('relinquished', true);
end;
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
  normalized_role text := trim(p_role);
  target_membership public.memberships;
  previous_role text;
  custom_role_exists boolean;
begin
  if actor_id is null then
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
  if normalized_role = 'Super Administrator' then
    raise exception 'Use the Super Administrator appointment action to assign this role';
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
    raise exception 'Use the Super Administrator removal action to change this role';
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

create or replace function public.create_organization_with_owner(
  organization_data jsonb,
  owner_full_name text
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  created_organization public.organizations;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if exists (select 1 from public.profiles where id = current_user_id) then
    raise exception 'User already belongs to an organization';
  end if;

  insert into public.organizations (
    company_code, company_name, logo_url, industry, company_registration_number,
    company_type, company_size, region, country, state, address, contact_email,
    contact_phone, original_super_admin_id
  )
  values (
    upper(trim(organization_data->>'company_code')),
    trim(organization_data->>'company_name'),
    nullif(trim(organization_data->>'logo_url'), ''),
    trim(organization_data->>'industry'),
    nullif(trim(organization_data->>'company_registration_number'), ''),
    nullif(trim(organization_data->>'company_type'), ''),
    trim(organization_data->>'company_size'),
    trim(organization_data->>'region'),
    trim(organization_data->>'country'),
    trim(organization_data->>'state'),
    nullif(trim(organization_data->>'address'), ''),
    trim(organization_data->>'contact_email'),
    trim(organization_data->>'contact_phone'),
    current_user_id
  )
  returning * into created_organization;

  insert into public.profiles (id, organization_id, full_name, account_status)
  values (current_user_id, created_organization.id, trim(owner_full_name), 'active');

  perform set_config('app.super_admin_initialization', 'on', true);
  insert into public.memberships (user_id, organization_id, role)
  values (current_user_id, created_organization.id, 'Super Administrator');
  perform set_config('app.super_admin_initialization', '', true);

  insert into public.notification_preferences (user_id) values (current_user_id);
  insert into public.company_settings (organization_id) values (created_organization.id);
  return created_organization;
end;
$$;

revoke all on function public.guard_super_admin_succession_fields() from public, anon, authenticated;
revoke all on function public.guard_super_admin_membership_change() from public, anon, authenticated;
revoke all on function public.guard_super_admin_account_status() from public, anon, authenticated;
revoke all on function public.get_super_admin_succession(uuid) from public, anon;
revoke all on function public.appoint_super_administrator(uuid, uuid) from public, anon;
revoke all on function public.remove_super_administrator(uuid, uuid) from public, anon;
revoke all on function public.relinquish_super_admin_removal_authority(uuid) from public, anon;
revoke all on function public.update_user_role(uuid, uuid, text) from public, anon;
revoke all on function public.create_organization_with_owner(jsonb, text) from public, anon;

grant execute on function public.get_super_admin_succession(uuid) to authenticated;
grant execute on function public.appoint_super_administrator(uuid, uuid) to authenticated;
grant execute on function public.remove_super_administrator(uuid, uuid) to authenticated;
grant execute on function public.relinquish_super_admin_removal_authority(uuid) to authenticated;
grant execute on function public.update_user_role(uuid, uuid, text) to authenticated;
grant execute on function public.create_organization_with_owner(jsonb, text) to authenticated;
