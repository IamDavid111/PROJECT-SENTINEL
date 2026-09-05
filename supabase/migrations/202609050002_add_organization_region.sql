alter table public.organizations
add column if not exists region text;

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
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if exists (select 1 from public.profiles where id = current_user_id) then
    raise exception 'User already belongs to an organization';
  end if;

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
    trim(organization_data->>'contact_phone')
  )
  returning * into created_organization;

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
