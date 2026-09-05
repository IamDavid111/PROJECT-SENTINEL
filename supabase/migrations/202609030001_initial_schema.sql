create extension if not exists pgcrypto;

create type public.account_status as enum ('active', 'suspended', 'pending', 'inactive');
create type public.membership_role as enum (
  'Super Administrator',
  'Organization Administrator',
  'QHSE Manager',
  'Site Supervisor',
  'Safety Officer / HSE Officer',
  'Auditor',
  'Maintenance Engineer',
  'Field Worker',
  'Contractor',
  'Executive / Management'
);
create type public.employment_type as enum ('employee', 'contractor', 'temporary', 'consultant');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  company_code text not null unique check (company_code = upper(company_code)),
  company_name text not null,
  logo_url text,
  industry text not null,
  company_registration_number text,
  company_type text,
  company_size text not null,
  country text not null,
  state text not null,
  address text,
  contact_email text not null,
  contact_phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_id text,
  full_name text not null,
  department text,
  job_title text,
  phone text,
  emergency_contact text,
  site_location text,
  supervisor text,
  certification_status text,
  employment_type public.employment_type not null default 'employee',
  account_status public.account_status not null default 'pending',
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role public.membership_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email boolean not null default true,
  sms boolean not null default false,
  push boolean not null default true,
  incident_assignments boolean not null default true,
  corrective_action_reminders boolean not null default true,
  audit_reminders boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  activity text not null,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  location text,
  created_at timestamptz not null default now()
);

create table public.company_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  working_hours jsonb not null default '{}'::jsonb,
  departments jsonb not null default '[]'::jsonb,
  operational_sites jsonb not null default '[]'::jsonb,
  emergency_contacts jsonb not null default '[]'::jsonb,
  incident_categories jsonb not null default '[]'::jsonb,
  risk_categories jsonb not null default '[]'::jsonb,
  severity_levels jsonb not null default '[]'::jsonb,
  inspection_templates jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index memberships_user_id_idx on public.memberships(user_id);
create index memberships_organization_id_idx on public.memberships(organization_id);
create index profiles_organization_id_idx on public.profiles(organization_id);
create index activity_logs_organization_id_created_at_idx on public.activity_logs(organization_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

create trigger company_settings_set_updated_at
before update on public.company_settings
for each row execute function public.set_updated_at();

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = (select auth.uid())
      and organization_id = target_organization_id
  );
$$;

create or replace function public.has_org_role(target_organization_id uuid, allowed_roles public.membership_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = (select auth.uid())
      and organization_id = target_organization_id
      and role = any(allowed_roles)
  );
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

revoke all on function public.create_organization_with_owner(jsonb, text) from public;
grant execute on function public.create_organization_with_owner(jsonb, text) to authenticated;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.activity_logs enable row level security;
alter table public.company_settings enable row level security;

create policy organizations_select_member on public.organizations
for select to authenticated using (public.is_org_member(id));

create policy organizations_update_admin on public.organizations
for update to authenticated using (public.has_org_role(id, array['Super Administrator', 'Organization Administrator']::public.membership_role[]))
with check (public.has_org_role(id, array['Super Administrator', 'Organization Administrator']::public.membership_role[]));

create policy profiles_select_member on public.profiles
for select to authenticated using (public.is_org_member(organization_id));

create policy profiles_update_self_or_admin on public.profiles
for update to authenticated using (
  id = (select auth.uid())
  or public.has_org_role(organization_id, array['Super Administrator', 'Organization Administrator']::public.membership_role[])
) with check (public.is_org_member(organization_id));

create policy memberships_select_member on public.memberships
for select to authenticated using (public.is_org_member(organization_id));

create policy memberships_manage_admin on public.memberships
for all to authenticated using (public.has_org_role(organization_id, array['Super Administrator', 'Organization Administrator']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['Super Administrator', 'Organization Administrator']::public.membership_role[]));

create policy notification_preferences_self on public.notification_preferences
for all to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy activity_logs_select_member on public.activity_logs
for select to authenticated using (organization_id is null or public.is_org_member(organization_id));

create policy activity_logs_insert_member on public.activity_logs
for insert to authenticated with check (
  user_id = (select auth.uid())
  and (organization_id is null or public.is_org_member(organization_id))
);

create policy company_settings_select_member on public.company_settings
for select to authenticated using (public.is_org_member(organization_id));

create policy company_settings_manage_admin on public.company_settings
for all to authenticated using (public.has_org_role(organization_id, array['Super Administrator', 'Organization Administrator']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['Super Administrator', 'Organization Administrator']::public.membership_role[]));

insert into storage.buckets (id, name, public)
values ('organization-assets', 'organization-assets', false)
on conflict (id) do nothing;

create policy organization_assets_read_member on storage.objects
for select to authenticated using (
  bucket_id = 'organization-assets'
  and public.is_org_member((storage.foldername(name))[1]::uuid)
);

create policy organization_assets_upload_admin on storage.objects
for insert to authenticated with check (
  bucket_id = 'organization-assets'
  and public.has_org_role((storage.foldername(name))[1]::uuid, array['Super Administrator', 'Organization Administrator']::public.membership_role[])
);

create policy organization_assets_update_admin on storage.objects
for update to authenticated using (
  bucket_id = 'organization-assets'
  and public.has_org_role((storage.foldername(name))[1]::uuid, array['Super Administrator', 'Organization Administrator']::public.membership_role[])
);

create policy organization_assets_delete_admin on storage.objects
for delete to authenticated using (
  bucket_id = 'organization-assets'
  and public.has_org_role((storage.foldername(name))[1]::uuid, array['Super Administrator', 'Organization Administrator']::public.membership_role[])
);
