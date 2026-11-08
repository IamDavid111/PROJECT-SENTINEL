alter table public.notification_preferences
  add column if not exists compliance_obligation_reminders boolean not null default true;

create unique index if not exists legal_compliance_expiry_notification_key_uidx
  on public.activity_logs ((metadata ->> 'notification_key'))
  where metadata ->> 'event_code' = 'legal_compliance_expiry_alert';

create or replace function public.legal_compliance_user_has_permission(
  target_organization_id uuid,
  target_user_id uuid,
  target_permission text
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
    where membership.organization_id = target_organization_id
      and membership.user_id = target_user_id
      and profile.account_status = 'active'
      and case
        when membership.role = 'Super Administrator' then true
        when exists (
          select 1 from public.organization_policy_objective_permission_overrides permission_override
          where permission_override.organization_id = membership.organization_id
            and permission_override.user_id = membership.user_id
            and permission_override.permission_key = target_permission
        ) then (
          select permission_override.is_granted
          from public.organization_policy_objective_permission_overrides permission_override
          where permission_override.organization_id = membership.organization_id
            and permission_override.user_id = membership.user_id
            and permission_override.permission_key = target_permission
        )
        when public.is_builtin_role_name(membership.role) then exists (
          select 1 from public.organization_builtin_role_settings role_setting
          where role_setting.organization_id = membership.organization_id
            and role_setting.role_key = membership.role
            and not role_setting.is_deleted
            and role_setting.permissions ? target_permission
        )
        else exists (
          select 1 from public.custom_roles custom_role
          where custom_role.organization_id = membership.organization_id
            and custom_role.name = membership.role
            and not custom_role.is_deleted
            and custom_role.permissions ? target_permission
        )
      end
  );
$$;

revoke all on function public.legal_compliance_user_has_permission(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.process_legal_compliance_expiry_alerts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_count integer;
begin
  with due as (
    select
      obligation.organization_id,
      obligation.id as obligation_id,
      obligation.obligation_name,
      obligation.issuing_authority,
      version.id as version_id,
      version.expiry_date,
      alert.days_before
    from public.legal_compliance_obligations obligation
    join public.legal_compliance_obligation_versions version
      on version.obligation_id = obligation.id
     and version.organization_id = obligation.organization_id
     and version.is_active
    cross join (values (30), (14)) as alert(days_before)
    where obligation.deleted_at is null
      and version.expiry_date = (now() at time zone 'UTC')::date + alert.days_before
  ), recipients as (
    select distinct
      due.organization_id,
      due.obligation_id,
      due.obligation_name,
      due.issuing_authority,
      due.version_id,
      due.expiry_date,
      due.days_before,
      membership.user_id as recipient_id,
      coalesce(preference.email, true)
        and coalesce(preference.compliance_obligation_reminders, true) as email_notify
    from due
    join public.legal_compliance_obligation_versions version
      on version.id = due.version_id and version.organization_id = due.organization_id
    join public.memberships membership on membership.organization_id = due.organization_id
    join public.profiles profile
      on profile.id = membership.user_id
     and profile.organization_id = membership.organization_id
     and profile.account_status = 'active'
    left join public.notification_preferences preference on preference.user_id = membership.user_id
    where membership.user_id = version.responsible_person_id
       or public.legal_compliance_user_has_permission(
         due.organization_id, membership.user_id, 'manage_legal_compliance_obligations'
       )
  )
  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  select
    recipient.organization_id,
    recipient.recipient_id,
    'Compliance obligation expires in ' || recipient.days_before || ' days',
    jsonb_build_object(
      'event_code', 'legal_compliance_expiry_alert',
      'entity_type', 'legal_compliance_obligation',
      'entity_id', recipient.obligation_id,
      'obligation_id', recipient.obligation_id,
      'version_id', recipient.version_id,
      'recipient_id', recipient.recipient_id,
      'obligation_name', recipient.obligation_name,
      'issuing_authority', recipient.issuing_authority,
      'expiry_date', recipient.expiry_date,
      'days_before', recipient.days_before,
      'notification_key', 'legal_compliance_expiry:' || recipient.version_id || ':' || recipient.days_before || ':' || recipient.recipient_id,
      'notification_ready', true,
      'email_notify', recipient.email_notify
    )
  from recipients recipient
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.process_legal_compliance_expiry_alerts() from public, anon, authenticated;
grant execute on function public.process_legal_compliance_expiry_alerts() to service_role;

create or replace function public.claim_next_legal_compliance_expiry_email()
returns table(
  event_id uuid,
  organization_id uuid,
  obligation_name text,
  issuing_authority text,
  expiry_date date,
  days_before integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  claimed_id uuid;
  claimed_organization_id uuid;
  claimed_metadata jsonb;
begin
  if actor_id is null or not exists (
    select 1 from public.profiles profile
    join public.memberships membership
      on membership.user_id = profile.id and membership.organization_id = profile.organization_id
    where profile.id = actor_id and profile.account_status = 'active'
  ) then
    raise exception 'An active organization member is required' using errcode = '42501';
  end if;

  select log.id into claimed_id
  from public.activity_logs log
  where log.user_id = actor_id
    and log.metadata ->> 'event_code' = 'legal_compliance_expiry_alert'
    and log.metadata ->> 'email_notify' = 'true'
    and log.metadata ->> 'email_delivery_status' is null
  order by log.created_at
  for update skip locked
  limit 1;

  if claimed_id is null then return; end if;

  update public.activity_logs log
  set metadata = log.metadata || jsonb_build_object(
    'email_delivery_status', 'sending',
    'email_delivery_started_at', now()
  )
  where log.id = claimed_id and log.user_id = actor_id
  returning log.organization_id, log.metadata into claimed_organization_id, claimed_metadata;

  return query select
    claimed_id,
    claimed_organization_id,
    claimed_metadata ->> 'obligation_name',
    claimed_metadata ->> 'issuing_authority',
    (claimed_metadata ->> 'expiry_date')::date,
    (claimed_metadata ->> 'days_before')::integer;
end;
$$;

create or replace function public.complete_legal_compliance_expiry_email(
  target_event_id uuid,
  delivery_succeeded boolean,
  failure_code text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  update public.activity_logs log
  set metadata = log.metadata || jsonb_build_object(
    'email_delivery_status', case when delivery_succeeded then 'sent' else 'failed' end,
    'email_delivery_completed_at', now(),
    'email_delivery_error_code', case when delivery_succeeded then null else left(coalesce(failure_code, 'unknown'), 80) end
  )
  where log.id = target_event_id
    and log.user_id = auth.uid()
    and log.metadata ->> 'event_code' = 'legal_compliance_expiry_alert'
    and log.metadata ->> 'email_delivery_status' = 'sending';
  if not found then raise exception 'Email delivery claim was not found' using errcode = '42501'; end if;
end;
$$;

revoke all on function public.claim_next_legal_compliance_expiry_email() from public, anon;
revoke all on function public.complete_legal_compliance_expiry_email(uuid, boolean, text) from public, anon;
grant execute on function public.claim_next_legal_compliance_expiry_email() to authenticated;
grant execute on function public.complete_legal_compliance_expiry_email(uuid, boolean, text) to authenticated;

create extension if not exists pg_cron with schema pg_catalog;
do $$
declare existing_job record;
begin
  for existing_job in select jobid from cron.job where jobname = 'legal-compliance-expiry-alerts'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
  perform cron.schedule('legal-compliance-expiry-alerts', '0 7 * * *',
    'select public.process_legal_compliance_expiry_alerts()');
end;
$$;