drop policy if exists activity_logs_select_member on public.activity_logs;
create policy activity_logs_select_member on public.activity_logs
for select to authenticated
using (organization_id is not null and public.is_org_member(organization_id));

drop policy if exists activity_logs_insert_member on public.activity_logs;
create policy activity_logs_insert_member on public.activity_logs
for insert to authenticated
with check (
  organization_id is not null
  and user_id = (select auth.uid())
  and public.is_org_member(organization_id)
);
