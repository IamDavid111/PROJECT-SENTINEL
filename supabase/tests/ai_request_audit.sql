-- Run against a migrated test database; the transaction rolls back test setup.
begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(24);

select extensions.has_table('public', 'ai_request_logs', 'AI request audit table exists');
select extensions.has_column('public', 'ai_request_logs', 'request_id', 'request ID is stored');
select extensions.has_column('public', 'ai_request_logs', 'user_id', 'authenticated user is attributable');
select extensions.has_column('public', 'ai_request_logs', 'organization_id', 'organization is attributable');
select extensions.has_column('public', 'ai_request_logs', 'requested_at', 'request timestamp is stored');
select extensions.has_column('public', 'ai_request_logs', 'prompt_version', 'prompt version is stored');
select extensions.has_column('public', 'ai_request_logs', 'model_id', 'model identifier is stored');
select extensions.has_column('public', 'ai_request_logs', 'status', 'request status is stored');
select extensions.has_column('public', 'ai_request_logs', 'error_code', 'failure reason can be recorded');
select extensions.has_column('public', 'ai_request_logs', 'response_metadata', 'response metadata can be recorded');
select extensions.has_column('public', 'ai_request_logs', 'retrieved_operational_records', 'future operational retrieval auditing is supported');
select extensions.has_column('public', 'ai_request_logs', 'retrieved_knowledge_documents', 'future knowledge retrieval auditing is supported');
select extensions.has_column('public', 'ai_request_logs', 'response_text', 'future AI response auditing is supported');
select extensions.has_column('public', 'ai_request_logs', 'human_decision', 'future human acceptance or rejection is supported');
select extensions.ok(
  not has_table_privilege('authenticated', 'public.ai_request_logs', 'select')
  and not has_table_privilege('authenticated', 'public.ai_request_logs', 'insert')
  and not has_table_privilege('authenticated', 'public.ai_request_logs', 'update')
  and not has_table_privilege('authenticated', 'public.ai_request_logs', 'delete')
  and has_table_privilege('service_role', 'public.ai_request_logs', 'select')
  and has_table_privilege('service_role', 'public.ai_request_logs', 'insert')
  and has_table_privilege('service_role', 'public.ai_request_logs', 'update'),
  'only the trusted server role can write or read AI request audit records'
);

-- Grants and RLS are separate controls; verify both rather than inferring one from the other.
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.ai_request_logs'::regclass),
  'AI audit RLS is enabled'
);
select extensions.ok(
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_request_logs'),
  'no policy exposes AI audit records to client roles'
);
select extensions.ok(
  not has_table_privilege('anon', 'public.ai_request_logs', 'select')
  and not has_table_privilege('anon', 'public.ai_request_logs', 'insert')
  and not has_table_privilege('anon', 'public.ai_request_logs', 'update')
  and not has_table_privilege('anon', 'public.ai_request_logs', 'delete'),
  'anonymous clients cannot read or forge AI audits'
);

-- Disposable fixtures let the actual database check writes without touching existing organizations.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'eb7be1c1-d059-47dd-abf5-67d6cab9fa71', 'authenticated', 'authenticated',
  'ai-audit-test@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.organizations (
  id, company_code, company_name, industry, company_size, country, state, contact_email, contact_phone
) values (
  'eb7be1c1-d059-47dd-abf5-67d6cab9fa72', 'AI_AUDIT_TEST', 'AI Audit Test', 'Testing', '1-10',
  'Nigeria', 'Lagos', 'ai-audit-test@example.com', '+2348000000000'
);

set local role service_role;
select extensions.lives_ok(
  $$insert into public.ai_request_logs (
    request_id, user_id, organization_id, feature, prompt_version, model_id
  ) values (
    'eb7be1c1-d059-47dd-abf5-67d6cab9fa73',
    'eb7be1c1-d059-47dd-abf5-67d6cab9fa71',
    'eb7be1c1-d059-47dd-abf5-67d6cab9fa72',
    'ai_service', 'ai-foundation-v1', 'test-model'
  )$$,
  'server role can create a pending audit request'
);
select extensions.lives_ok(
  $$update public.ai_request_logs set status = 'succeeded', completed_at = now()
    where request_id = 'eb7be1c1-d059-47dd-abf5-67d6cab9fa73'$$,
  'server role can complete a request'
);
select extensions.throws_ok(
  $$update public.ai_request_logs set status = 'failed', error_code = null
    where request_id = 'eb7be1c1-d059-47dd-abf5-67d6cab9fa73'$$,
  '23514', null, 'failure status requires an error code'
);
select extensions.throws_ok(
  $$update public.ai_request_logs set completed_at = null
    where request_id = 'eb7be1c1-d059-47dd-abf5-67d6cab9fa73'$$,
  '23514', null, 'completed status requires a completion timestamp'
);

set local role authenticated;
select extensions.throws_ok(
  $$select * from public.ai_request_logs$$,
  '42501', null, 'authenticated clients cannot read other organizations or any AI audit rows'
);
select extensions.throws_ok(
  $$update public.ai_request_logs set status = 'pending'$$,
  '42501', null, 'authenticated clients cannot tamper with audit status'
);
reset role;
select * from extensions.finish();
rollback;
