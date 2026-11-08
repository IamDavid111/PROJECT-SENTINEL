begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(20);

insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('bf300000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'policy-owner@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('bf300000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'policy-admin@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('bf300000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'policy-member@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('bf300000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'policy-other@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now());

select set_config('app.super_admin_initialization', 'on', true);
select set_config('request.jwt.claim.sub', 'bf300000-0000-4000-8000-000000000001', true);
insert into public.organizations(id, company_code, company_name, industry, company_size, country, state, contact_email, contact_phone, original_super_admin_id)
values
  ('bf400000-0000-4000-8000-000000000001', 'POLICY_DRAFT_A', 'Policy Draft A', 'Testing', '1-10', 'United Kingdom', 'England', 'policy-a@example.com', '12345678', 'bf300000-0000-4000-8000-000000000001'),
  ('bf400000-0000-4000-8000-000000000002', 'POLICY_DRAFT_B', 'Policy Draft B', 'Testing', '1-10', 'United Kingdom', 'England', 'policy-b@example.com', '12345678', 'bf300000-0000-4000-8000-000000000004');

insert into public.profiles(id, organization_id, full_name, account_status)
values
  ('bf300000-0000-4000-8000-000000000001', 'bf400000-0000-4000-8000-000000000001', 'Policy Owner', 'active'),
  ('bf300000-0000-4000-8000-000000000002', 'bf400000-0000-4000-8000-000000000001', 'Policy Admin', 'active'),
  ('bf300000-0000-4000-8000-000000000003', 'bf400000-0000-4000-8000-000000000001', 'Policy Member', 'active'),
  ('bf300000-0000-4000-8000-000000000004', 'bf400000-0000-4000-8000-000000000002', 'Other Organization', 'active');

select set_config('request.jwt.claim.sub', 'bf300000-0000-4000-8000-000000000001', true);
insert into public.memberships(user_id, organization_id, role)
values
  ('bf300000-0000-4000-8000-000000000001', 'bf400000-0000-4000-8000-000000000001', 'Super Administrator'),
  ('bf300000-0000-4000-8000-000000000002', 'bf400000-0000-4000-8000-000000000001', 'Organization Administrator'),
  ('bf300000-0000-4000-8000-000000000003', 'bf400000-0000-4000-8000-000000000001', 'Field Worker');
select set_config('request.jwt.claim.sub', 'bf300000-0000-4000-8000-000000000004', true);
insert into public.memberships(user_id, organization_id, role)
values ('bf300000-0000-4000-8000-000000000004', 'bf400000-0000-4000-8000-000000000002', 'Super Administrator');

select set_config('request.jwt.claim.sub', 'bf300000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"bf300000-0000-4000-8000-000000000001","role":"authenticated","session_id":"bf500000-0000-4000-8000-000000000001"}', true);
set local role authenticated;

select extensions.is((public.get_safety_policy_status() ->> 'active')::boolean, false, 'no published policy is a normal inactive status');
select extensions.is((public.get_safety_policy_settings() ->> 'configured')::boolean, false, 'organization settings identify an unconfigured policy');

select set_config('request.jwt.claim.sub', 'bf300000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"bf300000-0000-4000-8000-000000000002","role":"authenticated","session_id":"bf500000-0000-4000-8000-000000000002"}', true);
select public.create_safety_policy_starter_draft();
select extensions.is((public.get_safety_policy_settings() ->> 'hasDraft')::boolean, true, 'authorized organization admins can load an editable draft');
select extensions.is((public.get_safety_policy_settings() ->> 'isStarterDraft')::boolean, true, 'starter content is marked for review');
select extensions.is((public.get_safety_policy_status() ->> 'active')::boolean, false, 'an unpublished starter does not block workspace access');
select public.set_safety_policy_active(true);

select set_config('request.jwt.claim.sub', 'bf300000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"bf300000-0000-4000-8000-000000000003","role":"authenticated","session_id":"bf500000-0000-4000-8000-000000000003"}', true);
select extensions.is((public.get_safety_policy_status() ->> 'required')::boolean, true, 'publishing requires member acknowledgement');
select extensions.is((public.acknowledge_safety_policy() ->> 'acknowledged')::boolean, true, 'member acknowledgement is saved');

select set_config('request.jwt.claim.sub', 'bf300000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"bf300000-0000-4000-8000-000000000002","role":"authenticated","session_id":"bf500000-0000-4000-8000-000000000002"}', true);
select public.save_safety_policy_draft(
  'Organization Safety Policy',
  'Reviewed and organization-specific safety policy.',
  'first_login',
  null,
  'UTC',
  false
);
select extensions.is((public.get_safety_policy_status() #>> '{policy,versionNumber}')::integer, 1, 'draft edits do not replace the currently published version');
select extensions.is((public.get_safety_policy_settings() ->> 'hasDraft')::boolean, true, 'draft changes remain separate from the published policy');
select extensions.is((public.get_safety_policy_settings() ->> 'publishedVersionNumber')::integer, 1, 'settings identify the still-published version');
select public.set_safety_policy_active(true);

select set_config('request.jwt.claim.sub', 'bf300000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"bf300000-0000-4000-8000-000000000003","role":"authenticated","session_id":"bf500000-0000-4000-8000-000000000003"}', true);
select extensions.is((public.get_safety_policy_status() #>> '{policy,versionNumber}')::integer, 2, 'publishing the draft advances the published version');
select extensions.is((public.get_safety_policy_status() ->> 'required')::boolean, true, 'a newly published version requires re-acknowledgement');

select set_config('request.jwt.claim.sub', 'bf300000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"bf300000-0000-4000-8000-000000000002","role":"authenticated","session_id":"bf500000-0000-4000-8000-000000000002"}', true);
select public.set_safety_policy_active(false);
select set_config('request.jwt.claim.sub', 'bf300000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"bf300000-0000-4000-8000-000000000003","role":"authenticated","session_id":"bf500000-0000-4000-8000-000000000003"}', true);
select extensions.is((public.get_safety_policy_status() ->> 'active')::boolean, false, 'unpublishing removes the acknowledgement gate');

select set_config('request.jwt.claim.sub', 'bf300000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"bf300000-0000-4000-8000-000000000002","role":"authenticated","session_id":"bf500000-0000-4000-8000-000000000002"}', true);
select public.delete_safety_policy();
select extensions.is((public.get_safety_policy_settings() ->> 'deleted')::boolean, true, 'deletion is a non-destructive soft delete');
select set_config('request.jwt.claim.sub', 'bf300000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"bf300000-0000-4000-8000-000000000003","role":"authenticated","session_id":"bf500000-0000-4000-8000-000000000003"}', true);
select extensions.throws_ok($$
  select public.save_safety_policy_draft('Unauthorized', 'No permission', 'first_login', null, 'UTC', false)
$$, '42501', 'Only an authorized organization administrator can manage the safety policy', 'members cannot create policy drafts');
select extensions.ok(not has_table_privilege('authenticated', 'public.safety_policies', 'select'), 'policy records cannot be read directly');

reset role;
select extensions.is((select count(*)::integer from public.safety_policy_acknowledgements
  where user_id = 'bf300000-0000-4000-8000-000000000003'), 1, 'deletion retains historical acknowledgement records');
select extensions.is((select count(*)::integer from public.activity_logs
  where organization_id = 'bf400000-0000-4000-8000-000000000001'
    and metadata ->> 'event_code' in (
      'safety_policy_draft_created',
      'safety_policy_draft_updated',
      'safety_policy_published',
      'safety_policy_unpublished',
      'safety_policy_deleted'
    )), 6, 'create, edit, publish, unpublish, and delete actions are logged');

select set_config('request.jwt.claim.sub', 'bf300000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"bf300000-0000-4000-8000-000000000004","role":"authenticated","session_id":"bf500000-0000-4000-8000-000000000004"}', true);
set local role authenticated;
select extensions.is((public.get_safety_policy_status() ->> 'active')::boolean, false, 'another organization cannot access this organization policy');
select extensions.is((public.get_safety_policy_settings() ->> 'configured')::boolean, false, 'policy settings remain isolated per organization');

select * from extensions.finish();
rollback;
