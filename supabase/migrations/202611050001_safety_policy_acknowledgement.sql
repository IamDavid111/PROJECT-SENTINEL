create table public.safety_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  current_version_id uuid,
  is_active boolean not null default false,
  is_deleted boolean not null default false,
  frequency text not null default 'every_login'
    check (frequency in ('every_login', 'first_login', 'interval_days', 'weekly')),
  interval_days integer,
  timezone text not null default 'UTC',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (
    (frequency = 'interval_days' and interval_days is not null and interval_days between 1 and 365)
    or (frequency <> 'interval_days' and interval_days is null)
  )
);

create table public.safety_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.safety_policies(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  title text not null check (length(btrim(title)) between 1 and 200),
  policy_text text not null check (length(btrim(policy_text)) between 1 and 50000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (policy_id, version_number),
  unique (organization_id, policy_id, id),
  foreign key (organization_id, policy_id)
    references public.safety_policies(organization_id, id) on delete restrict
);

alter table public.safety_policies
  add constraint safety_policies_current_version_fk
  foreign key (organization_id, id, current_version_id)
  references public.safety_policy_versions(organization_id, policy_id, id)
  on delete restrict;

create table public.safety_policy_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  policy_id uuid not null,
  policy_version_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  user_identity text not null,
  session_id uuid not null,
  acknowledged_at timestamptz not null default now(),
  foreign key (organization_id, policy_id)
    references public.safety_policies(organization_id, id) on delete restrict,
  foreign key (organization_id, policy_id, policy_version_id)
    references public.safety_policy_versions(organization_id, policy_id, id) on delete restrict
);

create index safety_policy_acknowledgements_user_version_idx
  on public.safety_policy_acknowledgements(user_id, policy_version_id, acknowledged_at desc);
create index safety_policy_acknowledgements_org_idx
  on public.safety_policy_acknowledgements(organization_id, acknowledged_at desc);

alter table public.safety_policies enable row level security;
alter table public.safety_policy_versions enable row level security;
alter table public.safety_policy_acknowledgements enable row level security;

revoke all on public.safety_policies from public, anon, authenticated;
revoke all on public.safety_policy_versions from public, anon, authenticated;
revoke all on public.safety_policy_acknowledgements from public, anon, authenticated;

create or replace function public.safety_policy_acknowledgement_required(
  target_organization_id uuid,
  target_user_id uuid,
  target_session_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  policy_row public.safety_policies;
  last_acknowledged_at timestamptz;
  current_week_start timestamptz;
begin
  if auth.uid() is null or target_user_id is distinct from auth.uid() then
    return false;
  end if;

  if not exists (
    select 1
    from public.memberships membership
    join public.profiles profile
      on profile.id = membership.user_id
     and profile.organization_id = membership.organization_id
    where membership.user_id = target_user_id
      and membership.organization_id = target_organization_id
      and profile.account_status = 'active'
  ) then
    return false;
  end if;

  select * into policy_row
  from public.safety_policies
  where organization_id = target_organization_id
    and is_active
    and not is_deleted;

  if not found or policy_row.current_version_id is null then
    return false;
  end if;

  if policy_row.frequency = 'every_login' then
    return target_session_id is null or not exists (
      select 1 from public.safety_policy_acknowledgements acknowledgement
      where acknowledgement.organization_id = target_organization_id
        and acknowledgement.policy_id = policy_row.id
        and acknowledgement.policy_version_id = policy_row.current_version_id
        and acknowledgement.user_id = target_user_id
        and acknowledgement.session_id = target_session_id
    );
  end if;

  select max(acknowledged_at) into last_acknowledged_at
  from public.safety_policy_acknowledgements acknowledgement
  where acknowledgement.organization_id = target_organization_id
    and acknowledgement.policy_id = policy_row.id
    and acknowledgement.policy_version_id = policy_row.current_version_id
    and acknowledgement.user_id = target_user_id;

  if policy_row.frequency = 'first_login' then
    return last_acknowledged_at is null;
  elsif policy_row.frequency = 'interval_days' then
    return last_acknowledged_at is null
      or last_acknowledged_at <= statement_timestamp() - make_interval(days => policy_row.interval_days);
  elsif policy_row.frequency = 'weekly' then
    current_week_start :=
      date_trunc('week', statement_timestamp() at time zone policy_row.timezone)
      at time zone policy_row.timezone;
    return last_acknowledged_at is null or last_acknowledged_at < current_week_start;
  end if;

  return true;
end;
$$;

create or replace function public.safety_policy_access_allowed(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
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
    )
    and not public.safety_policy_acknowledgement_required(
      target_organization_id,
      auth.uid(),
      nullif(auth.jwt() ->> 'session_id', '')::uuid
    );
$$;

create or replace function public.get_safety_policy_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  user_organization_id uuid;
  current_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  policy_row public.safety_policies;
  version_row public.safety_policy_versions;
  is_required boolean := false;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select profile.organization_id into user_organization_id
  from public.profiles profile
  join public.memberships membership
    on membership.user_id = profile.id
   and membership.organization_id = profile.organization_id
  where profile.id = current_user_id
    and profile.account_status = 'active';

  if user_organization_id is null then
    raise exception 'An active organization membership is required' using errcode = '42501';
  end if;

  select * into policy_row
  from public.safety_policies
  where organization_id = user_organization_id;

  if not found or not policy_row.is_active or policy_row.is_deleted or policy_row.current_version_id is null then
    return jsonb_build_object('active', false, 'required', false, 'policy', null);
  end if;

  if policy_row.frequency = 'every_login' and current_session_id is null then
    raise exception 'The authenticated session could not be verified' using errcode = '28000';
  end if;

  select * into version_row
  from public.safety_policy_versions
  where id = policy_row.current_version_id
    and organization_id = user_organization_id
    and policy_id = policy_row.id;

  is_required := public.safety_policy_acknowledgement_required(
    user_organization_id,
    current_user_id,
    current_session_id
  );

  return jsonb_build_object(
    'active', true,
    'required', is_required,
    'policy', jsonb_build_object(
      'id', policy_row.id,
      'versionId', version_row.id,
      'versionNumber', version_row.version_number,
      'title', version_row.title,
      'text', version_row.policy_text,
      'effectiveAt', version_row.created_at,
      'frequency', policy_row.frequency,
      'intervalDays', policy_row.interval_days,
      'timezone', policy_row.timezone
    )
  );
end;
$$;

create or replace function public.acknowledge_safety_policy()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  user_organization_id uuid;
  policy_row public.safety_policies;
  current_email text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select profile.organization_id into user_organization_id
  from public.profiles profile
  join public.memberships membership
    on membership.user_id = profile.id
   and membership.organization_id = profile.organization_id
  where profile.id = current_user_id
    and profile.account_status = 'active';

  if user_organization_id is null then
    raise exception 'An active organization membership is required' using errcode = '42501';
  end if;

  select * into policy_row
  from public.safety_policies
  where organization_id = user_organization_id
  for update;

  if not found or not policy_row.is_active or policy_row.is_deleted or policy_row.current_version_id is null then
    raise exception 'There is no active safety policy to acknowledge' using errcode = '22023';
  end if;
  if policy_row.frequency = 'every_login' and current_session_id is null then
    raise exception 'The authenticated session could not be verified' using errcode = '28000';
  end if;

  if not public.safety_policy_acknowledgement_required(
    user_organization_id,
    current_user_id,
    current_session_id
  ) then
    return jsonb_build_object('acknowledged', true, 'alreadyRecorded', true);
  end if;

  select email into current_email from auth.users where id = current_user_id;
  if current_email is null then
    raise exception 'The authenticated identity could not be verified' using errcode = '28000';
  end if;

  insert into public.safety_policy_acknowledgements (
    organization_id, policy_id, policy_version_id, user_id, user_identity, session_id
  )
  values (
    user_organization_id, policy_row.id, policy_row.current_version_id,
    current_user_id, current_email, coalesce(current_session_id, gen_random_uuid())
  );

  return jsonb_build_object(
    'acknowledged', true,
    'alreadyRecorded', false,
    'policyVersionId', policy_row.current_version_id
  );
end;
$$;

create or replace function public.get_safety_policy_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  user_organization_id uuid;
  policy_row public.safety_policies;
  version_row public.safety_policy_versions;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select profile.organization_id into user_organization_id
  from public.profiles profile
  join public.memberships membership
    on membership.user_id = profile.id
   and membership.organization_id = profile.organization_id
  where profile.id = current_user_id
    and membership.role = 'Super Administrator'
    and profile.account_status = 'active';
  if user_organization_id is null then
    raise exception 'Only an active Super Administrator can manage the safety policy' using errcode = '42501';
  end if;

  select * into policy_row from public.safety_policies
  where organization_id = user_organization_id;
  if not found then
    return jsonb_build_object('configured', false);
  end if;

  select * into version_row from public.safety_policy_versions
  where id = policy_row.current_version_id
    and organization_id = user_organization_id
    and policy_id = policy_row.id;

  return jsonb_build_object(
    'configured', version_row.id is not null,
    'active', policy_row.is_active and not policy_row.is_deleted,
    'deleted', policy_row.is_deleted,
    'policyId', policy_row.id,
    'versionId', version_row.id,
    'versionNumber', version_row.version_number,
    'title', version_row.title,
    'text', version_row.policy_text,
    'frequency', policy_row.frequency,
    'intervalDays', policy_row.interval_days,
    'timezone', policy_row.timezone,
    'updatedAt', policy_row.updated_at
  );
end;
$$;

create or replace function public.save_safety_policy(
  policy_title text,
  policy_text text,
  acknowledgement_frequency text,
  acknowledgement_interval_days integer,
  acknowledgement_timezone text,
  activate_policy boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  user_organization_id uuid;
  policy_row public.safety_policies;
  version_row public.safety_policy_versions;
  normalized_title text := nullif(btrim(policy_title), '');
  normalized_text text := nullif(btrim(policy_text), '');
  next_version integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select profile.organization_id into user_organization_id
  from public.profiles profile
  join public.memberships membership
    on membership.user_id = profile.id
   and membership.organization_id = profile.organization_id
  where profile.id = current_user_id
    and membership.role = 'Super Administrator'
    and profile.account_status = 'active';
  if user_organization_id is null then
    raise exception 'Only an active Super Administrator can manage the safety policy' using errcode = '42501';
  end if;
  if normalized_title is null or length(normalized_title) > 200
    or normalized_text is null or length(normalized_text) > 50000 then
    raise exception 'A title (1–200 characters) and policy text (1–50000 characters) are required' using errcode = '22023';
  end if;
  if acknowledgement_frequency is null
    or acknowledgement_frequency not in ('every_login', 'first_login', 'interval_days', 'weekly') then
    raise exception 'Invalid acknowledgement frequency' using errcode = '22023';
  end if;
  if (acknowledgement_frequency = 'interval_days'
      and (acknowledgement_interval_days is null or acknowledgement_interval_days not between 1 and 365))
    or (acknowledgement_frequency <> 'interval_days' and acknowledgement_interval_days is not null) then
    raise exception 'The interval must be between 1 and 365 days and is only valid for interval mode' using errcode = '22023';
  end if;
  if activate_policy is null then
    raise exception 'Choose whether the safety policy should be active' using errcode = '22023';
  end if;
  if acknowledgement_timezone is null or not exists (
    select 1 from pg_timezone_names where name = acknowledgement_timezone
  ) then
    raise exception 'Select a valid IANA timezone' using errcode = '22023';
  end if;

  insert into public.safety_policies (
    organization_id, is_active, is_deleted, frequency, interval_days, timezone, updated_by
  )
  values (
    user_organization_id, false, false, 'every_login', null, 'UTC', current_user_id
  )
  on conflict (organization_id) do nothing;

  select * into policy_row from public.safety_policies
  where organization_id = user_organization_id
  for update;

  if policy_row.current_version_id is null then
    next_version := 1;
  else
    select * into version_row from public.safety_policy_versions
    where id = policy_row.current_version_id
      and organization_id = user_organization_id
      and policy_id = policy_row.id;
    if version_row.title is distinct from normalized_title
      or version_row.policy_text is distinct from normalized_text then
      select coalesce(max(version_number), 0) + 1 into next_version
      from public.safety_policy_versions where policy_id = policy_row.id;
    end if;
  end if;

  if next_version is not null then
    insert into public.safety_policy_versions (
      policy_id, organization_id, version_number, title, policy_text, created_by
    )
    values (
      policy_row.id, user_organization_id, next_version,
      normalized_title, normalized_text, current_user_id
    )
    returning * into version_row;
  end if;

  update public.safety_policies
  set current_version_id = version_row.id,
      is_active = activate_policy,
      is_deleted = false,
      frequency = acknowledgement_frequency,
      interval_days = acknowledgement_interval_days,
      timezone = acknowledgement_timezone,
      updated_by = current_user_id,
      updated_at = now()
  where id = policy_row.id
  returning * into policy_row;

  return jsonb_build_object(
    'configured', true,
    'active', policy_row.is_active,
    'deleted', policy_row.is_deleted,
    'policyId', policy_row.id,
    'versionId', version_row.id,
    'versionNumber', version_row.version_number,
    'title', version_row.title,
    'text', version_row.policy_text,
    'frequency', policy_row.frequency,
    'intervalDays', policy_row.interval_days,
    'timezone', policy_row.timezone,
    'updatedAt', policy_row.updated_at
  );
end;
$$;

create or replace function public.set_safety_policy_active(activate_policy boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  user_organization_id uuid;
  policy_row public.safety_policies;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  select profile.organization_id into user_organization_id
  from public.profiles profile
  join public.memberships membership
    on membership.user_id = profile.id
   and membership.organization_id = profile.organization_id
  where profile.id = current_user_id
    and membership.role = 'Super Administrator'
    and profile.account_status = 'active';
  if user_organization_id is null then
    raise exception 'Only an active Super Administrator can manage the safety policy' using errcode = '42501';
  end if;

  update public.safety_policies
  set is_active = activate_policy,
      updated_by = current_user_id,
      updated_at = now()
  where organization_id = user_organization_id
    and current_version_id is not null
    and (not activate_policy or not is_deleted)
  returning * into policy_row;
  if not found then
    raise exception 'A saved policy is required before it can be activated or deactivated' using errcode = '22023';
  end if;
  return jsonb_build_object('active', policy_row.is_active, 'deleted', policy_row.is_deleted);
end;
$$;

create or replace function public.delete_safety_policy()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  user_organization_id uuid;
  policy_row public.safety_policies;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  select profile.organization_id into user_organization_id
  from public.profiles profile
  join public.memberships membership
    on membership.user_id = profile.id
   and membership.organization_id = profile.organization_id
  where profile.id = current_user_id
    and membership.role = 'Super Administrator'
    and profile.account_status = 'active';
  if user_organization_id is null then
    raise exception 'Only an active Super Administrator can manage the safety policy' using errcode = '42501';
  end if;

  update public.safety_policies
  set is_active = false,
      is_deleted = true,
      updated_by = current_user_id,
      updated_at = now()
  where organization_id = user_organization_id
    and current_version_id is not null
  returning * into policy_row;
  if not found then
    raise exception 'No saved safety policy exists to delete' using errcode = '22023';
  end if;
  return jsonb_build_object('deleted', true, 'active', false);
end;
$$;

revoke all on function public.safety_policy_acknowledgement_required(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.safety_policy_access_allowed(uuid) from public, anon;
revoke all on function public.get_safety_policy_status() from public, anon;
revoke all on function public.acknowledge_safety_policy() from public, anon;
revoke all on function public.get_safety_policy_settings() from public, anon;
revoke all on function public.save_safety_policy(text, text, text, integer, text, boolean) from public, anon;
revoke all on function public.set_safety_policy_active(boolean) from public, anon;
revoke all on function public.delete_safety_policy() from public, anon;

grant execute on function public.safety_policy_access_allowed(uuid) to authenticated;
grant execute on function public.get_safety_policy_status() to authenticated;
grant execute on function public.acknowledge_safety_policy() to authenticated;
grant execute on function public.get_safety_policy_settings() to authenticated;
grant execute on function public.save_safety_policy(text, text, text, integer, text, boolean) to authenticated;
grant execute on function public.set_safety_policy_active(boolean) to authenticated;
grant execute on function public.delete_safety_policy() to authenticated;

do $$
declare
  tenant_table record;
begin
  for tenant_table in
    select table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'organization_id'
      and table_name in (
        select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
      )
      and table_name not in (
        'organizations',
        'profiles',
        'memberships',
        'custom_roles',
        'organization_builtin_role_settings',
        'role_audit_events',
        'safety_policies',
        'safety_policy_versions',
        'safety_policy_acknowledgements'
      )
  loop
    execute format('alter table public.%I enable row level security', tenant_table.table_name);
    execute format('drop policy if exists safety_policy_acknowledgement_required on public.%I', tenant_table.table_name);
    execute format(
      'create policy safety_policy_acknowledgement_required on public.%I as restrictive for all to authenticated using (organization_id is null or public.safety_policy_access_allowed(organization_id)) with check (organization_id is null or public.safety_policy_access_allowed(organization_id))',
      tenant_table.table_name
    );
  end loop;
end;
$$;

create or replace function public.get_inspection_action_metrics(
  p_since timestamptz default null,
  p_site_id uuid default null
)
returns table (inspections_completed bigint, open_corrective_actions bigint, overdue_actions bigint)
language sql
stable
security definer
set search_path = public
as $$
  with current_organization as (
    select profile.organization_id
    from public.profiles profile
    join public.memberships membership
      on membership.user_id = profile.id
     and membership.organization_id = profile.organization_id
    where profile.id = (select auth.uid())
      and profile.account_status = 'active'
      and public.safety_policy_access_allowed(profile.organization_id)
  )
  select
    (select count(*) from public.inspections inspection, current_organization organization
      where inspection.organization_id = organization.organization_id
        and (p_since is null or inspection.inspection_date >= p_since)
        and (p_site_id is null or inspection.site_id = p_site_id)),
    (select count(*) from public.actions action, current_organization organization
      where action.organization_id = organization.organization_id and action.status = 'open'
        and action.type = 'corrective' and action.due_at >= now()
        and (p_site_id is null or action.site_id = p_site_id)),
    (select count(*) from public.actions action, current_organization organization
      where action.organization_id = organization.organization_id and action.status = 'open'
        and action.due_at < now() and (p_site_id is null or action.site_id = p_site_id));
$$;

-- Definer RPCs must re-check the policy gate themselves because they bypass table RLS.
do $$
declare
  function_signature text;
  function_definition text;
  patched_definition text;
begin
  foreach function_signature in array array[
    'public.can_view_incident(uuid,uuid)',
    'public.can_manage_incident(uuid,uuid)',
    'public.can_close_incidents(uuid)',
    'public.can_view_investigation(uuid,uuid)',
    'public.can_manage_investigation(uuid,uuid)',
    'public.can_delete_investigation(uuid,uuid)',
    'public.can_view_corrective_action(uuid,uuid)',
    'public.can_manage_corrective_action(uuid,uuid)',
    'public.can_verify_corrective_action(uuid,uuid)'
  ]
  loop
    function_definition := pg_get_functiondef(to_regprocedure(function_signature));
    patched_definition := regexp_replace(
      function_definition,
      'select[[:space:]]+exists[[:space:]]*[(]',
      'select public.safety_policy_access_allowed(target_organization_id) and exists (',
      'i'
    );
    if patched_definition = function_definition then
      raise exception 'Could not add safety policy enforcement to %', function_signature;
    end if;
    execute patched_definition;
  end loop;

  foreach function_signature in array array[
    'public.can_create_incident(uuid)',
    'public.can_assign_investigation(uuid)'
  ]
  loop
    function_definition := pg_get_functiondef(to_regprocedure(function_signature));
    patched_definition := replace(
      function_definition,
      'select public.has_org_permission(target_organization_id, ',
      'select public.safety_policy_access_allowed(target_organization_id) and public.has_org_permission(target_organization_id, '
    );
    if patched_definition = function_definition then
      raise exception 'Could not add safety policy enforcement to %', function_signature;
    end if;
    execute patched_definition;
  end loop;

  create or replace function public.can_create_corrective_action(target_organization_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
  as $function$
    select public.safety_policy_access_allowed(target_organization_id)
      and (
        public.has_org_permission(target_organization_id, 'create_corrective_action')
        or public.has_org_permission(target_organization_id, 'manage_corrective_actions')
      );
  $function$;

  function_definition := pg_get_functiondef(to_regprocedure('public.can_read_ai_session(uuid)'));
  patched_definition := replace(
    function_definition,
    'if not found or s.user_id is distinct from auth.uid() or s.expires_at<=now()',
    'if not found or s.user_id is distinct from auth.uid() or s.expires_at<=now() ' ||
    'or not public.safety_policy_access_allowed(s.organization_id)'
  );
  if patched_definition = function_definition then
    raise exception 'Could not add safety policy enforcement to can_read_ai_session';
  end if;
  execute patched_definition;
end;
$$;

notify pgrst, 'reload schema';
