-- Prompt 3 Batch 13: incident RBAC and tenant-isolation hardening.
-- These policies keep PostgreSQL RLS authoritative over frontend navigation.

create or replace function public.can_view_incident(
  target_organization_id uuid,
  target_incident_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.incidents incident
    where incident.id = target_incident_id
      and incident.organization_id = target_organization_id
      and public.is_org_member(target_organization_id)
      and (
        public.has_org_role(target_organization_id, array[
          'Super Administrator',
          'Organization Administrator',
          'QHSE Manager',
          'Site Supervisor',
          'Safety Officer / HSE Officer',
          'Auditor',
          'Executive / Management'
        ]::public.membership_role[])
        or incident.created_by = (select auth.uid())
        or incident.reported_by = (select auth.uid())
      )
  );
$$;

create or replace function public.can_create_incident(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_role(target_organization_id, array[
    'Super Administrator',
    'Organization Administrator',
    'QHSE Manager',
    'Site Supervisor',
    'Safety Officer / HSE Officer',
    'Maintenance Engineer',
    'Field Worker',
    'Contractor'
  ]::public.membership_role[]);
$$;

create or replace function public.can_manage_incident(target_organization_id uuid, target_incident_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.incidents incident
    where incident.id = target_incident_id
      and incident.organization_id = target_organization_id
      and public.is_org_member(target_organization_id)
      and (
        public.has_org_role(target_organization_id, array[
          'Super Administrator',
          'Organization Administrator',
          'QHSE Manager',
          'Safety Officer / HSE Officer',
          'Site Supervisor'
        ]::public.membership_role[])
        or (incident.created_by = (select auth.uid()) and incident.status = 'draft')
      )
  );
$$;

create or replace function public.enforce_incident_integrity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception 'Incident organization cannot be changed';
  end if;

  if new.status <> old.status
    and not public.has_org_role(old.organization_id, array[
      'Super Administrator',
      'Organization Administrator',
      'QHSE Manager',
      'Safety Officer / HSE Officer',
      'Site Supervisor'
    ]::public.membership_role[])
    and not (old.status = 'draft' and new.status = 'submitted' and old.created_by = (select auth.uid())) then
    raise exception 'You are not authorized to change this incident status';
  end if;

  return new;
end;
$$;

drop trigger if exists incidents_enforce_integrity on public.incidents;
create trigger incidents_enforce_integrity
before update on public.incidents
for each row execute function public.enforce_incident_integrity();

revoke all on function public.can_view_incident(uuid, uuid) from public, anon;
revoke all on function public.can_create_incident(uuid) from public, anon;
revoke all on function public.can_manage_incident(uuid, uuid) from public, anon;
grant execute on function public.can_view_incident(uuid, uuid) to authenticated;
grant execute on function public.can_create_incident(uuid) to authenticated;
grant execute on function public.can_manage_incident(uuid, uuid) to authenticated;

drop policy if exists incidents_select_member on public.incidents;
drop policy if exists incidents_insert_member on public.incidents;
drop policy if exists incidents_update_owner_or_manager on public.incidents;

create policy incidents_select_authorized on public.incidents
for select to authenticated
using (public.can_view_incident(organization_id, id));

create policy incidents_insert_reporter_role on public.incidents
for insert to authenticated
with check (
  public.can_create_incident(organization_id)
  and reported_by = (select auth.uid())
  and created_by = (select auth.uid())
);

create policy incidents_update_owner_draft_or_manager on public.incidents
for update to authenticated
using (
  public.can_manage_incident(organization_id, id)
)
with check (public.is_org_member(organization_id));

drop policy if exists incident_people_select_member on public.incident_people;
drop policy if exists incident_people_manage_authorized on public.incident_people;

create policy incident_people_select_authorized on public.incident_people
for select to authenticated
using (public.can_view_incident(organization_id, incident_id));

create policy incident_people_manage_authorized on public.incident_people
for all to authenticated
using (
  public.can_manage_incident(organization_id, incident_id)
)
with check (public.can_view_incident(organization_id, incident_id));

drop policy if exists incident_evidence_select_member on public.incident_evidence;
drop policy if exists incident_evidence_insert_authorized on public.incident_evidence;
drop policy if exists incident_evidence_delete_owner_or_manager on public.incident_evidence;

create policy incident_evidence_select_authorized on public.incident_evidence
for select to authenticated
using (public.can_view_incident(organization_id, incident_id));

create policy incident_evidence_insert_authorized on public.incident_evidence
for insert to authenticated
with check (
  public.can_manage_incident(organization_id, incident_id)
  and uploaded_by = (select auth.uid())
);

create policy incident_evidence_delete_authorized on public.incident_evidence
for delete to authenticated
using (
  public.can_view_incident(organization_id, incident_id)
  and (
    uploaded_by = (select auth.uid())
    or public.has_org_role(organization_id, array[
      'Super Administrator',
      'Organization Administrator',
      'QHSE Manager',
      'Safety Officer / HSE Officer'
    ]::public.membership_role[])
  )
);

drop policy if exists incident_evidence_storage_select_member on storage.objects;
drop policy if exists incident_evidence_storage_insert_member on storage.objects;
drop policy if exists incident_evidence_storage_delete_owner_or_manager on storage.objects;

create policy incident_evidence_storage_select_authorized on storage.objects
for select to authenticated
using (
  bucket_id = 'incident-evidence'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.can_view_incident((storage.foldername(name))[1]::uuid, (storage.foldername(name))[2]::uuid)
);

create policy incident_evidence_storage_insert_authorized on storage.objects
for insert to authenticated
with check (
  bucket_id = 'incident-evidence'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (storage.foldername(name))[3] = (select auth.uid())::text
  and public.can_view_incident((storage.foldername(name))[1]::uuid, (storage.foldername(name))[2]::uuid)
);

create policy incident_evidence_storage_delete_authorized on storage.objects
for delete to authenticated
using (
  bucket_id = 'incident-evidence'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.can_view_incident((storage.foldername(name))[1]::uuid, (storage.foldername(name))[2]::uuid)
  and (
    (storage.foldername(name))[3] = (select auth.uid())::text
    or public.has_org_role((storage.foldername(name))[1]::uuid, array[
      'Super Administrator',
      'Organization Administrator',
      'QHSE Manager',
      'Safety Officer / HSE Officer'
    ]::public.membership_role[])
  )
);
