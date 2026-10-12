begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(28);

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

insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select user_id, 'authenticated', 'authenticated', email, '', '{}'::jsonb, '{}'::jsonb, now(), now()
from (values
  ('bc000000-0000-4000-8000-000000000002'::uuid, 'rbac-org-admin@example.com'),
  ('bc000000-0000-4000-8000-000000000003'::uuid, 'rbac-analyst@example.com')
) fixture(user_id, email);
insert into public.profiles(id, organization_id, full_name, account_status)
select id, 'bd000000-0000-4000-8000-000000000001', 'RBAC Test User', 'active'
from auth.users where id in ('bc000000-0000-4000-8000-000000000002', 'bc000000-0000-4000-8000-000000000003');
insert into public.memberships(user_id, organization_id, role)
values
  ('bc000000-0000-4000-8000-000000000002', 'bd000000-0000-4000-8000-000000000001', 'Organization Administrator'),
  ('bc000000-0000-4000-8000-000000000003', 'bd000000-0000-4000-8000-000000000001', 'Field Worker');

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

select extensions.ok(
  (public.update_custom_role(current_setting('test.rbac_permission_role_id')::uuid,
    null, null, '["view_executive_analytics"]'::jsonb, null, true)).permissions ? 'view_executive_analytics',
  'Super Admin can grant analytics to a role'
);
select extensions.ok(
  not (public.update_custom_role(current_setting('test.rbac_permission_role_id')::uuid,
    null, null, '[]'::jsonb, null, true)).permissions ? 'view_executive_analytics',
  'Super Admin can revoke analytics from a role'
);
select extensions.ok(
  (public.update_custom_role(current_setting('test.rbac_permission_role_id')::uuid,
    null, null, '["view_executive_analytics"]'::jsonb, null, true)).permissions ? 'view_executive_analytics',
  'Super Admin can regrant analytics'
);
select extensions.lives_ok($$
  select public.update_user_role('bd000000-0000-4000-8000-000000000001',
    'bc000000-0000-4000-8000-000000000003', 'RBAC Permission Test')
$$, 'Super Admin can assign an analytics role to a user');

select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok($$
  select public.create_custom_role('bd000000-0000-4000-8000-000000000001',
    'Unauthorized Analytics', null, '["view_executive_analytics"]'::jsonb, '{}'::jsonb)
$$, '42501', 'Only your Super Admin can grant or revoke Executive Analytics access', 'Org Admin cannot create an analytics role');
select extensions.throws_ok($$
  select public.update_custom_role(current_setting('test.rbac_permission_role_id')::uuid,
    null, null, '[]'::jsonb, null, true)
$$, '42501', 'Only your Super Admin can grant or revoke Executive Analytics access', 'Org Admin cannot revoke a role grant');
select extensions.throws_ok($$
  update public.custom_roles set permissions = '[]'::jsonb
  where id = current_setting('test.rbac_permission_role_id')::uuid
$$, '42501', 'Only your Super Admin can grant or revoke Executive Analytics access', 'Direct RLS-authorized writes cannot bypass the grant guard');
select extensions.throws_ok($$
  select public.delete_custom_role(current_setting('test.rbac_permission_role_id')::uuid)
$$, '42501', 'Only your Super Admin can grant or revoke Executive Analytics access', 'Org Admin cannot archive an analytics role');
select extensions.throws_ok($$
  delete from public.custom_roles where id = current_setting('test.rbac_permission_role_id')::uuid
$$, '42501', 'Only your Super Admin can grant or revoke Executive Analytics access', 'Org Admin cannot delete an analytics role');
select extensions.throws_ok($$
  select public.update_user_role('bd000000-0000-4000-8000-000000000001',
    'bc000000-0000-4000-8000-000000000003', 'Field Worker')
$$, '42501', 'Only your Super Admin can grant or revoke Executive Analytics access', 'Org Admin cannot revoke a user analytics assignment');
select extensions.throws_ok($$
  select public.update_user_role('bd000000-0000-4000-8000-000000000001',
    'bc000000-0000-4000-8000-000000000002', 'RBAC Permission Test')
$$, '42501', 'Only your Super Admin can grant or revoke Executive Analytics access', 'Org Admin cannot self-assign an existing analytics grant');
select extensions.lives_ok($$
  select public.update_custom_role(current_setting('test.rbac_permission_role_id')::uuid,
    null, null, '["view_executive_analytics","view_users"]'::jsonb, null, true)
$$, 'Org Admin retains unrelated permission-editing powers');
select extensions.lives_ok($$
  select public.create_custom_role('bd000000-0000-4000-8000-000000000001',
    'Ordinary Role', null, '["view_users"]'::jsonb, '{}'::jsonb)
$$, 'Org Admin retains ordinary custom-role creation');
select extensions.throws_ok($$
  select public.update_user_role('bd000000-0000-4000-8000-000000000001',
    'bc000000-0000-4000-8000-000000000002', 'Super Administrator')
$$, '42501', 'Only your Super Admin can grant or revoke Executive Analytics access', 'Org Admin cannot bypass analytics authority by self-promoting');

reset role;
select extensions.throws_ok($$
  insert into public.admin_invitations(organization_id, invitee_email, invited_user_id, role, inviter_id, expires_at)
  values ('bd000000-0000-4000-8000-000000000001', 'rbac-analyst@example.com',
    'bc000000-0000-4000-8000-000000000003', 'RBAC Permission Test',
    'bc000000-0000-4000-8000-000000000002', now() + interval '1 day')
$$, '42501', 'Only your Super Admin can grant Executive Analytics through invitations', 'Service invitation insert still requires Super Admin inviter authority');
select extensions.lives_ok($$
  insert into public.admin_invitations(organization_id, invitee_email, invited_user_id, role, inviter_id, expires_at)
  values ('bd000000-0000-4000-8000-000000000001', 'rbac-analyst@example.com',
    'bc000000-0000-4000-8000-000000000003', 'RBAC Permission Test',
    'bc000000-0000-4000-8000-000000000001', now() + interval '1 day')
$$, 'Super Admin analytics invitations remain supported');
select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok($$
  select public.update_user_role('bd000000-0000-4000-8000-000000000001',
    'bc000000-0000-4000-8000-000000000003', 'Field Worker')
$$, 'Super Admin can revoke a user analytics assignment');
select extensions.lives_ok($$
  select public.update_user_role('bd000000-0000-4000-8000-000000000001',
    'bc000000-0000-4000-8000-000000000003', 'RBAC Permission Test')
$$, 'Super Admin can regrant a user analytics assignment');
select extensions.lives_ok($$
  select public.update_user_role('bd000000-0000-4000-8000-000000000001',
    'bc000000-0000-4000-8000-000000000003', 'Field Worker')
$$, 'Super Admin can revoke access before invitation acceptance');

reset role;
update auth.users set email_confirmed_at = now()
where id = 'bc000000-0000-4000-8000-000000000003';
update public.profiles set account_status = 'pending'
where id = 'bc000000-0000-4000-8000-000000000003';
select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.lives_ok($$
  select public.complete_admin_invitation('RBAC Invited Analyst', 'RBAC-EMPLOYEE')
$$, 'Invited user can accept a valid Super Admin analytics invitation');
reset role;
select * from extensions.finish();
rollback;
