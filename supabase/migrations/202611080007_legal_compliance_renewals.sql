alter table public.legal_compliance_obligation_versions
  add column lifecycle_status text not null default 'active'
    check (lifecycle_status in ('draft', 'active', 'superseded', 'abandoned'));

create or replace function public.guard_legal_compliance_version_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.version_number = 1 and new.lifecycle_status = 'active' and new.is_active then
      return new;
    end if;
    if new.version_number > 1 and new.lifecycle_status = 'draft' and not new.is_active then
      return new;
    end if;
    raise exception 'Compliance versions must start as an initial active version or a renewal draft'
      using errcode = '42501';
  end if;

  if old.lifecycle_status in ('superseded', 'abandoned') then
    raise exception 'Historical compliance versions are read-only' using errcode = '42501';
  end if;
  if (new.lifecycle_status is distinct from old.lifecycle_status or new.is_active is distinct from old.is_active)
    and coalesce(current_setting('app.legal_compliance_renewal', true), '') <> 'on' then
    raise exception 'Only the compliance renewal workflow can change version state' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger legal_compliance_version_history_guard
before insert or update on public.legal_compliance_obligation_versions
for each row execute function public.guard_legal_compliance_version_history();
revoke all on function public.guard_legal_compliance_version_history() from public, anon, authenticated;

create or replace function public.begin_legal_compliance_renewal(
  p_organization_id uuid,
  p_obligation_id uuid,
  p_issue_date date,
  p_expiry_date date,
  p_responsible_person_id uuid,
  p_compliance_status text
)
returns public.legal_compliance_obligation_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  obligation public.legal_compliance_obligations;
  next_version integer;
  created_version public.legal_compliance_obligation_versions;
begin
  if actor_id is null or not public.has_org_permission(p_organization_id, 'manage_legal_compliance_obligations') then
    raise exception 'Manage Legal and Compliance Obligations permission is required' using errcode = '42501';
  end if;
  if p_issue_date is null or p_responsible_person_id is null
    or p_compliance_status not in ('not_assessed', 'compliant', 'non_compliant', 'under_review')
    or (p_expiry_date is not null and p_expiry_date < p_issue_date) then
    raise exception 'Renewal fields are invalid' using errcode = '22023';
  end if;

  select * into obligation
  from public.legal_compliance_obligations
  where id = p_obligation_id and organization_id = p_organization_id and deleted_at is null
  for update;
  if not found then raise exception 'Compliance obligation not found' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.memberships membership
    join public.profiles profile on profile.id = membership.user_id and profile.organization_id = membership.organization_id
    where membership.user_id = p_responsible_person_id
      and membership.organization_id = p_organization_id
      and profile.account_status = 'active'
  ) then
    raise exception 'Responsible person must be an active organization member' using errcode = '22023';
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.legal_compliance_obligation_versions
  where organization_id = p_organization_id and obligation_id = p_obligation_id;

  insert into public.legal_compliance_obligation_versions (
    organization_id, obligation_id, version_number, is_active, lifecycle_status,
    issue_date, expiry_date, responsible_person_id, compliance_status, uploaded_by
  ) values (
    p_organization_id, p_obligation_id, next_version, false, 'draft',
    p_issue_date, p_expiry_date, p_responsible_person_id, p_compliance_status, actor_id
  ) returning * into created_version;

  return created_version;
end;
$$;

create or replace function public.activate_legal_compliance_renewal(
  p_organization_id uuid,
  p_obligation_id uuid,
  p_version_id uuid
)
returns public.legal_compliance_obligation_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  previous_version public.legal_compliance_obligation_versions;
  next_version public.legal_compliance_obligation_versions;
begin
  if actor_id is null or not public.has_org_permission(p_organization_id, 'manage_legal_compliance_obligations') then
    raise exception 'Manage Legal and Compliance Obligations permission is required' using errcode = '42501';
  end if;
  perform 1 from public.legal_compliance_obligations
  where id = p_obligation_id and organization_id = p_organization_id and deleted_at is null
  for update;
  if not found then raise exception 'Compliance obligation not found' using errcode = 'P0002'; end if;

  select * into next_version
  from public.legal_compliance_obligation_versions
  where id = p_version_id and organization_id = p_organization_id
    and obligation_id = p_obligation_id and lifecycle_status = 'draft' and not is_active
  for update;
  if not found then raise exception 'Renewal draft not found' using errcode = 'P0002'; end if;

  select * into previous_version
  from public.legal_compliance_obligation_versions
  where organization_id = p_organization_id and obligation_id = p_obligation_id and is_active
  for update;
  if not found then raise exception 'Active compliance version not found' using errcode = 'P0002'; end if;

  perform set_config('app.legal_compliance_renewal', 'on', true);
  update public.legal_compliance_obligation_versions
  set is_active = false, lifecycle_status = 'superseded'
  where id = previous_version.id and organization_id = p_organization_id;
  update public.legal_compliance_obligation_versions
  set is_active = true, lifecycle_status = 'active'
  where id = next_version.id and organization_id = p_organization_id
  returning * into next_version;

  update public.activity_logs
  set metadata = metadata || jsonb_build_object(
    'email_delivery_status', 'cancelled',
    'email_delivery_cancelled_at', now(),
    'email_delivery_cancel_reason', 'obligation_renewed'
  )
  where organization_id = p_organization_id
    and metadata ->> 'event_code' = 'legal_compliance_expiry_alert'
    and metadata ->> 'version_id' = previous_version.id::text
    and metadata ->> 'email_delivery_status' is null;

  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  values (
    p_organization_id,
    actor_id,
    'Legal compliance obligation renewed',
    jsonb_build_object(
      'event_code', 'legal_compliance_obligation_renewed',
      'entity_type', 'legal_compliance_obligation',
      'entity_id', p_obligation_id,
      'previous_version_id', previous_version.id,
      'new_version_id', next_version.id,
      'version_number', next_version.version_number
    )
  );

  return next_version;
end;
$$;

create or replace function public.abandon_legal_compliance_renewal(
  p_organization_id uuid,
  p_obligation_id uuid,
  p_version_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_org_permission(p_organization_id, 'manage_legal_compliance_obligations') then
    raise exception 'Manage Legal and Compliance Obligations permission is required' using errcode = '42501';
  end if;
  perform set_config('app.legal_compliance_renewal', 'on', true);
  update public.legal_compliance_obligation_versions
  set lifecycle_status = 'abandoned'
  where id = p_version_id and organization_id = p_organization_id
    and obligation_id = p_obligation_id and lifecycle_status = 'draft' and not is_active;
end;
$$;

revoke all on function public.begin_legal_compliance_renewal(uuid, uuid, date, date, uuid, text) from public, anon;
revoke all on function public.activate_legal_compliance_renewal(uuid, uuid, uuid) from public, anon;
revoke all on function public.abandon_legal_compliance_renewal(uuid, uuid, uuid) from public, anon;
grant execute on function public.begin_legal_compliance_renewal(uuid, uuid, date, date, uuid, text) to authenticated;
grant execute on function public.activate_legal_compliance_renewal(uuid, uuid, uuid) to authenticated;
grant execute on function public.abandon_legal_compliance_renewal(uuid, uuid, uuid) to authenticated;

drop policy if exists legal_compliance_documents_insert on storage.objects;
create policy legal_compliance_documents_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'legal-compliance-documents'
  and exists (
    select 1
    from public.legal_compliance_obligation_versions version
    join public.legal_compliance_obligations obligation
      on obligation.id = version.obligation_id and obligation.organization_id = version.organization_id
    where version.id::text = (storage.foldername(name))[3]
      and version.obligation_id::text = (storage.foldername(name))[2]
      and version.organization_id::text = (storage.foldername(name))[1]
      and obligation.deleted_at is null
      and version.lifecycle_status in ('draft', 'active')
      and public.has_org_permission(version.organization_id, 'manage_legal_compliance_obligations')
  )
);

drop policy if exists legal_compliance_documents_delete on storage.objects;
create policy legal_compliance_documents_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'legal-compliance-documents'
  and exists (
    select 1
    from public.legal_compliance_obligation_versions version
    join public.legal_compliance_obligations obligation
      on obligation.id = version.obligation_id and obligation.organization_id = version.organization_id
    where version.document_path = storage.objects.name
      and version.lifecycle_status in ('draft', 'active')
      and obligation.deleted_at is null
      and public.has_org_permission(version.organization_id, 'manage_legal_compliance_obligations')
  )
);

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
    select obligation.organization_id, obligation.id as obligation_id,
      obligation.obligation_name, obligation.issuing_authority,
      version.id as version_id, version.expiry_date, alert.days_before
    from public.legal_compliance_obligations obligation
    join public.legal_compliance_obligation_versions version
      on version.obligation_id = obligation.id
     and version.organization_id = obligation.organization_id
     and version.is_active and version.lifecycle_status = 'active'
    cross join (values (30), (14)) as alert(days_before)
    where obligation.deleted_at is null
      and version.expiry_date = (now() at time zone 'UTC')::date + alert.days_before
  ), recipients as (
    select distinct due.*, membership.user_id as recipient_id,
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
  select recipient.organization_id, recipient.recipient_id,
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

revoke all on function public.legal_compliance_user_has_permission(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.process_legal_compliance_expiry_alerts() from public, anon, authenticated;
grant execute on function public.process_legal_compliance_expiry_alerts() to service_role;

notify pgrst, 'reload schema';