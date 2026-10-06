begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(8);

-- The Super Administrator fixture and all permission edits disappear on rollback.
insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('bc000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'rbac-permissions@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.organizations(id, company_code, company_name, industry, company_size, country, state, contact_email, contact_phone)
values ('bd000000-0000-4000-8000-000000000001', 'RBAC_PERMISSIONS', 'RBAC Test',
  'Testing', '1-10', 'Nigeria', 'Lagos', 'rbac@example.com', '12345678');
insert into public.profiles(id, organization_id, full_name, account_status)
values ('bc000000-0000-4000-8000-000000000001', 'bd000000-0000-4000-8000-000000000001', 'RBAC Administrator', 'active');
insert into public.memberships(user_id, organization_id, role)
values ('bc000000-0000-4000-8000-000000000001', 'bd000000-0000-4000-8000-000000000001', 'Super Administrator');

select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select set_config('test.rbac_permission_role_id',
  (public.create_custom_role('bd000000-0000-4000-8000-000000000001',
    'RBAC Permission Test', null, '["view_users"]'::jsonb, '{}'::jsonb)).id::text, true);
select extensions.ok(
  (select permissions ? 'view_users' from public.custom_roles
    where id=current_setting('test.rbac_permission_role_id')::uuid), 'permission enabled at creation'
);
select extensions.ok(
  not (public.update_custom_role(current_setting('test.rbac_permission_role_id')::uuid,
    null, null, '[]'::jsonb, null, true)).permissions ? 'view_users', 'permission can be disabled'
);
select extensions.ok(
  (public.update_custom_role(current_setting('test.rbac_permission_role_id')::uuid,
    null, null, '["view_users"]'::jsonb, null, true)).permissions ? 'view_users', 'permission can be reenabled'
);

-- Exercise each protected baseline independently, rather than checking only the initial defaults.
select extensions.ok(
  (public.update_custom_role(current_setting('test.rbac_permission_role_id')::uuid,
    null, null, (
      select coalesce(jsonb_agg(item.value), '[]'::jsonb)
      from jsonb_array_elements_text('["view_dashboard","view_kpis","report_incident","view_own_reports","view_analytics"]'::jsonb) as item(value)
      where item.value <> baseline.permission
    ), null, true)).permissions ? baseline.permission,
  'baseline permission cannot be removed: ' || baseline.permission
)
from (values ('view_dashboard'), ('view_kpis'), ('report_incident'), ('view_own_reports'), ('view_analytics')) baseline(permission);

reset role;
select * from extensions.finish();
rollback;
