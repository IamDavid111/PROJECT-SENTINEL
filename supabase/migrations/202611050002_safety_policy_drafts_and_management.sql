alter table public.safety_policies
  add column if not exists draft_version_id uuid,
  add column if not exists draft_frequency text,
  add column if not exists draft_interval_days integer,
  add column if not exists draft_timezone text,
  add column if not exists draft_is_starter boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'safety_policies_draft_version_fk'
      and conrelid = 'public.safety_policies'::regclass
  ) then
    alter table public.safety_policies
      add constraint safety_policies_draft_version_fk
      foreign key (organization_id, id, draft_version_id)
      references public.safety_policy_versions(organization_id, policy_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'safety_policies_draft_frequency_check'
      and conrelid = 'public.safety_policies'::regclass
  ) then
    alter table public.safety_policies
      add constraint safety_policies_draft_frequency_check
      check (
        (draft_version_id is null
          and draft_frequency is null
          and draft_interval_days is null
          and draft_timezone is null
          and not draft_is_starter)
        or (
          draft_version_id is not null
          and draft_frequency is not null
          and draft_frequency in ('every_login', 'first_login', 'interval_days', 'weekly')
          and draft_timezone is not null
          and (
            (draft_frequency = 'interval_days' and draft_interval_days between 1 and 365)
            or (draft_frequency <> 'interval_days' and draft_interval_days is null)
          )
        )
      );
  end if;
end;
$$;

create or replace function public.safety_policy_manager_organization_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_organization_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select profile.organization_id into actor_organization_id
  from public.profiles profile
  join public.memberships membership
    on membership.user_id = profile.id
   and membership.organization_id = profile.organization_id
  where profile.id = actor_id
    and profile.account_status = 'active';

  if actor_organization_id is null
    or not public.has_org_permission(actor_organization_id, 'manage_settings') then
    raise exception 'Only an authorized organization administrator can manage the safety policy'
      using errcode = '42501';
  end if;

  return actor_organization_id;
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
  user_organization_id uuid := public.safety_policy_manager_organization_id();
  policy_row public.safety_policies;
  version_row public.safety_policy_versions;
  published_version_row public.safety_policy_versions;
begin
  select * into policy_row
  from public.safety_policies
  where organization_id = user_organization_id;

  if not found then
    return jsonb_build_object(
      'configured', false,
      'active', false,
      'deleted', false,
      'hasDraft', false,
      'isStarterDraft', false
    );
  end if;

  if coalesce(policy_row.draft_version_id, policy_row.current_version_id) is not null then
    select * into version_row
    from public.safety_policy_versions
    where id = coalesce(policy_row.draft_version_id, policy_row.current_version_id)
      and organization_id = user_organization_id
      and policy_id = policy_row.id;
  end if;

  if policy_row.current_version_id is not null then
    select * into published_version_row
    from public.safety_policy_versions
    where id = policy_row.current_version_id
      and organization_id = user_organization_id
      and policy_id = policy_row.id;
  end if;

  return jsonb_build_object(
    'configured', version_row.id is not null,
    'active', policy_row.is_active and not policy_row.is_deleted,
    'deleted', policy_row.is_deleted,
    'hasDraft', policy_row.draft_version_id is not null,
    'isStarterDraft', policy_row.draft_is_starter,
    'policyId', policy_row.id,
    'versionId', version_row.id,
    'versionNumber', version_row.version_number,
    'publishedVersionNumber', published_version_row.version_number,
    'title', version_row.title,
    'text', version_row.policy_text,
    'frequency', case when policy_row.draft_version_id is not null
      then policy_row.draft_frequency else policy_row.frequency end,
    'intervalDays', case when policy_row.draft_version_id is not null
      then policy_row.draft_interval_days else policy_row.interval_days end,
    'timezone', case when policy_row.draft_version_id is not null
      then policy_row.draft_timezone else policy_row.timezone end,
    'updatedAt', policy_row.updated_at
  );
end;
$$;

create or replace function public.save_safety_policy_draft(
  policy_title text,
  policy_text text,
  acknowledgement_frequency text,
  acknowledgement_interval_days integer,
  acknowledgement_timezone text,
  starter_template boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  user_organization_id uuid := public.safety_policy_manager_organization_id();
  policy_row public.safety_policies;
  baseline_version public.safety_policy_versions;
  next_version integer;
  normalized_title text := nullif(btrim(policy_title), '');
  normalized_text text := nullif(btrim(policy_text), '');
  had_draft boolean := false;
begin
  if normalized_title is null or length(normalized_title) > 200
    or normalized_text is null or length(normalized_text) > 50000 then
    raise exception 'A title (1–200 characters) and policy text (1–50000 characters) are required'
      using errcode = '22023';
  end if;
  if acknowledgement_frequency is null
    or acknowledgement_frequency not in ('every_login', 'first_login', 'interval_days', 'weekly') then
    raise exception 'Invalid acknowledgement frequency' using errcode = '22023';
  end if;
  if (acknowledgement_frequency = 'interval_days'
      and (acknowledgement_interval_days is null or acknowledgement_interval_days not between 1 and 365))
    or (acknowledgement_frequency <> 'interval_days' and acknowledgement_interval_days is not null) then
    raise exception 'The interval must be between 1 and 365 days and is only valid for interval mode'
      using errcode = '22023';
  end if;
  if acknowledgement_timezone is null or not exists (
    select 1 from pg_timezone_names where name = acknowledgement_timezone
  ) then
    raise exception 'Select a valid IANA timezone' using errcode = '22023';
  end if;

  select * into policy_row
  from public.safety_policies
  where organization_id = user_organization_id
  for update;

  if not found then
    insert into public.safety_policies (
      organization_id, is_active, is_deleted, frequency, interval_days, timezone, updated_by
    )
    values (
      user_organization_id, false, false, 'every_login', null, 'UTC', current_user_id
    )
    on conflict (organization_id) do nothing;

    select * into policy_row
    from public.safety_policies
    where organization_id = user_organization_id
    for update;
  end if;

  had_draft := policy_row.draft_version_id is not null;
  if had_draft then
    select * into baseline_version
    from public.safety_policy_versions
    where id = policy_row.draft_version_id
      and organization_id = user_organization_id
      and policy_id = policy_row.id;
  elsif policy_row.current_version_id is not null then
    select * into baseline_version
    from public.safety_policy_versions
    where id = policy_row.current_version_id
      and organization_id = user_organization_id
      and policy_id = policy_row.id;
  end if;

  if baseline_version.id is null
    or baseline_version.title is distinct from normalized_title
    or baseline_version.policy_text is distinct from normalized_text then
    select coalesce(max(version_number), 0) + 1 into next_version
    from public.safety_policy_versions
    where policy_id = policy_row.id
      and organization_id = user_organization_id;

    insert into public.safety_policy_versions (
      policy_id, organization_id, version_number, title, policy_text, created_by
    )
    values (
      policy_row.id, user_organization_id, next_version,
      normalized_title, normalized_text, current_user_id
    )
    returning * into baseline_version;
  end if;

  update public.safety_policies
  set draft_version_id = baseline_version.id,
      draft_frequency = acknowledgement_frequency,
      draft_interval_days = acknowledgement_interval_days,
      draft_timezone = acknowledgement_timezone,
      draft_is_starter = policy_row.draft_is_starter or coalesce(starter_template, false),
      is_deleted = false,
      updated_by = current_user_id,
      updated_at = now()
  where id = policy_row.id;

  insert into public.activity_logs (
    organization_id, user_id, activity, metadata
  )
  values (
    user_organization_id,
    current_user_id,
    case when had_draft or policy_row.current_version_id is not null
      then 'Safety policy draft updated' else 'Safety policy draft created' end,
    jsonb_build_object(
      'event_code', case when had_draft or policy_row.current_version_id is not null
        then 'safety_policy_draft_updated' else 'safety_policy_draft_created' end,
      'policy_id', policy_row.id,
      'policy_version_id', baseline_version.id,
      'version_number', baseline_version.version_number,
      'starter_template', policy_row.draft_is_starter or coalesce(starter_template, false)
    )
  );

  return public.get_safety_policy_settings();
end;
$$;

create or replace function public.create_safety_policy_starter_draft()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  user_organization_id uuid := public.safety_policy_manager_organization_id();
  policy_row public.safety_policies;
begin
  select * into policy_row
  from public.safety_policies
  where organization_id = user_organization_id
  for update;

  if found and policy_row.draft_version_id is not null then
    raise exception 'A policy draft already exists. Edit or delete it before loading the starter template'
      using errcode = '22023';
  end if;

  return public.save_safety_policy_draft(
    'Starter QHSE Safety Policy',
$template$STARTER TEMPLATE - REVIEW AND CUSTOMIZE BEFORE PUBLISHING

This generic template is provided as a starting point only. It is not legal or regulatory advice and must be reviewed, approved, and adapted to the organization's activities, locations, hazards, applicable laws, client requirements, and emergency arrangements before publication.

1. PURPOSE AND COMMITMENT
[Organization name] is committed to protecting the health and safety of workers, contractors, visitors, and other people who may be affected by its activities, and to preventing work-related injury, ill health, property damage, and environmental harm. Work must be planned and carried out so far as reasonably practicable to eliminate hazards and reduce risks.

2. SCOPE
This policy applies to all employees, contractors, temporary workers, and visitors at locations and work activities controlled by [Organization name]. Project-specific, client, or site requirements that provide stronger protections must also be followed.

3. RESPONSIBILITIES
Leadership provides resources, sets measurable objectives, reviews performance, and demonstrates visible commitment. Managers and supervisors identify hazards, assess risk, communicate controls, verify competence, provide suitable equipment, and stop work that is unsafe. Workers follow training and procedures, use required protective equipment, report hazards and incidents promptly, and participate in consultation and improvement. Contractors must meet this policy and applicable site requirements. Everyone has authority to stop work when an immediate or uncontrolled risk is identified, without retaliation for a good-faith safety concern.

4. HAZARD IDENTIFICATION AND RISK CONTROL
Work must be assessed before it starts and when conditions change. Apply the hierarchy of controls: eliminate the hazard, substitute a safer method, use engineering controls, use administrative controls, and use personal protective equipment as a supplementary measure. Required permits, isolations, inspections, and safe-work procedures must be in place before relevant work begins.

5. TRAINING AND COMPETENCE
People must receive task-appropriate induction, instruction, supervision, and refresher training. Only competent and authorized persons may perform specialist or high-risk work. Training needs and records must be reviewed when work, equipment, or risks change.

6. PERSONAL PROTECTIVE EQUIPMENT
The organization provides or specifies suitable personal protective equipment based on assessed hazards and applicable requirements. Users must inspect, correctly wear, maintain, and report defects in their equipment. PPE does not replace practicable higher-level controls.

7. HAZARD, NEAR-MISS, AND INCIDENT REPORTING
Hazards, near misses, injuries, occupational ill health, environmental events, and unsafe conditions must be reported as soon as practicable through [reporting method/contact]. Immediate dangers must be communicated to the supervisor and affected people. Incidents will be recorded, investigated proportionately, and used to identify corrective and preventive actions. Retaliation for reporting in good faith is prohibited.

8. EMERGENCY PREPAREDNESS
Personnel must know the site-specific alarm, evacuation, assembly, communication, first-aid, and emergency response arrangements. Emergency plans, contacts, equipment, and drills must be appropriate to the location and foreseeable events. Site-specific emergency information: [insert approved arrangements and contacts].

9. HEALTH, ENVIRONMENT, AND WELFARE
Work must consider occupational health exposures, fatigue, fitness for work, ergonomics, welfare, and environmental aspects relevant to the activity. Controls and monitoring must be selected according to risk and applicable requirements.

10. CONSULTATION AND CONTINUOUS IMPROVEMENT
Workers and their representatives will be consulted on hazards, controls, changes, incidents, and improvement opportunities. The organization will monitor inspections, training, incidents, corrective actions, and objectives; verify that actions are effective; and review this policy at least annually and after significant changes or events.

11. POLICY APPROVAL AND REVIEW
Policy owner: [name/title]
Approved by: [authorized approver]
Effective date: [date]
Next review date: [date]
Organization-specific legal, regulatory, client, and site requirements: [identify and maintain separately]
$template$,
    'first_login',
    null,
    'UTC',
    true
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
  user_organization_id uuid := public.safety_policy_manager_organization_id();
  policy_row public.safety_policies;
  was_active boolean;
  published_draft boolean;
begin
  if activate_policy is null then
    raise exception 'Choose whether to publish the safety policy' using errcode = '22023';
  end if;

  select * into policy_row
  from public.safety_policies
  where organization_id = user_organization_id
  for update;

  if not found then
    raise exception 'A saved policy draft is required before it can be published'
      using errcode = '22023';
  end if;

  was_active := policy_row.is_active and not policy_row.is_deleted;
  published_draft := policy_row.draft_version_id is not null;

  if activate_policy then
    if not published_draft and policy_row.current_version_id is null then
      raise exception 'A saved policy draft is required before it can be published'
        using errcode = '22023';
    end if;

    update public.safety_policies
    set current_version_id = coalesce(draft_version_id, current_version_id),
        frequency = coalesce(draft_frequency, frequency),
        interval_days = case when draft_version_id is not null then draft_interval_days else interval_days end,
        timezone = coalesce(draft_timezone, timezone),
        draft_version_id = null,
        draft_frequency = null,
        draft_interval_days = null,
        draft_timezone = null,
        draft_is_starter = false,
        is_active = true,
        is_deleted = false,
        updated_by = auth.uid(),
        updated_at = now()
    where id = policy_row.id
    returning * into policy_row;

    if not was_active or published_draft then
      insert into public.activity_logs (
        organization_id, user_id, activity, metadata
      )
      select
        user_organization_id,
        auth.uid(),
        'Safety policy published',
        jsonb_build_object(
          'event_code', 'safety_policy_published',
          'policy_id', policy_row.id,
          'policy_version_id', policy_row.current_version_id,
          'version_number', version.version_number
        )
      from public.safety_policy_versions version
      where version.id = policy_row.current_version_id
        and version.organization_id = user_organization_id
        and version.policy_id = policy_row.id;
    end if;
  else
    update public.safety_policies
    set is_active = false,
        updated_by = auth.uid(),
        updated_at = now()
    where id = policy_row.id
    returning * into policy_row;

    if was_active then
      insert into public.activity_logs (
        organization_id, user_id, activity, metadata
      )
      values (
        user_organization_id,
        auth.uid(),
        'Safety policy unpublished',
        jsonb_build_object(
          'event_code', 'safety_policy_unpublished',
          'policy_id', policy_row.id,
          'policy_version_id', policy_row.current_version_id
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'active', policy_row.is_active and not policy_row.is_deleted,
    'deleted', policy_row.is_deleted,
    'publishedVersionId', policy_row.current_version_id
  );
end;
$$;

create or replace function public.delete_safety_policy()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  user_organization_id uuid := public.safety_policy_manager_organization_id();
  policy_row public.safety_policies;
  was_deleted boolean;
begin
  select * into policy_row
  from public.safety_policies
  where organization_id = user_organization_id
  for update;

  if not found or (policy_row.current_version_id is null and policy_row.draft_version_id is null) then
    raise exception 'No saved safety policy exists to delete' using errcode = '22023';
  end if;

  was_deleted := policy_row.is_deleted;
  update public.safety_policies
  set is_active = false,
      is_deleted = true,
      updated_by = auth.uid(),
      updated_at = now()
  where id = policy_row.id
  returning * into policy_row;

  if not was_deleted then
    insert into public.activity_logs (
      organization_id, user_id, activity, metadata
    )
    values (
      user_organization_id,
      auth.uid(),
      'Safety policy deleted',
      jsonb_build_object(
        'event_code', 'safety_policy_deleted',
        'policy_id', policy_row.id,
        'published_version_id', policy_row.current_version_id,
        'draft_version_id', policy_row.draft_version_id
      )
    );
  end if;

  return jsonb_build_object('deleted', true, 'active', false);
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
begin
  if activate_policy is null then
    raise exception 'Choose whether to publish the safety policy' using errcode = '22023';
  end if;

  perform public.save_safety_policy_draft(
    policy_title,
    policy_text,
    acknowledgement_frequency,
    acknowledgement_interval_days,
    acknowledgement_timezone,
    false
  );

  perform public.set_safety_policy_active(activate_policy);
  return public.get_safety_policy_settings();
end;
$$;

revoke all on function public.safety_policy_manager_organization_id() from public, anon, authenticated;
revoke all on function public.get_safety_policy_settings() from public, anon;
revoke all on function public.save_safety_policy_draft(text, text, text, integer, text, boolean) from public, anon;
revoke all on function public.create_safety_policy_starter_draft() from public, anon;
revoke all on function public.set_safety_policy_active(boolean) from public, anon;
revoke all on function public.delete_safety_policy() from public, anon;
revoke all on function public.save_safety_policy(text, text, text, integer, text, boolean) from public, anon;

grant execute on function public.get_safety_policy_settings() to authenticated;
grant execute on function public.save_safety_policy_draft(text, text, text, integer, text, boolean) to authenticated;
grant execute on function public.create_safety_policy_starter_draft() to authenticated;
grant execute on function public.set_safety_policy_active(boolean) to authenticated;
grant execute on function public.delete_safety_policy() to authenticated;
grant execute on function public.save_safety_policy(text, text, text, integer, text, boolean) to authenticated;

notify pgrst, 'reload schema';
