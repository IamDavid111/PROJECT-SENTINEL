begin;

create extension if not exists pgtap with schema extensions;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'aaf49808-1c33-4d9c-98e6-2377a87ce619', 'authenticated', 'authenticated',
  'profile-self-update-test@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.organizations (
  id, company_code, company_name, industry, company_size, country, state, contact_email, contact_phone
) values (
  '5c6e1199-6cc7-47d4-ae28-1b895cc7de71', 'PROFILE_TEST', 'Profile Update Test', 'Testing', '1-10',
  'Nigeria', 'Lagos', 'profile-self-update-test@example.com', '+2348000000000'
);

insert into public.profiles (id, organization_id, full_name, employee_id, department, account_status)
values (
  'aaf49808-1c33-4d9c-98e6-2377a87ce619',
  '5c6e1199-6cc7-47d4-ae28-1b895cc7de71',
  'Profile Test User', 'TEST-001', 'Testing', 'active'
);

insert into public.memberships (user_id, organization_id, role)
values (
  'aaf49808-1c33-4d9c-98e6-2377a87ce619',
  '5c6e1199-6cc7-47d4-ae28-1b895cc7de71',
  'Field Worker'
);

select set_config('request.jwt.claim.sub', 'aaf49808-1c33-4d9c-98e6-2377a87ce619', true);
select set_config('request.jwt.claims', '{"sub":"aaf49808-1c33-4d9c-98e6-2377a87ce619","role":"authenticated"}', true);
set local role authenticated;

select extensions.plan(6);

update public.profiles
set phone = '+2348000000000', emergency_contact = 'Test contact +2348000000001'
where id = auth.uid();

select extensions.ok(
  exists (
    select 1 from public.profiles
    where id = auth.uid()
      and phone = '+2348000000000'
      and emergency_contact = 'Test contact +2348000000001'
  ),
  'phone and emergency contact can be saved'
);

select extensions.throws_ok(
  $$update public.profiles set full_name = 'Changed name' where id = auth.uid()$$,
  '42501', 'Identity fields are managed by your administrator.', 'self-update cannot change full name'
);

select extensions.throws_ok(
  $$update public.profiles set employee_id = 'CHANGED' where id = auth.uid()$$,
  '42501', 'Identity fields are managed by your administrator.', 'self-update cannot change employee ID'
);

select extensions.throws_ok(
  $$update public.profiles set department = 'Changed department' where id = auth.uid()$$,
  '42501', 'Identity fields are managed by your administrator.', 'self-update cannot change department'
);

select extensions.hasnt_column('public', 'profiles', 'email', 'email is not a profile update column');
select extensions.throws_ok(
  $$select public.complete_admin_invitation('Profile Test User', '')$$,
  'P0001', 'No pending invitation is available for this account',
  'invitation lookup resolves email confirmation without ambiguous columns'
);
select * from extensions.finish();

rollback;