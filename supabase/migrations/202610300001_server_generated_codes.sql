-- Server-generated, uniqueness-safe organization and site codes.
--
-- Company codes are generated from a global sequence and retried until unused.
-- Site codes are generated from a global sequence and checked per organization.
-- Client forms display these values read-only and can request a new candidate.

create sequence if not exists public.organization_company_code_seq;
create sequence if not exists public.site_code_seq;

revoke all on sequence public.organization_company_code_seq from public, anon, authenticated;
revoke all on sequence public.site_code_seq from public, anon, authenticated;

create or replace function public.generate_company_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := 'SENT-' || lpad(upper(to_hex(nextval('public.organization_company_code_seq'))), 8, '0');
    exit when not exists (
      select 1 from public.organizations where company_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

revoke all on function public.generate_company_code() from public;
grant execute on function public.generate_company_code() to anon, authenticated;

create or replace function public.generate_site_code(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := 'SIT-' || lpad(upper(to_hex(nextval('public.site_code_seq'))), 8, '0');
    exit when not exists (
      select 1 from public.sites
      where organization_id = p_organization_id and code = candidate
    );
  end loop;
  return candidate;
end;
$$;

revoke all on function public.generate_site_code(uuid) from public;
grant execute on function public.generate_site_code(uuid) to authenticated;

create or replace function public.assign_site_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := public.generate_site_code(new.organization_id);
  end if;
  return new;
end;
$$;

drop trigger if exists sites_assign_code on public.sites;
create trigger sites_assign_code
before insert on public.sites
for each row execute function public.assign_site_code();

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
  current_user_id uuid := (select auth.uid());
  candidate_code text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if exists (select 1 from public.profiles where id = current_user_id) then
    raise exception 'User already belongs to an organization';
  end if;

  candidate_code := nullif(upper(trim(organization_data->>'company_code')), '');
  if candidate_code is null then
    candidate_code := public.generate_company_code();
  end if;

  loop
    begin
      insert into public.organizations (
        company_code,
        company_name,
        logo_url,
        industry,
        company_registration_number,
        company_type,
        company_size,
        region,
        country,
        state,
        address,
        contact_email,
        contact_phone
      )
      values (
        candidate_code,
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
        trim(organization_data->>'contact_phone')
      )
      returning * into created_organization;
      exit;
    exception when unique_violation then
      candidate_code := public.generate_company_code();
    end;
  end loop;

  insert into public.profiles (id, organization_id, full_name, account_status)
  values (current_user_id, created_organization.id, trim(owner_full_name), 'active');

  insert into public.memberships (user_id, organization_id, role)
  values (current_user_id, created_organization.id, 'Super Administrator');

  insert into public.notification_preferences (user_id)
  values (current_user_id);

  insert into public.company_settings (organization_id)
  values (created_organization.id);

  return created_organization;
end;
$$;

revoke all on function public.create_organization_with_owner(jsonb, text) from public;
grant execute on function public.create_organization_with_owner(jsonb, text) to authenticated;
