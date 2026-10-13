begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(16);

select extensions.ok(
  public.custom_role_permissions_allowed() @> array[
    'view_knowledge_documents', 'manage_knowledge_documents', 'approve_knowledge_documents',
    'view_confidential_knowledge', 'view_restricted_knowledge'
  ]::text[],
  'knowledge permissions are grantable through Roles & Permissions'
);

insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('ca000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'kp-admin@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('ca000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'kp-uploader@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('ca000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'kp-approver@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('ca000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'kp-reader@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('ca000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'kp-none@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('ca000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'kp-confidential@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.organizations(id, company_code, company_name, industry, company_size, country, state, contact_email, contact_phone)
values ('cb000000-0000-4000-8000-000000000001', 'KP_ONE', 'Knowledge Permissions', 'Testing', '1-10', 'Nigeria', 'Lagos', 'kp@example.com', '12345678');
insert into public.profiles(id, organization_id, full_name, account_status)
select id, 'cb000000-0000-4000-8000-000000000001', email, 'active' from auth.users
where id::text like 'ca000000-%';
insert into public.custom_roles(organization_id, name, permissions, created_by)
values
  ('cb000000-0000-4000-8000-000000000001', 'Doc Uploader', '["view_knowledge_documents","manage_knowledge_documents"]', 'ca000000-0000-4000-8000-000000000001'),
  ('cb000000-0000-4000-8000-000000000001', 'Doc Approver', '["view_knowledge_documents","approve_knowledge_documents"]', 'ca000000-0000-4000-8000-000000000001'),
  ('cb000000-0000-4000-8000-000000000001', 'Doc Reader', '["view_knowledge_documents"]', 'ca000000-0000-4000-8000-000000000001'),
  ('cb000000-0000-4000-8000-000000000001', 'No Knowledge', '[]', 'ca000000-0000-4000-8000-000000000001'),
  ('cb000000-0000-4000-8000-000000000001', 'Confidential Reader', '["view_knowledge_documents","view_confidential_knowledge"]', 'ca000000-0000-4000-8000-000000000001');
insert into public.memberships(user_id, organization_id, role)
values
  ('ca000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', 'Super Administrator'),
  ('ca000000-0000-4000-8000-000000000002', 'cb000000-0000-4000-8000-000000000001', 'Doc Uploader'),
  ('ca000000-0000-4000-8000-000000000003', 'cb000000-0000-4000-8000-000000000001', 'Doc Approver'),
  ('ca000000-0000-4000-8000-000000000004', 'cb000000-0000-4000-8000-000000000001', 'Doc Reader'),
  ('ca000000-0000-4000-8000-000000000005', 'cb000000-0000-4000-8000-000000000001', 'No Knowledge'),
  ('ca000000-0000-4000-8000-000000000006', 'cb000000-0000-4000-8000-000000000001', 'Confidential Reader');

-- A custom role granted only manage rights can register and submit documents.
select set_config('request.jwt.claim.sub', 'ca000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select extensions.is(
  public.current_knowledge_capabilities(),
  '{"canView": true, "canManage": true, "canApprove": false, "canViewConfidential": false, "canViewRestricted": false}'::jsonb,
  'capabilities reflect the permissions granted to the custom role'
);
select extensions.lives_ok(
  $$insert into public.knowledge_documents(id) values ('cc000000-0000-4000-8000-000000000001')$$,
  'granted uploader can create a document'
);
select extensions.lives_ok(
  $$insert into public.knowledge_document_versions(
      id, document_id, version_number, document_type, title, approval_status,
      access_scope, confidentiality, storage_path, original_filename, mime_type, file_size
    ) values
    ('cd000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001', 1,
      'procedure', 'Internal procedure', 'draft', 'organization', 'internal',
      'cb000000-0000-4000-8000-000000000001/cc000000-0000-4000-8000-000000000001/cd000000-0000-4000-8000-000000000001/a.pdf',
      'a.pdf', 'application/pdf', 100)$$,
  'granted uploader can register a draft version'
);
insert into public.knowledge_documents(id) values ('cc000000-0000-4000-8000-000000000002');
insert into public.knowledge_document_versions(
  id, document_id, version_number, document_type, title, approval_status,
  access_scope, confidentiality, storage_path, original_filename, mime_type, file_size
) values
  ('cd000000-0000-4000-8000-000000000002', 'cc000000-0000-4000-8000-000000000002', 1,
    'policy', 'Confidential policy', 'draft', 'organization', 'confidential',
    'cb000000-0000-4000-8000-000000000001/cc000000-0000-4000-8000-000000000002/cd000000-0000-4000-8000-000000000002/b.pdf',
    'b.pdf', 'application/pdf', 100);

select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
update public.knowledge_document_versions set uploaded_at = now()
where id in ('cd000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select extensions.lives_ok(
  $$select public.transition_knowledge_version(id, 'pending_review') from public.knowledge_document_versions
    where id in ('cd000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000002')$$,
  'granted uploader can submit for approval'
);
select extensions.throws_ok(
  $$update public.knowledge_document_versions set approval_status = 'approved'
    where id = 'cd000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'uploader without approve permission cannot approve'
);

-- A custom role granted only approve rights can decide but not author.
select set_config('request.jwt.claim.sub', 'ca000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$insert into public.knowledge_documents(id) values ('cc000000-0000-4000-8000-000000000009')$$,
  '42501', null, 'approver without manage permission cannot create documents'
);
select extensions.is(
  (select count(*)::int from public.knowledge_document_versions where approval_status = 'pending_review'),
  2, 'approver can see versions awaiting review'
);
select extensions.lives_ok(
  $$select public.transition_knowledge_version(id, 'approved') from public.knowledge_document_versions
    where id in ('cd000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000002')$$,
  'granted approver can approve'
);
select extensions.ok(
  (select bool_and(approved_by = 'ca000000-0000-4000-8000-000000000003')
   from public.knowledge_document_versions where approval_status = 'approved'),
  'approval is attributed to the authenticated approver'
);

-- Readers see exactly what their granted view permissions allow.
select set_config('request.jwt.claim.sub', 'ca000000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select array_agg(title order by title) from public.knowledge_document_versions),
  array['Internal procedure']::text[],
  'reader with view permission sees internal but not confidential documents'
);
select set_config('request.jwt.claim.sub', 'ca000000-0000-4000-8000-000000000006', true);
select extensions.is(
  (select array_agg(title order by title) from public.knowledge_document_versions),
  array['Confidential policy', 'Internal procedure']::text[],
  'view_confidential_knowledge grant unlocks confidential documents'
);
select set_config('request.jwt.claim.sub', 'ca000000-0000-4000-8000-000000000005', true);
select extensions.is(
  (select count(*)::int from public.knowledge_documents), 0,
  'custom role without view permission sees no documents'
);
select extensions.is(
  (select count(*)::int from storage.objects where bucket_id = 'qhse-knowledge'), 0,
  'custom role without view permission cannot read stored files'
);

-- Super Administrator always holds every knowledge permission.
select set_config('request.jwt.claim.sub', 'ca000000-0000-4000-8000-000000000001', true);
select extensions.is(
  public.current_knowledge_capabilities(),
  '{"canView": true, "canManage": true, "canApprove": true, "canViewConfidential": true, "canViewRestricted": true}'::jsonb,
  'Super Administrator holds every knowledge permission'
);

-- Revoking a role grant takes effect immediately.
reset role;
update public.custom_roles set permissions = '[]'::jsonb
where organization_id = 'cb000000-0000-4000-8000-000000000001' and name = 'Doc Reader';
select set_config('request.jwt.claim.sub', 'ca000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.is(
  (select count(*)::int from public.knowledge_documents), 0,
  'revoking view_knowledge_documents removes document access'
);

select * from extensions.finish();
rollback;
