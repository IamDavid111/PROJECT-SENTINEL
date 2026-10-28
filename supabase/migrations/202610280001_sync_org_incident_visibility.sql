-- Make incident visibility organization-wide so every active member sees the
-- same dashboard figures.
--
-- Previously public.can_view_incident only let management-level roles (Super
-- Administrator, Organization Administrator, QHSE Manager, Site Supervisor,
-- Safety Officer / HSE Officer, Auditor, Executive / Management) see incidents
-- they did not create, so the dashboard silently showed a smaller subset to
-- everyone else. The intent is for all members of an organization to work from
-- the same numbers.
--
-- New rule: any active member of the organization can view any non-draft
-- incident. Drafts remain private to their creator. No other behaviour changes.

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
        incident.status <> 'draft'
        or incident.created_by = (select auth.uid())
      )
  );
$$;

revoke all on function public.can_view_incident(uuid, uuid) from public, anon;
grant execute on function public.can_view_incident(uuid, uuid) to authenticated;