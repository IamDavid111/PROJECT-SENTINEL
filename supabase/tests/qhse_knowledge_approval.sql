begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('ea000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', 'approval-' || n || '@example.com', '', '{}', '{}', now(), now()
from generate_series(1, 4) n;
insert into public.organizations(id, company_code, company_name, industry, company_size, country, state, contact_email, contact_phone)
values
  ('eb000000-0000-4000-8000-000000000001', 'APPROVAL_ONE', 'Approval One', 'Testing', '1-10', 'Nigeria', 'Lagos', 'one@example.com', '12345678'),
  ('eb000000-0000-4000-8000-000000000002', 'APPROVAL_TWO', 'Approval Two', 'Testing', '1-10', 'Nigeria', 'Lagos', 'two@example.com', '12345678');
insert into public.profiles(id, organization_id, full_name, account_status)
select id, case when id = 'ea000000-0000-4000-8000-000000000004' then 'eb000000-0000-4000-8000-000000000002'::uuid
  else 'eb000000-0000-4000-8000-000000000001'::uuid end, email, 'active'
from auth.users where id::text like 'ea000000-%';
insert into public.custom_roles(organization_id, name, permissions, created_by)
values
  ('eb000000-0000-4000-8000-000000000001', 'Approval Uploader', '["view_knowledge_documents","manage_knowledge_documents"]', 'ea000000-0000-4000-8000-000000000001'),
  ('eb000000-0000-4000-8000-000000000001', 'Approval Reviewer', '["view_knowledge_documents","manage_knowledge_documents","approve_knowledge_documents"]', 'ea000000-0000-4000-8000-000000000001');
insert into public.memberships(user_id, organization_id, role)
values
  ('ea000000-0000-4000-8000-000000000001', 'eb000000-0000-4000-8000-000000000001', 'Super Administrator'),
  ('ea000000-0000-4000-8000-000000000002', 'eb000000-0000-4000-8000-000000000001', 'Approval Uploader'),
  ('ea000000-0000-4000-8000-000000000003', 'eb000000-0000-4000-8000-000000000001', 'Approval Reviewer'),
  ('ea000000-0000-4000-8000-000000000004', 'eb000000-0000-4000-8000-000000000002', 'Super Administrator');

-- Rollback-only fixtures pass through the existing upload/submission guards.
create function pg_temp.approval_fixture(n integer, actor integer) returns void language plpgsql as $$
declare
  doc uuid := ('ec000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
  version uuid := ('ed000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
begin
  perform set_config('request.jwt.claim.sub', 'ea000000-0000-4000-8000-' || lpad(actor::text, 12, '0'), true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  insert into public.knowledge_documents(id) values (doc);
  insert into public.knowledge_document_versions(id, document_id, version_number, document_type,
    title, storage_path, original_filename, mime_type, file_size)
  values (version, doc, 1, 'procedure', 'Approval fixture',
    'eb000000-0000-4000-8000-000000000001/' || doc || '/' || version || '/test.txt',
    'test.txt', 'text/plain', 50);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  update public.knowledge_document_versions set uploaded_at = now() where id = version;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform public.transition_knowledge_version(version, 'pending_review');
end;
$$;
select pg_temp.approval_fixture(1, 1);
select pg_temp.approval_fixture(2, 2);
select pg_temp.approval_fixture(3, 2);
select pg_temp.approval_fixture(4, 2);
select pg_temp.approval_fixture(5, 3);
select pg_temp.approval_fixture(6, 2);

select set_config('request.jwt.claim.sub', 'ea000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.transition_knowledge_version('ed000000-0000-4000-8000-000000000001', 'approved')$$,
  'Super Administrator self-approves despite another active approver');
select extensions.lives_ok(
  $$select public.transition_knowledge_version('ed000000-0000-4000-8000-000000000002', 'approved')$$,
  'Super Administrator approves another user submission');
select extensions.lives_ok(
  $$select public.transition_knowledge_version('ed000000-0000-4000-8000-000000000003', 'rejected', 'Revise the controls')$$,
  'Super Administrator rejects another user submission');
select extensions.ok(
  (select approval_status = 'approved' and approved_by = auth.uid() and approved_at is not null
    from public.knowledge_document_versions where id = 'ed000000-0000-4000-8000-000000000001'),
  'self-approval persists approved status and server-derived approval evidence');
select extensions.ok(
  (select approval_status = 'approved' and approved_by = auth.uid() and approved_at is not null
    from public.knowledge_document_versions where id = 'ed000000-0000-4000-8000-000000000002'),
  'approval of another uploader persists approved status and approval evidence');
select extensions.ok(
  (select approval_status = 'rejected' and rejected_by = auth.uid() and rejected_at is not null
    and rejection_reason = 'Revise the controls' and approved_by is null and approved_at is null
    from public.knowledge_document_versions where id = 'ed000000-0000-4000-8000-000000000003'),
  'rejection persists its reason and decision evidence without approval evidence');
select extensions.ok(
  exists (select 1 from public.activity_logs where metadata->>'record_id' = 'ed000000-0000-4000-8000-000000000001'
    and metadata->>'event_code' = 'knowledge_version_approved'
    and metadata->>'document_id' = 'ec000000-0000-4000-8000-000000000001'
    and metadata->>'submitter_id' = auth.uid()::text and metadata->>'approver_id' = auth.uid()::text
    and metadata->>'decision' = 'approved' and (metadata->>'self_approval')::boolean
    and metadata->>'decision_at' is not null),
  'self-approval audit records document, actors, decision, timestamp and flag');
select extensions.ok(
  exists (select 1 from public.activity_logs where metadata->>'record_id' = 'ed000000-0000-4000-8000-000000000003'
    and metadata->>'decision' = 'rejected' and metadata->>'approver_id' = auth.uid()::text
    and metadata->>'submitter_id' = 'ea000000-0000-4000-8000-000000000002'
    and metadata->>'self_approval' = 'false' and metadata->>'decision_at' is not null
    and metadata->>'rejection_reason' = 'Revise the controls'),
  'rejection audit records original submitter and actual decision actor');

select set_config('request.jwt.claim.sub', 'ea000000-0000-4000-8000-000000000002', true);
select extensions.is(public.current_knowledge_capabilities()->>'canApprove', 'false', 'upload rights do not grant approval');
select extensions.throws_ok(
  $$select public.transition_knowledge_version('ed000000-0000-4000-8000-000000000004', 'approved')$$,
  '42501', 'Authorized knowledge lifecycle access is required', 'upload-only user cannot approve');
select extensions.is(
  (select approval_status from public.knowledge_document_versions
    where id = 'ed000000-0000-4000-8000-000000000004'),
  'pending_review', 'failed approval leaves the uploaded version pending');
select set_config('request.jwt.claim.sub', 'ea000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select public.transition_knowledge_version('ed000000-0000-4000-8000-000000000005', 'approved')$$,
  '42501', 'Only Super Administrators may approve their own submissions', 'delegated reviewer cannot self-approve');
select extensions.lives_ok(
  $$select public.transition_knowledge_version('ed000000-0000-4000-8000-000000000004', 'approved')$$,
  'delegated reviewer can approve another user submission');
select extensions.ok(
  exists (select 1 from public.activity_logs where metadata->>'record_id' = 'ed000000-0000-4000-8000-000000000004'
    and metadata->>'approver_id' = auth.uid()::text and metadata->>'self_approval' = 'false'),
  'delegated decision is audited without a self-approval flag');

select set_config('request.jwt.claim.sub', 'ea000000-0000-4000-8000-000000000001', true);
update public.memberships set role = 'Approval Reviewer'
where user_id = 'ea000000-0000-4000-8000-000000000002' and organization_id = 'eb000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', 'ea000000-0000-4000-8000-000000000002', true);
select extensions.is(public.current_knowledge_capabilities()->>'canApprove', 'true', 'Super Administrator can grant approval to an individual through role assignment');
select set_config('request.jwt.claim.sub', 'ea000000-0000-4000-8000-000000000001', true);
update public.memberships set role = 'Approval Uploader'
where user_id = 'ea000000-0000-4000-8000-000000000002' and organization_id = 'eb000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', 'ea000000-0000-4000-8000-000000000002', true);
select extensions.is(public.current_knowledge_capabilities()->>'canApprove', 'false', 'individual role reassignment revokes approval without removing upload rights');
select set_config('request.jwt.claim.sub', 'ea000000-0000-4000-8000-000000000001', true);
update public.custom_roles set permissions = '["view_knowledge_documents","manage_knowledge_documents"]'
where organization_id = 'eb000000-0000-4000-8000-000000000001' and name = 'Approval Reviewer';
select set_config('request.jwt.claim.sub', 'ea000000-0000-4000-8000-000000000003', true);
select extensions.is(public.current_knowledge_capabilities()->>'canApprove', 'false', 'revocation changes server capabilities');
select extensions.throws_ok(
  $$select public.transition_knowledge_version('ed000000-0000-4000-8000-000000000006', 'approved')$$,
  '42501', 'Authorized knowledge lifecycle access is required', 'revocation prevents subsequent decisions');
select set_config('request.jwt.claim.sub', 'ea000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select public.transition_knowledge_version('ed000000-0000-4000-8000-000000000006', 'approved')$$,
  '42501', 'Authorized knowledge lifecycle access is required', 'foreign Super Administrator cannot approve');
select extensions.is(
  (select count(*)::integer from public.knowledge_document_versions
    where organization_id = 'eb000000-0000-4000-8000-000000000001'), 0, 'foreign versions remain invisible');

select set_config('request.jwt.claim.sub', 'ea000000-0000-4000-8000-000000000001', true);
update public.custom_roles set permissions = '["view_knowledge_documents","manage_knowledge_documents","approve_knowledge_documents"]'
where organization_id = 'eb000000-0000-4000-8000-000000000001' and name = 'Approval Reviewer';
reset role;
update public.profiles set account_status = 'suspended' where id = 'ea000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', 'ea000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.transition_knowledge_version('ed000000-0000-4000-8000-000000000005', 'approved')$$,
  '42501', 'Only Super Administrators may approve their own submissions', 'ordinary sole approver still cannot self-approve');
select set_config('request.jwt.claim.sub', 'ea000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$select public.transition_knowledge_version('ed000000-0000-4000-8000-000000000006', 'approved')$$,
  '42501', 'Authorized knowledge lifecycle access is required', 'suspended Super Administrator cannot approve');
reset role;
select extensions.is(
  (select count(*)::integer from public.knowledge_processing_candidates
    where id in ('ed000000-0000-4000-8000-000000000001', 'ed000000-0000-4000-8000-000000000002')),
  2, 'approved uploads become eligible for extraction and indexing');
select extensions.is(
  (select count(*)::integer from public.knowledge_ai_index_candidates
    where id in ('ed000000-0000-4000-8000-000000000001', 'ed000000-0000-4000-8000-000000000002')),
  2, 'current approved uploads pass the live AI knowledge eligibility boundary');
select extensions.is(
  (select count(*)::integer from public.knowledge_processing_candidates
    where id in ('ed000000-0000-4000-8000-000000000003', 'ed000000-0000-4000-8000-000000000005',
      'ed000000-0000-4000-8000-000000000006')),
  0, 'rejected and pending uploads remain excluded from AI processing');
select * from extensions.finish();
rollback;
