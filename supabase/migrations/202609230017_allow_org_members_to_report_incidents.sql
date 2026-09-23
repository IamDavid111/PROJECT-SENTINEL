create or replace function public.can_create_incident(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_org_member(target_organization_id);
$$;

revoke all on function public.can_create_incident(uuid) from public, anon;
grant execute on function public.can_create_incident(uuid) to authenticated;
