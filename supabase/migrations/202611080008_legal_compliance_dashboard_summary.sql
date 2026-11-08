create or replace function public.get_legal_compliance_obligation_summary(p_organization_id uuid)
returns table(total bigint, valid bigint, expiring_soon bigint, expired bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not (
    public.has_org_permission(p_organization_id, 'view_dashboard')
    or public.has_org_permission(p_organization_id, 'view_executive_analytics')
  ) then
    raise exception 'Not authorized to view organization compliance summary'
      using errcode = '42501';
  end if;

  return query
  select
    count(version.id),
    count(version.id) filter (
      where version.expiry_date is null or version.expiry_date > current_date + 30
    ),
    count(version.id) filter (
      where version.expiry_date between current_date and current_date + 30
    ),
    count(version.id) filter (
      where version.expiry_date < current_date
    )
  from public.legal_compliance_obligations obligation
  join public.legal_compliance_obligation_versions version
    on version.organization_id = obligation.organization_id
   and version.obligation_id = obligation.id
   and version.is_active
   and version.lifecycle_status = 'active'
  where obligation.organization_id = p_organization_id
    and obligation.deleted_at is null;
end;
$$;

revoke all on function public.get_legal_compliance_obligation_summary(uuid) from public, anon;
grant execute on function public.get_legal_compliance_obligation_summary(uuid) to authenticated;
