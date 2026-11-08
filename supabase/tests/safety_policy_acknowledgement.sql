begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(16);

insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('bf000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'safety-admin@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('bf000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'safety-member@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('bf000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'safety-other@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now());
select set_config('app.super_admin_initialization', 'on', true);
select set_config('request.jwt.claim.sub', 'bf000000-0000-4000-8000-000000000001', true);
insert into public.organizations(id, company_code, company_name, industry, company_size, country, state, contact_email, contact_phone, original_super_admin_id)
values
  ('bf100000-0000-4000-8000-000000000001', 'SAFETY_POLICY_A', 'Safety Policy A', 'Testing', '1-10', 'United Kingdom', 'England', 'safety-a@example.com', '12345678', 'bf000000-0000-4000-8000-000000000001'),
  ('bf100000-0000-4000-8000-000000000002', 'SAFETY_POLICY_B', 'Safety Policy B', 'Testing', '1-10', 'United Kingdom', 'England', 'safety-b@example.com', '12345678', 'bf000000-0000-4000-8000-000000000003');
insert into public.profiles(id, organization_id, full_name, account_status)
values
  ('bf000000-0000-4000-8000-000000000001', 'bf100000-0000-4000-8000-000000000001', 'Safety Admin', 'active'),
  ('bf000000-0000-4000-8000-000000000002', 'bf100000-0000-4000-8000-000000000001', 'Safety Member', 'active'),
  ('bf000000-0000-4000-8000-000000000003', 'bf100000-0000-4000-8000-000000000002', 'Other Company', 'active');
select set_config('request.jwt.claim.sub', 'bf000000-0000-4000-8000-000000000001', true);
insert into public.memberships(user_id, organization_id, role)
values
  ('bf000000-0000-4000-8000-000000000001', 'bf100000-0000-4000-8000-000000000001', 'Super Administrator'),
  ('bf000000-0000-4000-8000-000000000002', 'bf100000-0000-4000-8000-000000000001', 'Field Worker');
select set_config('request.jwt.claim.sub', 'bf000000-0000-4000-8000-000000000003', true);
insert into public.memberships(user_id, organization_id, role)
values ('bf000000-0000-4000-8000-000000000003', 'bf100000-0000-4000-8000-000000000002', 'Super Administrator');

select set_config('request.jwt.claim.sub', 'bf000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"bf000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"bf200000-0000-4000-8000-000000000001"}', true);
set local role authenticated;
select public.save_safety_policy('Safety Policy', 'Employees must report hazards and follow safe work procedures.', 'every_login', null, 'UTC', true);
select extensions.throws_ok($$
  select public.save_safety_policy('Safety Policy', 'Policy text', 'interval_days', 0, 'UTC', true)
$$, '22023', 'The interval must be between 1 and 365 days and is only valid for interval mode', 'interval mode rejects values outside the configured range');
select extensions.throws_ok($$
  select public.save_safety_policy('Safety Policy', 'Policy text', 'interval_days', null, 'UTC', true)
$$, '22023', 'The interval must be between 1 and 365 days and is only valid for interval mode', 'interval mode rejects a missing interval');
select extensions.throws_ok($$
  select public.save_safety_policy('Safety Policy', 'Policy text', 'weekly', null, 'Not/A_Timezone', true)
$$, '22023', 'Select a valid IANA timezone', 'weekly mode requires a valid IANA timezone');
select set_config('request.jwt.claim.sub', 'bf000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"bf000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"bf200000-0000-4000-8000-000000000002"}', true);
select extensions.is((public.get_safety_policy_status() ->> 'required')::boolean, true, 'active policy blocks a member before acknowledgement');
select extensions.ok(not public.safety_policy_access_allowed('bf100000-0000-4000-8000-000000000001'), 'tenant data access helper denies protected access before acknowledgement');
select extensions.ok(not public.safety_policy_access_allowed('bf100000-0000-4000-8000-000000000002'), 'tenant data access helper denies cross-company status probing');
select extensions.is((public.acknowledge_safety_policy() ->> 'acknowledged')::boolean, true, 'acknowledgement is recorded for the authenticated member');
select extensions.is((public.get_safety_policy_status() ->> 'required')::boolean, false, 'current-session acknowledgement permits access');
select extensions.is((public.acknowledge_safety_policy() ->> 'alreadyRecorded')::boolean, true, 'repeat acknowledgement is idempotent for the current schedule');
select set_config('request.jwt.claims', '{"sub":"bf000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"bf200000-0000-4000-8000-000000000099"}', true);
select extensions.is((public.get_safety_policy_status() ->> 'required')::boolean, true, 'every-login mode requires a new session acknowledgement');
select extensions.ok(not has_table_privilege('authenticated', 'public.safety_policies', 'select'), 'policy records cannot be read directly');
select extensions.throws_ok($$
  select public.save_safety_policy('Unauthorized', 'No permission', 'every_login', null, 'UTC', true)
$$, '42501', 'Only an authorized organization administrator can manage the safety policy', 'ordinary members cannot manage policy');

select set_config('request.jwt.claim.sub', 'bf000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"bf000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"bf200000-0000-4000-8000-000000000001"}', true);
select public.save_safety_policy('Safety Policy', 'Employees must report hazards, follow safe work procedures, and stop unsafe work.', 'first_login', null, 'UTC', true);
select set_config('request.jwt.claim.sub', 'bf000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"bf000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"bf200000-0000-4000-8000-000000000002"}', true);
select extensions.is((public.get_safety_policy_status() #>> '{policy,versionNumber}')::integer, 2, 'policy content edits create a new immutable version');
select extensions.is((public.get_safety_policy_status() ->> 'required')::boolean, true, 'a newer policy version invalidates the previous acknowledgement');
select set_config('request.jwt.claim.sub', 'bf000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"bf000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"bf200000-0000-4000-8000-000000000003"}', true);
select extensions.is((public.get_safety_policy_status() ->> 'active')::boolean, false, 'another company cannot view this company policy');

reset role;
select extensions.is((select count(*)::integer from public.safety_policy_acknowledgements
  where user_id = 'bf000000-0000-4000-8000-000000000002'), 1, 'historical acknowledgement remains linked to its exact version');
select * from extensions.finish();
rollback;
