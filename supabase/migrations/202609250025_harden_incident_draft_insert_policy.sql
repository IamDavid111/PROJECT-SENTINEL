drop policy if exists incidents_insert_authenticated_member on public.incidents;

create policy incidents_insert_authenticated_member on public.incidents
for insert to authenticated
with check (
  public.is_org_member(organization_id)
  and reported_by = (select auth.uid())
  and created_by = (select auth.uid())
);
