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
        ]::text[])
        or incident.created_by = (select auth.uid())
        or incident.reported_by = (select auth.uid())
      )
  );
$$;

revoke all on function public.can_view_incident(uuid, uuid) from public, anon;
grant execute on function public.can_view_incident(uuid, uuid) to authenticated;
