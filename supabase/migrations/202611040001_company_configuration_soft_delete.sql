create or replace function public.company_setting_has_active_name(setting_value jsonb, target_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with configured_items as (
    select case
      when jsonb_typeof(setting_value) = 'array' then setting_value
      when jsonb_typeof(setting_value) = 'object' then coalesce(
        case when jsonb_typeof(setting_value->'items') = 'array' then setting_value->'items' end,
        case when jsonb_typeof(setting_value->'shifts') = 'array' then setting_value->'shifts' end,
        case when jsonb_typeof(setting_value->'departments') = 'array' then setting_value->'departments' end,
        case when jsonb_typeof(setting_value->'sites') = 'array' then setting_value->'sites' end,
        case when jsonb_typeof(setting_value->'operational_sites') = 'array' then setting_value->'operational_sites' end,
        case when jsonb_typeof(setting_value->'levels') = 'array' then setting_value->'levels' end,
        case when jsonb_typeof(setting_value->'severity_levels') = 'array' then setting_value->'severity_levels' end,
        case when jsonb_typeof(setting_value->'categories') = 'array' then setting_value->'categories' end,
        case when jsonb_typeof(setting_value->'incident_categories') = 'array' then setting_value->'incident_categories' end
      )
    end as items
  )
  select case
    when items is null or items = '[]'::jsonb then true
    else exists (
      select 1
      from jsonb_array_elements(items) as item
      where lower(btrim(coalesce(
        case when jsonb_typeof(item) = 'string' then item #>> '{}' else item->>'name' end,
        ''
      ))) = lower(btrim(target_name))
        and coalesce(item->>'active', 'true') <> 'false'
        and coalesce(item->>'deleted', 'false') <> 'true'
    )
  end
  from configured_items;
$$;

create or replace function public.delete_company_setting_item(
  p_organization_id uuid,
  p_category text,
  p_item_id text,
  p_item_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := (select auth.uid());
  company_config public.company_settings;
  config_value jsonb;
  config_items jsonb;
  updated_items jsonb := '[]'::jsonb;
  updated_value jsonb;
  item jsonb;
  item_name text;
  item_id text;
  setting_column text;
  wrapper_key text;
  wrapper_keys text[];
  item_path text[] := '{}'::text[];
  found_item boolean := false;
  default_items jsonb;
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_category is null or p_category not in ('shift', 'department', 'site', 'severity', 'incident_category') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;

  if nullif(btrim(p_item_id), '') is null or nullif(btrim(p_item_name), '') is null then
    raise exception 'invalid_item' using errcode = '22023';
  end if;

  if not public.has_org_role(
    p_organization_id,
    array['Super Administrator', 'Organization Administrator']::public.membership_role[]
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select *
  into company_config
  from public.company_settings
  where organization_id = p_organization_id
  for update;

  if not found then
    insert into public.company_settings (organization_id)
    values (p_organization_id)
    on conflict (organization_id) do nothing;
    select *
    into company_config
    from public.company_settings
    where organization_id = p_organization_id
    for update;
    if not found then
      raise exception 'configuration_not_found' using errcode = 'P0002';
    end if;
  end if;

  case p_category
    when 'shift' then
      setting_column := 'working_hours';
      config_value := company_config.working_hours;
      wrapper_keys := array['shifts'];
    when 'department' then
      setting_column := 'departments';
      config_value := company_config.departments;
      wrapper_keys := array['items', 'departments'];
    when 'site' then
      setting_column := 'operational_sites';
      config_value := company_config.operational_sites;
      wrapper_keys := array['items', 'sites', 'operational_sites'];
    when 'severity' then
      setting_column := 'severity_levels';
      config_value := company_config.severity_levels;
      wrapper_keys := array['items', 'levels', 'severity_levels'];
    else
      setting_column := 'incident_categories';
      config_value := company_config.incident_categories;
      wrapper_keys := array['items', 'categories', 'incident_categories'];
  end case;

  if p_category = 'shift' and jsonb_typeof(config_value) = 'object'
    and jsonb_typeof(config_value->'shifts') = 'array' then
    item_path := array['shifts'];
  elsif p_category = 'shift' and jsonb_typeof(config_value) = 'object' then
    item_path := array['shifts'];
  elsif jsonb_typeof(config_value) = 'object' then
    select candidate.key
    into wrapper_key
    from unnest(wrapper_keys) with ordinality as candidate(key, position)
    where jsonb_typeof(config_value->candidate.key) = 'array'
    order by candidate.position
    limit 1;
    if wrapper_key is not null then
      item_path := array[wrapper_key];
    end if;
  end if;

  config_items := case
    when cardinality(item_path) = 0 then config_value
    else config_value #> item_path
  end;

  if (config_items is null or config_items = '[]'::jsonb)
    and p_item_id like 'default:%' then
    case p_category
      when 'shift' then
        item_path := array['shifts'];
        default_items := jsonb_build_array(
          jsonb_build_object('id', 'default:shift:day', 'name', 'Day', 'start', '07:00', 'end', '19:00', 'active', true),
          jsonb_build_object('id', 'default:shift:night', 'name', 'Night', 'start', '19:00', 'end', '07:00', 'active', true)
        );
        config_value := jsonb_set(case when jsonb_typeof(config_value) = 'object' then config_value else '{}'::jsonb end, item_path, default_items, true);
      when 'department' then
        default_items := jsonb_build_array(
          jsonb_build_object('id', 'default:department:operations', 'name', 'Operations', 'active', true),
          jsonb_build_object('id', 'default:department:maintenance', 'name', 'Maintenance', 'active', true),
          jsonb_build_object('id', 'default:department:hse', 'name', 'HSE', 'active', true),
          jsonb_build_object('id', 'default:department:security', 'name', 'Security', 'active', true),
          jsonb_build_object('id', 'default:department:logistics', 'name', 'Logistics', 'active', true),
          jsonb_build_object('id', 'default:department:procurement', 'name', 'Procurement', 'active', true),
          jsonb_build_object('id', 'default:department:admin', 'name', 'Admin', 'active', true)
        );
        if cardinality(item_path) > 0 then
          config_value := jsonb_set(config_value, item_path, default_items, true);
        else
          config_value := default_items;
        end if;
      when 'severity' then
        default_items := jsonb_build_array(
          jsonb_build_object('id', 'default:severity:low', 'name', 'Low', 'active', true),
          jsonb_build_object('id', 'default:severity:medium', 'name', 'Medium', 'active', true),
          jsonb_build_object('id', 'default:severity:high', 'name', 'High', 'active', true),
          jsonb_build_object('id', 'default:severity:critical', 'name', 'Critical', 'active', true)
        );
        if cardinality(item_path) > 0 then
          config_value := jsonb_set(config_value, item_path, default_items, true);
        else
          config_value := default_items;
        end if;
      when 'incident_category' then
        default_items := jsonb_build_array(
          jsonb_build_object('id', 'default:incident_category:near miss', 'name', 'Near Miss', 'active', true),
          jsonb_build_object('id', 'default:incident_category:unsafe condition', 'name', 'Unsafe Condition', 'active', true),
          jsonb_build_object('id', 'default:incident_category:unsafe act', 'name', 'Unsafe Act', 'active', true),
          jsonb_build_object('id', 'default:incident_category:environmental incident', 'name', 'Environmental Incident', 'active', true),
          jsonb_build_object('id', 'default:incident_category:slip/trip/fall', 'name', 'Slip/Trip/Fall', 'active', true)
        );
        if cardinality(item_path) > 0 then
          config_value := jsonb_set(config_value, item_path, default_items, true);
        else
          config_value := default_items;
        end if;
      else
        raise exception 'item_not_found' using errcode = 'P0002';
    end case;
    config_items := default_items;
  end if;

  if config_items is null or jsonb_typeof(config_items) <> 'array' then
    raise exception 'configuration_invalid' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(config_items)
  loop
    item_name := case
      when jsonb_typeof(item) = 'string' then item #>> '{}'
      else item->>'name'
    end;
    item_id := coalesce(nullif(btrim(item->>'id'), ''), 'legacy:' || p_category || ':' || lower(btrim(coalesce(item_name, ''))));

    if item_id = p_item_id
      and regexp_replace(lower(btrim(coalesce(item_name, ''))), '[^[:alnum:]]', '', 'g')
        = regexp_replace(lower(btrim(p_item_name)), '[^[:alnum:]]', '', 'g') then
      if coalesce(item->>'deleted', 'false') = 'true' then
        raise exception 'item_already_deleted' using errcode = 'P0001';
      end if;
      found_item := true;
      if jsonb_typeof(item) = 'object' then
        updated_items := updated_items || jsonb_build_array(
          jsonb_set(jsonb_set(item, '{id}', to_jsonb(p_item_id), true), '{deleted}', 'true'::jsonb, true)
        );
      else
        updated_items := updated_items || jsonb_build_array(jsonb_build_object(
          'id', p_item_id,
          'name', item_name,
          'active', true,
          'deleted', true
        ));
      end if;
    else
      updated_items := updated_items || jsonb_build_array(item);
    end if;
  end loop;

  if not found_item then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;

  updated_value := case
    when cardinality(item_path) = 0 then updated_items
    else jsonb_set(config_value, item_path, updated_items, true)
  end;

  update public.company_settings
  set working_hours = case when setting_column = 'working_hours' then updated_value else working_hours end,
      departments = case when setting_column = 'departments' then updated_value else departments end,
      operational_sites = case when setting_column = 'operational_sites' then updated_value else operational_sites end,
      severity_levels = case when setting_column = 'severity_levels' then updated_value else severity_levels end,
      incident_categories = case when setting_column = 'incident_categories' then updated_value else incident_categories end,
      updated_at = now()
  where organization_id = p_organization_id;

  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  values (
    p_organization_id,
    current_user_id,
    'Company configuration item deleted',
    jsonb_build_object(
      'action', 'delete',
      'category', p_category,
      'item_id', p_item_id,
      'item_name', item_name
    )
  );

  return jsonb_build_object('id', p_item_id, 'name', item_name, 'category', p_category);
end;
$$;

revoke all on function public.delete_company_setting_item(uuid, text, text, text) from public, anon;
grant execute on function public.delete_company_setting_item(uuid, text, text, text) to authenticated;

create or replace function public.validate_active_configured_site()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  site_name text;
  configured_sites jsonb;
begin
  if new.site_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.organization_id is not distinct from old.organization_id
    and new.site_id is not distinct from old.site_id then
    return new;
  end if;

  select name
  into site_name
  from public.sites
  where id = new.site_id
    and organization_id = new.organization_id;

  if site_name is null then
    raise exception 'The selected site is not active for this organization.';
  end if;

  select operational_sites
  into configured_sites
  from public.company_settings
  where organization_id = new.organization_id;

  if not public.company_setting_has_active_name(configured_sites, site_name) then
    raise exception 'The selected site is not active for this organization.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_active_configured_site() from public, anon, authenticated;

drop trigger if exists inspections_validate_active_configured_site on public.inspections;
create trigger inspections_validate_active_configured_site
before insert or update of organization_id, site_id on public.inspections
for each row execute function public.validate_active_configured_site();

drop trigger if exists actions_validate_active_configured_site on public.actions;
create trigger actions_validate_active_configured_site
before insert or update of organization_id, site_id on public.actions
for each row execute function public.validate_active_configured_site();

drop trigger if exists knowledge_versions_validate_active_site on public.knowledge_document_versions;
create trigger knowledge_versions_validate_active_site
before insert or update of organization_id, site_id on public.knowledge_document_versions
for each row execute function public.validate_active_configured_site();

create or replace function public.validate_incident_company_configuration()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  configured_settings public.company_settings;
  configured_site_name text;
  allow_unchanged_existing_value boolean := false;
  previous_site_id uuid;
  previous_department text;
  previous_shift text;
  previous_severity text;
  previous_potential_severity text;
  previous_incident_category text;
begin
  if tg_op = 'UPDATE' then
    allow_unchanged_existing_value := true;
    previous_site_id := old.site_id;
    previous_department := old.department;
    previous_shift := old.shift;
    previous_severity := old.severity;
    previous_potential_severity := old.potential_severity;
    previous_incident_category := old.incident_category;
  end if;

  select * into configured_settings
  from public.company_settings
  where organization_id = new.organization_id;

  if new.status = 'submitted' then
    if nullif(btrim(new.site_id::text), '') is null
      or nullif(btrim(new.severity), '') is null
      or nullif(btrim(new.incident_category), '') is null then
      raise exception 'Submitted incidents require a configured site, severity, and incident category.';
    end if;
  end if;

  if new.site_id is not null then
    select name into configured_site_name
    from public.sites
    where id = new.site_id and organization_id = new.organization_id;

    if configured_site_name is null
      or (not public.company_setting_has_active_name(configured_settings.operational_sites, configured_site_name)
        and not (allow_unchanged_existing_value and new.site_id is not distinct from previous_site_id)) then
      raise exception 'The selected site is not active for this organization.';
    end if;
  end if;

  if nullif(btrim(new.department), '') is not null
    and not public.company_setting_has_active_name(configured_settings.departments, new.department)
    and not (allow_unchanged_existing_value and new.department is not distinct from previous_department) then
    raise exception 'The selected department is not active for this organization.';
  end if;

  if nullif(btrim(new.shift), '') is not null
    and not public.company_setting_has_active_name(configured_settings.working_hours->'shifts', new.shift)
    and not (allow_unchanged_existing_value and new.shift is not distinct from previous_shift) then
    raise exception 'The selected shift is not active for this organization.';
  end if;

  if nullif(btrim(new.severity), '') is not null
    and not public.company_setting_has_active_name(configured_settings.severity_levels, new.severity)
    and not (allow_unchanged_existing_value and new.severity is not distinct from previous_severity) then
    raise exception 'The selected severity is not active for this organization.';
  end if;

  if nullif(btrim(new.potential_severity), '') is not null
    and not public.company_setting_has_active_name(configured_settings.severity_levels, new.potential_severity)
    and not (allow_unchanged_existing_value and new.potential_severity is not distinct from previous_potential_severity) then
    raise exception 'The selected potential severity is not active for this organization.';
  end if;

  if nullif(btrim(new.incident_category), '') is not null
    and not public.company_setting_has_active_name(configured_settings.incident_categories, new.incident_category)
    and not (allow_unchanged_existing_value and new.incident_category is not distinct from previous_incident_category) then
    raise exception 'The selected incident category is not active for this organization.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_incident_company_configuration() from public, anon, authenticated;

notify pgrst, 'reload schema';
