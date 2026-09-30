-- Reconstructed from deployed PostgreSQL definitions on 2026-09-30.
-- The linked migration ledger did not retain the original migration body.
create or replace function public.company_setting_has_active_name(setting_value jsonb, target_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when setting_value is null then true
    when jsonb_typeof(setting_value) <> 'array' then true
    when jsonb_array_length(setting_value) = 0 then true
    else exists (
      select 1
      from jsonb_array_elements(setting_value) as item
      where lower(btrim(coalesce(
        case when jsonb_typeof(item) = 'string' then item #>> '{}' else item->>'name' end,
        ''
      ))) = lower(btrim(target_name))
        and coalesce(item->>'active', 'true') <> 'false'
    )
  end;
$$;

create or replace function public.validate_incident_company_configuration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  configured_settings public.company_settings;
  configured_site_name text;
  allow_unchanged_draft_value boolean := false;
  previous_site_id uuid;
  previous_department text;
  previous_shift text;
  previous_severity text;
  previous_potential_severity text;
  previous_incident_category text;
begin
  if tg_op = 'UPDATE' then
    allow_unchanged_draft_value := old.status = 'draft' and new.status = 'draft';
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
    where id = new.site_id
      and organization_id = new.organization_id;

    if configured_site_name is null
      or (
        not public.company_setting_has_active_name(configured_settings.operational_sites, configured_site_name)
        and not (allow_unchanged_draft_value and new.site_id is not distinct from previous_site_id)
      ) then
      raise exception 'The selected site is not active for this organization.';
    end if;
  end if;

  if nullif(btrim(new.department), '') is not null
    and not public.company_setting_has_active_name(configured_settings.departments, new.department)
    and not (allow_unchanged_draft_value and new.department is not distinct from previous_department) then
    raise exception 'The selected department is not active for this organization.';
  end if;

  if nullif(btrim(new.shift), '') is not null
    and not public.company_setting_has_active_name(configured_settings.working_hours->'shifts', new.shift)
    and not (allow_unchanged_draft_value and new.shift is not distinct from previous_shift) then
    raise exception 'The selected shift is not active for this organization.';
  end if;

  if nullif(btrim(new.severity), '') is not null
    and not public.company_setting_has_active_name(configured_settings.severity_levels, new.severity)
    and not (allow_unchanged_draft_value and new.severity is not distinct from previous_severity) then
    raise exception 'The selected severity is not active for this organization.';
  end if;

  if nullif(btrim(new.potential_severity), '') is not null
    and not public.company_setting_has_active_name(configured_settings.severity_levels, new.potential_severity)
    and not (allow_unchanged_draft_value and new.potential_severity is not distinct from previous_potential_severity) then
    raise exception 'The selected potential severity is not active for this organization.';
  end if;

  if nullif(btrim(new.incident_category), '') is not null
    and not public.company_setting_has_active_name(configured_settings.incident_categories, new.incident_category)
    and not (allow_unchanged_draft_value and new.incident_category is not distinct from previous_incident_category) then
    raise exception 'The selected incident category is not active for this organization.';
  end if;

  return new;
end;
$$;