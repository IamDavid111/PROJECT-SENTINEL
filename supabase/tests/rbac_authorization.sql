begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(8);

-- Isolated fixtures make authorization checks reproducible without existing customer accounts.
insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('ba000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'authenticated', 'authenticated',
  'rbac-auth-' || n || '@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now()
from generate_series(1,3) n;
insert into public.organizations(id, company_code, company_name, industry, company_size, country, state, contact_email, contact_phone)
select ('bb000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'RBAC_AUTH_' || n,
  'RBAC Test', 'Testing', '1-10', 'Nigeria', 'Lagos', 'rbac@example.com', '12345678'
from generate_series(1,2) n;
insert into public.profiles(id, organization_id, full_name, account_status)
select ('ba000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  ('bb000000-0000-4000-8000-' || lpad((case when n=3 then 2 else 1 end)::text,12,'0'))::uuid,
  'RBAC Test User ' || n, 'active' from generate_series(1,3) n;
insert into public.memberships(user_id, organization_id, role)
select id, organization_id, case
  when id::text like '%000001' then 'Organization Administrator'
  when id::text like '%000002' then 'Field Worker'
  else 'Contractor' end
from public.profiles where id::text like 'ba000000%';

select set_config('request.jwt.claim.sub', 'ba000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.create_custom_role('bb000000-0000-4000-8000-000000000001',
    'RBAC Authorization Test', null, '["view_users"]'::jsonb, '{}'::jsonb)$$,
  'organization administrator creates role'
);
select set_config('test.rbac_role_id',
  (select id::text from public.custom_roles where organization_id='bb000000-0000-4000-8000-000000000001'
    and name='RBAC Authorization Test'), true);
select extensions.lives_ok(
  $$select public.update_custom_role(current_setting('test.rbac_role_id')::uuid,
    null, null, '["view_users","invite_users"]'::jsonb, null, true)$$,
  'organization administrator edits permissions'
);
select extensions.throws_ok(
  $$select public.create_custom_role('bb000000-0000-4000-8000-000000000002',
    'Cross Tenant Test', null, '["view_users"]'::jsonb, '{}'::jsonb)$$,
  'P0001', 'Only organization administrators can create custom roles',
  'administrator cannot create another organization role'
);

select set_config('request.jwt.claim.sub', 'ba000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.create_custom_role('bb000000-0000-4000-8000-000000000001',
    'Worker Denial Test', null, '["view_users"]'::jsonb, '{}'::jsonb)$$,
  'P0001', 'Only organization administrators can create custom roles', 'worker cannot create roles'
);
select extensions.throws_ok(
  $$select public.update_custom_role(current_setting('test.rbac_role_id')::uuid,
    null, null, '["view_users"]'::jsonb, null, true)$$,
  'P0001', 'Only organization administrators can update custom roles', 'worker cannot edit permissions'
);

select set_config('request.jwt.claim.sub', 'ba000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select public.create_custom_role('bb000000-0000-4000-8000-000000000002',
    'Contractor Denial Test', null, '["view_users"]'::jsonb, '{}'::jsonb)$$,
  'P0001', 'Only organization administrators can create custom roles', 'contractor cannot create roles'
);
select extensions.is(
  (select count(*)::int from public.custom_roles where id=current_setting('test.rbac_role_id')::uuid),
  0, 'other organization cannot read role'
);
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select extensions.throws_ok(
  $$select public.create_custom_role('bb000000-0000-4000-8000-000000000001',
    'Anonymous Denial Test', null, '[]'::jsonb, '{}'::jsonb)$$,
  'P0001', 'Authentication is required', 'anonymous clients cannot manage roles'
);
reset role;
select * from extensions.finish();
rollback;
