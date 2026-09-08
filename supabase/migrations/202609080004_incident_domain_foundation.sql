-- Prompt 3 Batch 2: incident and near-miss domain foundation.
-- This migration intentionally does not create investigation or corrective-action tables.

create type public.incident_report_type as enum (
  'incident',
  'near_miss',
  'unsafe_act',
  'unsafe_condition',
  'environmental_incident'
);

create type public.incident_status as enum (
  'draft',
  'submitted',
  'under_review',
  'closed'
);

create type public.incident_person_type as enum (
  'affected_person',
  'witness'
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  address text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (id, organization_id)
);

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  name text not null,
  code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (id, organization_id)
);

create table public.incident_sequences (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  next_value bigint not null default 1 check (next_value > 0),
  updated_at timestamptz not null default now()
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference_number text not null,
  report_type public.incident_report_type not null,
  status public.incident_status not null default 'draft',
  title text not null,
  description text,
  occurred_at timestamptz,
  reported_at timestamptz,
  site_id uuid,
  facility_id uuid,
  location text,
  department text,
  work_activity_context text,
  reported_by uuid not null references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  contractor_involved boolean not null default false,
  contractor_organization text,
  severity text,
  potential_severity text,
  incident_category text,
  environmental_impact boolean not null default false,
  injury_or_illness boolean not null default false,
  property_damage boolean not null default false,
  work_related boolean not null default true,
  immediate_correction text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint incidents_reference_per_organization unique (organization_id, reference_number),
  constraint incidents_id_organization_unique unique (id, organization_id),
  constraint incidents_site_same_organization foreign key (site_id, organization_id) references public.sites(id, organization_id) on delete restrict,
  constraint incidents_facility_same_organization foreign key (facility_id, organization_id) references public.facilities(id, organization_id) on delete restrict,
  constraint incidents_contractor_details check (contractor_involved or contractor_organization is null),
  constraint incidents_reported_at_after_occurrence check (reported_at is null or occurred_at is null or reported_at >= occurred_at)
);

create table public.incident_people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  incident_id uuid not null references public.incidents(id) on delete cascade,
  person_type public.incident_person_type not null,
  profile_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  organization_name text,
  contact_details text,
  created_at timestamptz not null default now(),
  constraint incident_people_incident_same_organization foreign key (incident_id, organization_id) references public.incidents(id, organization_id) on delete cascade
);

create table public.incident_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  incident_id uuid not null references public.incidents(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, storage_path),
  constraint incident_evidence_incident_same_organization foreign key (incident_id, organization_id) references public.incidents(id, organization_id) on delete cascade
);

create index sites_organization_id_idx on public.sites(organization_id);
create index facilities_organization_id_site_id_idx on public.facilities(organization_id, site_id);
create index incidents_organization_id_status_idx on public.incidents(organization_id, status);
create index incidents_organization_id_report_type_idx on public.incidents(organization_id, report_type);
create index incidents_organization_id_occurred_at_idx on public.incidents(organization_id, occurred_at desc);
create index incidents_organization_id_site_id_idx on public.incidents(organization_id, site_id);
create index incidents_organization_id_facility_id_idx on public.incidents(organization_id, facility_id);
create index incidents_organization_id_department_idx on public.incidents(organization_id, department);
create index incidents_organization_id_reference_number_idx on public.incidents(organization_id, reference_number);
create index incident_people_organization_id_incident_id_idx on public.incident_people(organization_id, incident_id);
create index incident_evidence_organization_id_incident_id_idx on public.incident_evidence(organization_id, incident_id);

create trigger sites_set_updated_at
before update on public.sites
for each row execute function public.set_updated_at();

create trigger facilities_set_updated_at
before update on public.facilities
for each row execute function public.set_updated_at();

create trigger incident_sequences_set_updated_at
before update on public.incident_sequences
for each row execute function public.set_updated_at();

create trigger incidents_set_updated_at
before update on public.incidents
for each row execute function public.set_updated_at();

create or replace function public.next_incident_reference(target_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  allocated_value bigint;
begin
  insert into public.incident_sequences (organization_id, next_value)
  values (target_organization_id, 2)
  on conflict (organization_id) do nothing;

  update public.incident_sequences
  set next_value = next_value + 1
  where organization_id = target_organization_id
  returning next_value - 1 into allocated_value;

  return format('INC-%s-%s', to_char(current_date, 'YYYY'), lpad(allocated_value::text, 6, '0'));
end;
$$;

create or replace function public.assign_incident_reference()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.reference_number is null or btrim(new.reference_number) = '' then
    new.reference_number := public.next_incident_reference(new.organization_id);
  end if;
  return new;
end;
$$;

create trigger incidents_assign_reference
before insert on public.incidents
for each row execute function public.assign_incident_reference();

revoke all on function public.next_incident_reference(uuid) from public, anon, authenticated;
revoke all on function public.assign_incident_reference() from public, anon, authenticated;

grant select, insert, update, delete on public.sites to authenticated;
grant select, insert, update, delete on public.facilities to authenticated;
grant select, insert, update, delete on public.incidents to authenticated;
grant select, insert, update, delete on public.incident_people to authenticated;
grant select, insert, update, delete on public.incident_evidence to authenticated;

alter table public.sites enable row level security;
alter table public.facilities enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_people enable row level security;
alter table public.incident_evidence enable row level security;
alter table public.incident_sequences enable row level security;

create policy sites_select_member on public.sites
for select to authenticated using (public.is_org_member(organization_id));

create policy sites_manage_admin on public.sites
for all to authenticated
using (public.has_org_role(organization_id, array['Super Administrator', 'Organization Administrator']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['Super Administrator', 'Organization Administrator']::public.membership_role[]));

create policy facilities_select_member on public.facilities
for select to authenticated using (public.is_org_member(organization_id));

create policy facilities_manage_admin on public.facilities
for all to authenticated
using (public.has_org_role(organization_id, array['Super Administrator', 'Organization Administrator']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['Super Administrator', 'Organization Administrator']::public.membership_role[]));

create policy incidents_select_member on public.incidents
for select to authenticated using (public.is_org_member(organization_id));

create policy incidents_insert_member on public.incidents
for insert to authenticated
with check (
  public.is_org_member(organization_id)
  and reported_by = (select auth.uid())
  and created_by = (select auth.uid())
);

create policy incidents_update_owner_or_manager on public.incidents
for update to authenticated
using (
  public.is_org_member(organization_id)
  and (
    (created_by = (select auth.uid()) and status = 'draft')
    or public.has_org_role(organization_id, array['Super Administrator', 'Organization Administrator', 'QHSE Manager', 'Safety Officer / HSE Officer', 'Site Supervisor']::public.membership_role[])
  )
)
with check (public.is_org_member(organization_id));

create policy incidents_delete_draft_owner_or_admin on public.incidents
for delete to authenticated
using (
  public.is_org_member(organization_id)
  and (
    (created_by = (select auth.uid()) and status = 'draft')
    or public.has_org_role(organization_id, array['Super Administrator', 'Organization Administrator']::public.membership_role[])
  )
);

create policy incident_people_select_member on public.incident_people
for select to authenticated using (public.is_org_member(organization_id));

create policy incident_people_manage_authorized on public.incident_people
for all to authenticated
using (
  public.is_org_member(organization_id)
  and public.has_org_role(organization_id, array['Super Administrator', 'Organization Administrator', 'QHSE Manager', 'Safety Officer / HSE Officer', 'Site Supervisor']::public.membership_role[])
)
with check (
  public.is_org_member(organization_id)
  and public.has_org_role(organization_id, array['Super Administrator', 'Organization Administrator', 'QHSE Manager', 'Safety Officer / HSE Officer', 'Site Supervisor']::public.membership_role[])
);

create policy incident_evidence_select_member on public.incident_evidence
for select to authenticated using (public.is_org_member(organization_id));

create policy incident_evidence_insert_authorized on public.incident_evidence
for insert to authenticated
with check (
  public.is_org_member(organization_id)
  and uploaded_by = (select auth.uid())
);

create policy incident_evidence_delete_owner_or_manager on public.incident_evidence
for delete to authenticated
using (
  public.is_org_member(organization_id)
  and (
    uploaded_by = (select auth.uid())
    or public.has_org_role(organization_id, array['Super Administrator', 'Organization Administrator', 'QHSE Manager', 'Safety Officer / HSE Officer']::public.membership_role[])
  )
);

insert into storage.buckets (id, name, public)
values ('incident-evidence', 'incident-evidence', false)
on conflict (id) do nothing;

create policy incident_evidence_storage_select_member on storage.objects
for select to authenticated
using (
  bucket_id = 'incident-evidence'
  and public.is_org_member((storage.foldername(name))[1]::uuid)
);

create policy incident_evidence_storage_insert_member on storage.objects
for insert to authenticated
with check (
  bucket_id = 'incident-evidence'
  and public.is_org_member((storage.foldername(name))[1]::uuid)
  and (storage.foldername(name))[3]::uuid = (select auth.uid())
);

create policy incident_evidence_storage_delete_owner_or_manager on storage.objects
for delete to authenticated
using (
  bucket_id = 'incident-evidence'
  and public.is_org_member((storage.foldername(name))[1]::uuid)
  and (
    (storage.foldername(name))[3]::uuid = (select auth.uid())
    or public.has_org_role((storage.foldername(name))[1]::uuid, array['Super Administrator', 'Organization Administrator', 'QHSE Manager', 'Safety Officer / HSE Officer']::public.membership_role[])
  )
);
