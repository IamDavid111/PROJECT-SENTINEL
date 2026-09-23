drop policy if exists incidents_insert_member on public.incidents;
drop policy if exists incidents_insert_reporter_role on public.incidents;

create policy incidents_insert_authenticated_member on public.incidents
for insert to authenticated
with check (
  reported_by = (select auth.uid())
  and created_by = (select auth.uid())
  and organization_id = (
    select profile.organization_id
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.organization_id is not null
  )
);
