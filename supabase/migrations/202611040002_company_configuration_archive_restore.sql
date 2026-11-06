create or replace function public.company_configuration_items(setting_value jsonb, setting_category text)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when jsonb_typeof(setting_value) = 'array' then setting_value
    when setting_category = 'shift' and jsonb_typeof(setting_value->'shifts') = 'array' then setting_value->'shifts'
    when setting_category = 'department' and jsonb_typeof(setting_value->'items') = 'array' then setting_value->'items'
    when setting_category = 'department' and jsonb_typeof(setting_value->'departments') = 'array' then setting_value->'departments'
    when setting_category = 'site' and jsonb_typeof(setting_value->'items') = 'array' then setting_value->'items'
    when setting_category = 'site' and jsonb_typeof(setting_value->'sites') = 'array' then setting_value->'sites'
    when setting_category = 'site' and jsonb_typeof(setting_value->'operational_sites') = 'array' then setting_value->'operational_sites'
    when setting_category = 'severity' and jsonb_typeof(setting_value->'items') = 'array' then setting_value->'items'
    when setting_category = 'severity' and jsonb_typeof(setting_value->'levels') = 'array' then setting_value->'levels'
    when setting_category = 'severity' and jsonb_typeof(setting_value->'severity_levels') = 'array' then setting_value->'severity_levels'
    when setting_category = 'incident_category' and jsonb_typeof(setting_value->'items') = 'array' then setting_value->'items'
    when setting_category = 'incident_category' and jsonb_typeof(setting_value->'categories') = 'array' then setting_value->'categories'
    when setting_category = 'incident_category' and jsonb_typeof(setting_value->'incident_categories') = 'array' then setting_value->'incident_categories'
    else '[]'::jsonb
  end;
$$;

create or replace function public.company_configuration_item_name(config_item jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when jsonb_typeof(config_item) = 'string' then config_item #>> '{}'
    else config_item->>'name'
  end;
$$;

create or replace function public.company_configuration_item_id(config_item jsonb, setting_category text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(btrim(config_item->>'id'), ''),
    'legacy:' || setting_category || ':' || lower(btrim(coalesce(public.company_configuration_item_name(config_item), '')))
  );
$$;

create or replace function public.company_configuration_with_items(setting_value jsonb, setting_category text, config_items jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  wrapper_key text;
begin
  if setting_category = 'shift' then
    return jsonb_set(
      case when jsonb_typeof(setting_value) = 'object' then setting_value else '{}'::jsonb end,
      '{shifts}',
      config_items,
      true
    );
  end if;

  if jsonb_typeof(setting_value) = 'object' then
    case setting_category
      when 'department' then
        wrapper_key := case
          when jsonb_typeof(setting_value->'items') = 'array' then 'items'
          when jsonb_typeof(setting_value->'departments') = 'array' then 'departments'
          else null
        end;
      when 'site' then
        wrapper_key := case
          when jsonb_typeof(setting_value->'items') = 'array' then 'items'
          when jsonb_typeof(setting_value->'sites') = 'array' then 'sites'
          when jsonb_typeof(setting_value->'operational_sites') = 'array' then 'operational_sites'
          else null
        end;
      when 'severity' then
        wrapper_key := case
          when jsonb_typeof(setting_value->'items') = 'array' then 'items'
          when jsonb_typeof(setting_value->'levels') = 'array' then 'levels'
          when jsonb_typeof(setting_value->'severity_levels') = 'array' then 'severity_levels'
          else null
        end;
      when 'incident_category' then
        wrapper_key := case
          when jsonb_typeof(setting_value->'items') = 'array' then 'items'
          when jsonb_typeof(setting_value->'categories') = 'array' then 'categories'
          when jsonb_typeof(setting_value->'incident_categories') = 'array' then 'incident_categories'
          else null
        end;
    end case;
    if wrapper_key is not null then
      return jsonb_set(setting_value, array[wrapper_key], config_items, true);
    end if;
  end if;

  return config_items;
end;
$$;

create or replace function public.company_configuration_merge_existing(new_value jsonb, old_value jsonb, setting_category text)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  merged_items jsonb := public.company_configuration_items(new_value, setting_category);
  old_item jsonb;
  old_item_id text;
begin
  for old_item in
    select value from jsonb_array_elements(public.company_configuration_items(old_value, setting_category))
  loop
    old_item_id := public.company_configuration_item_id(old_item, setting_category);
    if not exists (
      select 1
      from jsonb_array_elements(merged_items) as candidate(value)
      where public.company_configuration_item_id(candidate.value, setting_category) = old_item_id
    ) then
      merged_items := merged_items || jsonb_build_array(old_item);
    end if;
  end loop;

  return public.company_configuration_with_items(new_value, setting_category, merged_items);
end;
$$;

create or replace function public.validate_company_configuration_items(
  current_value jsonb,
  previous_value jsonb,
  setting_category text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  current_item jsonb;
  other_item jsonb;
  previous_item jsonb;
  current_name text;
  current_id text;
  current_position bigint;
  other_name text;
  other_id text;
  other_position bigint;
  previous_name text;
  previous_id text;
  restore_id text := current_setting('app.company_configuration_restore_id', true);
  restore_category text := current_setting('app.company_configuration_restore_category', true);
begin
  for current_item, current_position in
    select value, ordinality
    from jsonb_array_elements(public.company_configuration_items(current_value, setting_category)) with ordinality
  loop
    if coalesce(current_item->>'deleted', 'false') = 'true' then
      continue;
    end if;

    current_name := lower(btrim(coalesce(public.company_configuration_item_name(current_item), '')));
    current_id := public.company_configuration_item_id(current_item, setting_category);
    if current_name = '' then
      continue;
    end if;

    for other_item, other_position in
      select value, ordinality
      from jsonb_array_elements(public.company_configuration_items(current_value, setting_category)) with ordinality
    loop
      other_id := public.company_configuration_item_id(other_item, setting_category);
      other_name := lower(btrim(coalesce(public.company_configuration_item_name(other_item), '')));
      if other_position <> current_position and other_name = current_name then
        if coalesce(other_item->>'deleted', 'false') = 'true' then
          raise exception 'archived_item_exists' using errcode = '23505';
        end if;
        if coalesce(other_item->>'deleted', 'false') <> 'true' then
          raise exception 'duplicate_configuration_name' using errcode = '23505';
        end if;
      end if;
    end loop;

    for previous_item in
      select value from jsonb_array_elements(public.company_configuration_items(previous_value, setting_category))
    loop
      previous_id := public.company_configuration_item_id(previous_item, setting_category);
      previous_name := lower(btrim(coalesce(public.company_configuration_item_name(previous_item), '')));

      if previous_id = current_id
        and coalesce(previous_item->>'deleted', 'false') = 'true'
        and coalesce(current_item->>'deleted', 'false') <> 'true'
        and not (restore_id = current_id and restore_category = setting_category) then
        raise exception 'configuration_restore_required' using errcode = '42501';
      end if;

      if previous_id <> current_id
        and previous_name = current_name
        and coalesce(previous_item->>'deleted', 'false') = 'true' then
        raise exception 'archived_item_exists' using errcode = '23505';
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function public.log_company_configuration_archive_transitions(
  target_organization_id uuid,
  previous_value jsonb,
  current_value jsonb,
  setting_category text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_item jsonb;
  previous_item jsonb;
  current_id text;
  current_name text;
  previous_exists boolean;
  was_deleted boolean;
begin
  for current_item in
    select value from jsonb_array_elements(public.company_configuration_items(current_value, setting_category))
  loop
    if coalesce(current_item->>'deleted', 'false') <> 'true' then
      continue;
    end if;

    current_id := public.company_configuration_item_id(current_item, setting_category);
    current_name := public.company_configuration_item_name(current_item);
    previous_exists := false;
    was_deleted := false;

    for previous_item in
      select value from jsonb_array_elements(public.company_configuration_items(previous_value, setting_category))
    loop
      if public.company_configuration_item_id(previous_item, setting_category) = current_id then
        previous_exists := true;
        was_deleted := coalesce(previous_item->>'deleted', 'false') = 'true';
        exit;
      end if;
    end loop;

    if not previous_exists then
      raise exception 'cannot_create_archived_item' using errcode = '22023';
    end if;

    if not was_deleted then
      insert into public.activity_logs (organization_id, user_id, activity, metadata)
      values (
        target_organization_id,
        (select auth.uid()),
        'Company configuration item archived',
        jsonb_build_object(
          'action', 'ARCHIVE',
          'category', setting_category,
          'item_id', current_id,
          'item_name', current_name
        )
      );
    end if;
  end loop;
end;
$$;

create or replace function public.guard_company_configuration_updates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text, 736249));

  if tg_op = 'UPDATE' then
    new.working_hours := public.company_configuration_merge_existing(new.working_hours, old.working_hours, 'shift');
    new.departments := public.company_configuration_merge_existing(new.departments, old.departments, 'department');
    new.operational_sites := public.company_configuration_merge_existing(new.operational_sites, old.operational_sites, 'site');
    new.severity_levels := public.company_configuration_merge_existing(new.severity_levels, old.severity_levels, 'severity');
    new.incident_categories := public.company_configuration_merge_existing(new.incident_categories, old.incident_categories, 'incident_category');
    perform public.log_company_configuration_archive_transitions(new.organization_id, old.operational_sites, new.operational_sites, 'site');
    perform public.log_company_configuration_archive_transitions(new.organization_id, old.departments, new.departments, 'department');
    perform public.log_company_configuration_archive_transitions(new.organization_id, old.working_hours, new.working_hours, 'shift');
    perform public.log_company_configuration_archive_transitions(new.organization_id, old.severity_levels, new.severity_levels, 'severity');
    perform public.log_company_configuration_archive_transitions(new.organization_id, old.incident_categories, new.incident_categories, 'incident_category');
  else
    perform public.log_company_configuration_archive_transitions(new.organization_id, '[]'::jsonb, new.operational_sites, 'site');
    perform public.log_company_configuration_archive_transitions(new.organization_id, '[]'::jsonb, new.departments, 'department');
    perform public.log_company_configuration_archive_transitions(new.organization_id, '[]'::jsonb, new.working_hours, 'shift');
    perform public.log_company_configuration_archive_transitions(new.organization_id, '[]'::jsonb, new.severity_levels, 'severity');
    perform public.log_company_configuration_archive_transitions(new.organization_id, '[]'::jsonb, new.incident_categories, 'incident_category');
  end if;

  perform public.validate_company_configuration_items(new.working_hours, case when tg_op = 'UPDATE' then old.working_hours else '[]'::jsonb end, 'shift');
  perform public.validate_company_configuration_items(new.departments, case when tg_op = 'UPDATE' then old.departments else '[]'::jsonb end, 'department');
  perform public.validate_company_configuration_items(new.operational_sites, case when tg_op = 'UPDATE' then old.operational_sites else '[]'::jsonb end, 'site');
  perform public.validate_company_configuration_items(new.severity_levels, case when tg_op = 'UPDATE' then old.severity_levels else '[]'::jsonb end, 'severity');
  perform public.validate_company_configuration_items(new.incident_categories, case when tg_op = 'UPDATE' then old.incident_categories else '[]'::jsonb end, 'incident_category');

  return new;
end;
$$;

drop trigger if exists company_settings_configuration_archive_guard on public.company_settings;
create trigger company_settings_configuration_archive_guard
before insert or update of working_hours, departments, operational_sites, severity_levels, incident_categories
on public.company_settings
for each row execute function public.guard_company_configuration_updates();

create or replace function public.guard_duplicate_site_names()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text || ':site-name', 736249));
  if exists (
    select 1
    from public.sites existing
    where existing.organization_id = new.organization_id
      and existing.id <> new.id
      and lower(btrim(existing.name)) = lower(btrim(new.name))
  ) then
    raise exception 'duplicate_site_name' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists sites_prevent_duplicate_organization_names on public.sites;
create trigger sites_prevent_duplicate_organization_names
before insert or update of organization_id, name on public.sites
for each row execute function public.guard_duplicate_site_names();

create or replace function public.normalize_company_configuration_archive_activity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.activity = 'Company configuration item deleted'
    and new.metadata->>'action' = 'delete' then
    if exists (
      select 1
      from public.activity_logs existing
      where existing.organization_id = new.organization_id
        and existing.metadata->>'action' = 'ARCHIVE'
        and existing.metadata->>'category' = new.metadata->>'category'
        and existing.metadata->>'item_id' = new.metadata->>'item_id'
    ) then
      return null;
    end if;
    new.activity := 'Company configuration item archived';
    new.metadata := jsonb_set(new.metadata, '{action}', '"ARCHIVE"'::jsonb, true);
  end if;
  return new;
end;
$$;

drop trigger if exists activity_logs_normalize_company_configuration_archive on public.activity_logs;
create trigger activity_logs_normalize_company_configuration_archive
before insert on public.activity_logs
for each row execute function public.normalize_company_configuration_archive_activity();

create or replace function public.list_company_configuration_archive(p_organization_id uuid)
returns table (
  item_id text,
  item_name text,
  item_category text,
  archived_at timestamptz,
  archived_by text,
  item jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.has_org_role(
    p_organization_id,
    array['Super Administrator', 'Organization Administrator']::public.membership_role[]
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
  select
    public.company_configuration_item_id(entry.value, config.category),
    public.company_configuration_item_name(entry.value),
    config.category,
    coalesce(audit.created_at, cs.updated_at),
    coalesce(profile.full_name, 'Unknown administrator'),
    entry.value
  from public.company_settings cs
  cross join lateral (values
    ('site'::text, cs.operational_sites),
    ('department'::text, cs.departments),
    ('shift'::text, cs.working_hours),
    ('severity'::text, cs.severity_levels),
    ('incident_category'::text, cs.incident_categories)
  ) as config(category, setting_value)
  cross join lateral jsonb_array_elements(public.company_configuration_items(config.setting_value, config.category)) as entry(value)
  left join lateral (
    select log.created_at, log.user_id
    from public.activity_logs log
    where log.organization_id = cs.organization_id
      and log.metadata->>'category' = config.category
      and log.metadata->>'item_id' = public.company_configuration_item_id(entry.value, config.category)
      and log.metadata->>'action' in ('ARCHIVE', 'delete')
    order by log.created_at desc
    limit 1
  ) audit on true
  left join public.profiles profile
    on profile.id = audit.user_id
    and profile.organization_id = cs.organization_id
  where cs.organization_id = p_organization_id
    and coalesce(entry.value->>'deleted', 'false') = 'true'
  order by coalesce(audit.created_at, cs.updated_at) desc, config.category, public.company_configuration_item_name(entry.value);
end;
$$;

create or replace function public.find_company_configuration_archive_match(
  p_organization_id uuid,
  p_category text,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  archived_item jsonb;
  archived_id text;
  archived_name text;
  archive_count integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_category is null or p_category not in ('site', 'department', 'shift', 'severity', 'incident_category')
    or nullif(btrim(p_name), '') is null then
    raise exception 'invalid_configuration_item' using errcode = '22023';
  end if;
  if not public.has_org_role(
    p_organization_id,
    array['Super Administrator', 'Organization Administrator']::public.membership_role[]
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select case p_category
    when 'site' then operational_sites
    when 'department' then departments
    when 'shift' then working_hours
    when 'severity' then severity_levels
    else incident_categories
  end
  into archived_item
  from public.company_settings
  where organization_id = p_organization_id;

  for archived_item in
    select entry.value
    from jsonb_array_elements(public.company_configuration_items(archived_item, p_category)) as entry(value)
    where coalesce(entry.value->>'deleted', 'false') = 'true'
      and lower(btrim(coalesce(public.company_configuration_item_name(entry.value), ''))) = lower(btrim(p_name))
  loop
    archive_count := archive_count + 1;
    archived_id := public.company_configuration_item_id(archived_item, p_category);
    archived_name := public.company_configuration_item_name(archived_item);
  end loop;

  if archive_count > 1 then
    raise exception 'multiple_archived_items_match' using errcode = '23505';
  end if;
  if archive_count = 0 then
    return null;
  end if;

  return jsonb_build_object(
    'id', archived_id,
    'name', archived_name,
    'category', p_category,
    'item', archived_item
  );
end;
$$;

create or replace function public.restore_company_configuration_item(
  p_organization_id uuid,
  p_category text,
  p_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := (select auth.uid());
  company_config public.company_settings;
  setting_value jsonb;
  setting_items jsonb;
  updated_items jsonb := '[]'::jsonb;
  updated_value jsonb;
  config_item jsonb;
  restored_item jsonb;
  item_name text;
  item_id text;
  found_item boolean := false;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_category is null or p_category not in ('site', 'department', 'shift', 'severity', 'incident_category')
    or nullif(btrim(p_item_id), '') is null then
    raise exception 'invalid_configuration_item' using errcode = '22023';
  end if;
  if not public.has_org_role(
    p_organization_id,
    array['Super Administrator', 'Organization Administrator']::public.membership_role[]
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into company_config
  from public.company_settings
  where organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'configuration_not_found' using errcode = 'P0002';
  end if;

  setting_value := case p_category
    when 'site' then company_config.operational_sites
    when 'department' then company_config.departments
    when 'shift' then company_config.working_hours
    when 'severity' then company_config.severity_levels
    else company_config.incident_categories
  end;
  setting_items := public.company_configuration_items(setting_value, p_category);

  for config_item in select value from jsonb_array_elements(setting_items)
  loop
    item_id := public.company_configuration_item_id(config_item, p_category);
    if item_id = p_item_id then
      if coalesce(config_item->>'deleted', 'false') <> 'true' then
        raise exception 'item_not_archived' using errcode = 'P0001';
      end if;
      item_name := public.company_configuration_item_name(config_item);
      restored_item := jsonb_set(config_item, '{deleted}', 'false'::jsonb, true);
      found_item := true;
      updated_items := updated_items || jsonb_build_array(restored_item);
    else
      updated_items := updated_items || jsonb_build_array(config_item);
    end if;
  end loop;

  if not found_item then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;

  updated_value := public.company_configuration_with_items(setting_value, p_category, updated_items);
  perform set_config('app.company_configuration_restore_id', p_item_id, true);
  perform set_config('app.company_configuration_restore_category', p_category, true);

  update public.company_settings
  set working_hours = case when p_category = 'shift' then updated_value else working_hours end,
      departments = case when p_category = 'department' then updated_value else departments end,
      operational_sites = case when p_category = 'site' then updated_value else operational_sites end,
      severity_levels = case when p_category = 'severity' then updated_value else severity_levels end,
      incident_categories = case when p_category = 'incident_category' then updated_value else incident_categories end,
      updated_at = now()
  where organization_id = p_organization_id;

  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  values (
    p_organization_id,
    current_user_id,
    'Company configuration item restored',
    jsonb_build_object(
      'action', 'RESTORE',
      'category', p_category,
      'item_id', p_item_id,
      'item_name', item_name
    )
  );

  return jsonb_build_object(
    'id', p_item_id,
    'name', item_name,
    'category', p_category,
    'item', restored_item
  );
end;
$$;

revoke all on function public.company_configuration_items(jsonb, text) from public, anon, authenticated;
revoke all on function public.company_configuration_item_name(jsonb) from public, anon, authenticated;
revoke all on function public.company_configuration_item_id(jsonb, text) from public, anon, authenticated;
revoke all on function public.company_configuration_with_items(jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.company_configuration_merge_existing(jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.validate_company_configuration_items(jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.log_company_configuration_archive_transitions(uuid, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.guard_company_configuration_updates() from public, anon, authenticated;
revoke all on function public.guard_duplicate_site_names() from public, anon, authenticated;
revoke all on function public.normalize_company_configuration_archive_activity() from public, anon, authenticated;
revoke all on function public.list_company_configuration_archive(uuid) from public, anon;
revoke all on function public.find_company_configuration_archive_match(uuid, text, text) from public, anon;
revoke all on function public.restore_company_configuration_item(uuid, text, text) from public, anon;

grant execute on function public.list_company_configuration_archive(uuid) to authenticated;
grant execute on function public.find_company_configuration_archive_match(uuid, text, text) to authenticated;
grant execute on function public.restore_company_configuration_item(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
