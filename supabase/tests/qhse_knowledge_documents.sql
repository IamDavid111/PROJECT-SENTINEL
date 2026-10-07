begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(72);

select extensions.has_table('public', 'knowledge_documents', 'knowledge document lifecycle table exists');
select extensions.has_table('public', 'knowledge_document_versions', 'versioned document metadata table exists');
select extensions.has_column('public', 'knowledge_document_versions', 'site_id', 'documents can be site scoped');
select extensions.has_column('public', 'knowledge_document_versions', 'department', 'documents can be department scoped');
select extensions.has_column('public', 'knowledge_document_versions', 'approval_status', 'document approval status is stored');
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.knowledge_documents'::regclass),
  'document lifecycle RLS is enabled'
);
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.knowledge_document_versions'::regclass),
  'document version RLS is enabled'
);
select extensions.ok(
  exists (select 1 from storage.buckets where id = 'qhse-knowledge' and public = false),
  'knowledge files use a private storage bucket'
);
select extensions.ok(
  (select file_size_limit = 104857600
      and allowed_mime_types @> array[
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'
      ]::text[]
   from storage.buckets where id = 'qhse-knowledge'),
  'knowledge bucket enforces supported document types and a 100 MB limit'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.knowledge_documents', 'delete')
  and not has_table_privilege('authenticated', 'public.knowledge_document_versions', 'delete'),
  'authenticated users cannot delete documents or historical versions'
);

insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('bc000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'knowledge-manager@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('bc000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'knowledge-worker@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('bc000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'knowledge-other-org@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('bc000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'knowledge-site-supervisor@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.organizations(id, company_code, company_name, industry, company_size, country, state, contact_email, contact_phone)
values
  ('bd000000-0000-4000-8000-000000000001', 'KNOWLEDGE_ONE', 'Knowledge One', 'Testing', '1-10', 'Nigeria', 'Lagos', 'knowledge-one@example.com', '12345678'),
  ('bd000000-0000-4000-8000-000000000002', 'KNOWLEDGE_TWO', 'Knowledge Two', 'Testing', '1-10', 'Nigeria', 'Lagos', 'knowledge-two@example.com', '12345678');
insert into public.profiles(id, organization_id, full_name, account_status)
values
  ('bc000000-0000-4000-8000-000000000001', 'bd000000-0000-4000-8000-000000000001', 'Knowledge Manager', 'active'),
  ('bc000000-0000-4000-8000-000000000002', 'bd000000-0000-4000-8000-000000000001', 'Knowledge Worker', 'active'),
  ('bc000000-0000-4000-8000-000000000003', 'bd000000-0000-4000-8000-000000000002', 'Other Organization Manager', 'active'),
  ('bc000000-0000-4000-8000-000000000004', 'bd000000-0000-4000-8000-000000000001', 'Knowledge Site Supervisor', 'active');
insert into public.memberships(user_id, organization_id, role)
values
  ('bc000000-0000-4000-8000-000000000001', 'bd000000-0000-4000-8000-000000000001', 'QHSE Manager'),
  ('bc000000-0000-4000-8000-000000000002', 'bd000000-0000-4000-8000-000000000001', 'Field Worker'),
  ('bc000000-0000-4000-8000-000000000003', 'bd000000-0000-4000-8000-000000000002', 'QHSE Manager'),
  ('bc000000-0000-4000-8000-000000000004', 'bd000000-0000-4000-8000-000000000001', 'Site Supervisor');
insert into public.sites(id, organization_id, name, code)
values
  ('be000000-0000-4000-8000-000000000001', 'bd000000-0000-4000-8000-000000000001', 'Knowledge Site', 'KNOWLEDGE_SITE'),
  ('be000000-0000-4000-8000-000000000002', 'bd000000-0000-4000-8000-000000000002', 'Other Site', 'OTHER_SITE');

select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$insert into public.knowledge_documents(id, organization_id, created_by)
    values ('bf000000-0000-4000-8000-000000000001',
      'bd000000-0000-4000-8000-000000000002',
      'bc000000-0000-4000-8000-000000000002')$$,
  'document creation ignores forged tenant and creator IDs'
);
select extensions.is(
  (select organization_id::text from public.knowledge_documents where id = 'bf000000-0000-4000-8000-000000000001'),
  'bd000000-0000-4000-8000-000000000001',
  'document tenant is derived from the signed-in user profile'
);
select extensions.is(
  (select created_by::text from public.knowledge_documents where id = 'bf000000-0000-4000-8000-000000000001'),
  'bc000000-0000-4000-8000-000000000001',
  'document creator is derived from the signed-in identity'
);
select extensions.lives_ok(
  $$insert into public.knowledge_document_versions(
      id, document_id, organization_id, version_number, document_type, title,
      site_id, owner_id, approval_status, access_scope, confidentiality,
      storage_path, original_filename, mime_type, file_size, uploaded_by
    ) values (
      'c0000000-0000-4000-8000-000000000001',
      'bf000000-0000-4000-8000-000000000001',
      'bd000000-0000-4000-8000-000000000002', 1, 'procedure', 'Emergency Procedure',
      null, 'bc000000-0000-4000-8000-000000000002', 'draft', 'organization', 'internal',
      'bd000000-0000-4000-8000-000000000001/bf000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001/emergency.pdf',
      'emergency.pdf', 'application/pdf', 100, 'bc000000-0000-4000-8000-000000000003'
    )$$,
  'version creation ignores forged tenant, owner and uploader IDs'
);
select extensions.is(
  (select organization_id::text || ':' || owner_id::text || ':' || uploaded_by::text
   from public.knowledge_document_versions where id = 'c0000000-0000-4000-8000-000000000001'),
  'bd000000-0000-4000-8000-000000000001:bc000000-0000-4000-8000-000000000002:bc000000-0000-4000-8000-000000000001',
  'version tenant and uploader are server-derived and owner is validated within the tenant'
);
select extensions.throws_ok(
  $$insert into public.knowledge_document_versions(
      id, document_id, organization_id, version_number, document_type, title,
      access_scope, confidentiality, storage_path, original_filename, mime_type,
      file_size, owner_id, uploaded_by
    ) values (
      'c0000000-0000-4000-8000-000000000005',
      'bf000000-0000-4000-8000-000000000001',
      'bd000000-0000-4000-8000-000000000002', 2, 'procedure', 'Invalid owner',
      'organization', 'internal',
      'bd000000-0000-4000-8000-000000000001/bf000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000005/invalid.pdf',
      'invalid.pdf', 'application/pdf', 100,
      'bc000000-0000-4000-8000-000000000003', 'bc000000-0000-4000-8000-000000000003'
    )$$,
  '42501', null, 'assigned document owner must belong to the active organization'
);
select extensions.lives_ok(
  $$insert into public.knowledge_document_versions(
      id, document_id, organization_id, version_number, document_type, title,
      access_scope, confidentiality, storage_path, original_filename, mime_type,
      file_size, owner_id, uploaded_by
    ) values (
      'c0000000-0000-4000-8000-000000000002',
      'bf000000-0000-4000-8000-000000000001',
      'bd000000-0000-4000-8000-000000000002', 2, 'procedure', 'Emergency Procedure - Revised',
      'organization', 'internal',
      'bd000000-0000-4000-8000-000000000001/bf000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000002/emergency-v2.pdf',
      'emergency-v2.pdf', 'application/pdf', 120,
      'bc000000-0000-4000-8000-000000000002', 'bc000000-0000-4000-8000-000000000003'
    )$$,
  'a second sequential version can be added'
);
select extensions.is(
  (select count(*)::int from public.knowledge_document_versions where document_id = 'bf000000-0000-4000-8000-000000000001'),
  2,
  'prior document versions remain available'
);
select extensions.throws_ok(
  $$update public.knowledge_document_versions set storage_path = 'forged/path.pdf'
    where id = 'c0000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'a version storage reference cannot be overwritten'
);
select extensions.lives_ok(
  $$update public.knowledge_document_versions set title = 'Emergency Procedure - Working Draft'
    where id = 'c0000000-0000-4000-8000-000000000002'$$,
  'editable draft metadata can be revised before submission'
);
select extensions.throws_ok(
  $$select public.transition_knowledge_version('c0000000-0000-4000-8000-000000000002', 'pending_review')$$,
  '23514', null, 'drafts cannot be submitted before the registered file is uploaded'
);
select extensions.lives_ok(
  $$insert into storage.objects(id, bucket_id, name, owner, owner_id, metadata)
    values (
      'd0000000-0000-4000-8000-000000000001',
      'qhse-knowledge',
      'bd000000-0000-4000-8000-000000000001/bf000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000002/emergency-v2.pdf',
      'bc000000-0000-4000-8000-000000000001',
      'bc000000-0000-4000-8000-000000000001',
      '{"mimetype":"application/pdf","size":120}'::jsonb
    )$$,
  'registered draft accepts its reserved private storage object'
);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select extensions.lives_ok(
  $$update public.knowledge_document_versions set uploaded_at = now()
    where id = 'c0000000-0000-4000-8000-000000000002' and uploaded_at is null$$,
  'trusted upload completion records that the reserved object exists'
);
reset role;
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.transition_knowledge_version('c0000000-0000-4000-8000-000000000002', 'pending_review')$$,
  'uploaded draft can be explicitly submitted for approval'
);
select extensions.throws_ok(
  $$insert into storage.objects(id, bucket_id, name, owner, owner_id, metadata)
    values (
      'd0000000-0000-4000-8000-000000000003',
      'qhse-knowledge',
      'bd000000-0000-4000-8000-000000000001/bf000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000099/unlinked.pdf',
      'bc000000-0000-4000-8000-000000000001',
      'bc000000-0000-4000-8000-000000000001',
      '{"mimetype":"application/pdf","size":100}'::jsonb
    )$$,
  '42501', null, 'manager cannot upload an object without a matching document version'
);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select extensions.is(
  (select count(*)::int from storage.objects
   where bucket_id = 'qhse-knowledge'
     and name = 'bd000000-0000-4000-8000-000000000001/bf000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000002/emergency-v2.pdf'),
  1,
  'registered version upload created the expected private storage object'
);
set local role authenticated;
select extensions.lives_ok(
  $$select public.transition_knowledge_version('c0000000-0000-4000-8000-000000000002', 'approved')$$,
  'authorized manager can approve a version'
);
select extensions.is(
  (select approved_by::text = 'bc000000-0000-4000-8000-000000000001'
      and approved_at is not null
   from public.knowledge_document_versions where id = 'c0000000-0000-4000-8000-000000000002'),
  true,
  'approval actor and timestamp are set by the database'
);
select extensions.is(
  (select count(*)::int from public.knowledge_document_versions v
   where v.storage_path = 'bd000000-0000-4000-8000-000000000001/bf000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000002/emergency-v2.pdf'
     and v.approval_status = 'approved'
     and public.can_read_knowledge_document_record(v.document_id, v.organization_id)
     and public.can_read_knowledge_document(v.organization_id, v.access_scope, v.confidentiality)),
  1,
  'approved version and its document permissions satisfy the storage download policy'
);
select extensions.lives_ok(
  $$insert into public.knowledge_documents(id, organization_id, created_by)
    values ('bf000000-0000-4000-8000-000000000002',
      'bd000000-0000-4000-8000-000000000001',
      'bc000000-0000-4000-8000-000000000001')$$,
  'second document can be created for access-scope checks'
);
select extensions.lives_ok(
  $$insert into public.knowledge_document_versions(
      id, document_id, organization_id, version_number, document_type, title,
      access_scope, confidentiality, storage_path, original_filename, mime_type,
      file_size, owner_id, uploaded_by
    ) values (
      'c0000000-0000-4000-8000-000000000003',
      'bf000000-0000-4000-8000-000000000002',
      'bd000000-0000-4000-8000-000000000001', 1, 'policy', 'Management Policy',
      'management', 'restricted',
      'bd000000-0000-4000-8000-000000000001/bf000000-0000-4000-8000-000000000002/c0000000-0000-4000-8000-000000000003/management.pdf',
      'management.pdf', 'application/pdf', 100,
      'bc000000-0000-4000-8000-000000000001', 'bc000000-0000-4000-8000-000000000001'
    )$$,
  'management-scoped version can be recorded'
);
select extensions.lives_ok(
  $$insert into public.knowledge_documents(id, organization_id, created_by)
    values ('bf000000-0000-4000-8000-000000000003',
      'bd000000-0000-4000-8000-000000000001',
      'bc000000-0000-4000-8000-000000000001')$$,
  'site-scoped document can be created'
);
select extensions.lives_ok(
  $$insert into public.knowledge_document_versions(
      id, document_id, organization_id, version_number, document_type, title,
      site_id, access_scope, confidentiality, storage_path, original_filename,
      mime_type, file_size, owner_id, uploaded_by
    ) values (
      'c0000000-0000-4000-8000-000000000004',
      'bf000000-0000-4000-8000-000000000003',
      'bd000000-0000-4000-8000-000000000001', 1, 'risk_assessment', 'Site Risk Assessment',
      'be000000-0000-4000-8000-000000000001', 'site', 'internal',
      'bd000000-0000-4000-8000-000000000001/bf000000-0000-4000-8000-000000000003/c0000000-0000-4000-8000-000000000004/site-risk.pdf',
      'site-risk.pdf', 'application/pdf', 100,
      'bc000000-0000-4000-8000-000000000001', 'bc000000-0000-4000-8000-000000000001'
    )$$,
  'site-scoped version can be recorded'
);
select extensions.lives_ok(
  $$insert into storage.objects(id, bucket_id, name, owner, owner_id, metadata)
    values (
      'd0000000-0000-4000-8000-000000000002',
      'qhse-knowledge',
      'bd000000-0000-4000-8000-000000000001/bf000000-0000-4000-8000-000000000003/c0000000-0000-4000-8000-000000000004/site-risk.pdf',
      'bc000000-0000-4000-8000-000000000001',
      'bc000000-0000-4000-8000-000000000001',
      '{"mimetype":"application/pdf","size":100}'::jsonb
    )$$,
  'site-scoped draft accepts its reserved private storage object'
);
set local role service_role;
select extensions.lives_ok(
  $$update public.knowledge_document_versions set uploaded_at = now()
    where id = 'c0000000-0000-4000-8000-000000000004' and uploaded_at is null$$,
  'trusted service records the site document upload'
);
reset role;
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.transition_knowledge_version('c0000000-0000-4000-8000-000000000004', 'pending_review')$$,
  'site-scoped draft is submitted for approval'
);
select extensions.lives_ok(
  $$select public.transition_knowledge_version('c0000000-0000-4000-8000-000000000004', 'approved')$$,
  'authorized manager can approve site-scoped material'
);
select extensions.throws_ok(
  $$insert into public.knowledge_document_versions(
      id, document_id, organization_id, version_number, document_type, title,
      site_id, access_scope, storage_path, original_filename, mime_type, file_size,
      owner_id, uploaded_by
    ) values (
      'c0000000-0000-4000-8000-000000000005',
      'bf000000-0000-4000-8000-000000000003',
      'bd000000-0000-4000-8000-000000000001', 2, 'risk_assessment', 'Wrong Site',
      'be000000-0000-4000-8000-000000000002', 'site',
      'bd000000-0000-4000-8000-000000000001/bf000000-0000-4000-8000-000000000003/c0000000-0000-4000-8000-000000000005/wrong.pdf',
      'wrong.pdf', 'application/pdf', 100,
      'bc000000-0000-4000-8000-000000000001', 'bc000000-0000-4000-8000-000000000001'
    )$$,
  '23503', null, 'site references cannot cross organization boundaries'
);
select extensions.throws_ok(
  $$insert into public.knowledge_document_versions(
      id, document_id, organization_id, version_number, document_type, title,
      access_scope, confidentiality, storage_path, original_filename, mime_type,
      file_size, owner_id, uploaded_by
    ) values (
      'c0000000-0000-4000-8000-000000000006',
      'bf000000-0000-4000-8000-000000000001',
      'bd000000-0000-4000-8000-000000000002', 3, 'procedure', 'Unsupported type',
      'organization', 'internal',
      'bd000000-0000-4000-8000-000000000001/bf000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000006/unsupported.exe',
      'unsupported.exe', 'application/octet-stream', 100,
      'bc000000-0000-4000-8000-000000000002', 'bc000000-0000-4000-8000-000000000001'
    )$$,
  '23514', null, 'unsupported document MIME types are rejected'
);
select extensions.throws_ok(
  $$insert into public.knowledge_document_versions(
      id, document_id, organization_id, version_number, document_type, title,
      access_scope, confidentiality, storage_path, original_filename, mime_type,
      file_size, owner_id, uploaded_by
    ) values (
      'c0000000-0000-4000-8000-000000000007',
      'bf000000-0000-4000-8000-000000000001',
      'bd000000-0000-4000-8000-000000000002', 3, 'procedure', 'Oversized file',
      'organization', 'internal',
      'bd000000-0000-4000-8000-000000000001/bf000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000007/oversized.pdf',
      'oversized.pdf', 'application/pdf', 104857601,
      'bc000000-0000-4000-8000-000000000002', 'bc000000-0000-4000-8000-000000000001'
    )$$,
  '23514', null, 'documents larger than 100 MB are rejected'
);

select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000002', true);
select extensions.is(
  public.can_read_knowledge_document_record(
    'bf000000-0000-4000-8000-000000000001',
    'bd000000-0000-4000-8000-000000000001'
  ),
  true,
  'ordinary member has access to an active document with an approved version'
);
select extensions.is(
  public.can_read_knowledge_document(
    'bd000000-0000-4000-8000-000000000001', 'organization', 'internal'
  ),
  true,
  'ordinary member meets organization scope and internal confidentiality'
);
select extensions.throws_ok(
  $$insert into storage.objects(id, bucket_id, name, owner, owner_id, metadata)
    values (
      'd0000000-0000-4000-8000-000000000002',
      'qhse-knowledge',
      'bd000000-0000-4000-8000-000000000001/bf000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000002/forged.pdf',
      'bc000000-0000-4000-8000-000000000002',
      'bc000000-0000-4000-8000-000000000002',
      '{"mimetype":"application/pdf","size":100}'::jsonb
    )$$,
  '42501', null, 'ordinary members cannot upload knowledge files'
);
select extensions.is(
  (select count(*)::int from storage.objects where bucket_id = 'qhse-knowledge'),
  1,
  'organization member can access only the approved file in their organization'
);
select extensions.throws_ok(
  $$insert into public.knowledge_documents(organization_id, created_by)
    values ('bd000000-0000-4000-8000-000000000001',
      'bc000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'ordinary members cannot create knowledge documents'
);
select extensions.is(
  (select count(*)::int from public.knowledge_documents), 1,
  'ordinary organization members only see organization-scoped active documents'
);
select extensions.is(
  (select count(*)::int from public.knowledge_document_versions), 1,
  'ordinary members cannot read drafts or pending versions'
);
select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select count(*)::int from public.knowledge_document_versions where document_id = 'bf000000-0000-4000-8000-000000000003'),
  1,
  'site supervisors can read site-scoped material'
);
select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000003', true);
select extensions.is(
  (select count(*)::int from public.knowledge_documents), 0,
  'another organization cannot read knowledge documents'
);
select extensions.is(
  (select count(*)::int from storage.objects where bucket_id = 'qhse-knowledge'),
  0,
  'another organization cannot list or download knowledge files'
);

select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select public.transition_knowledge_document('bf000000-0000-4000-8000-000000000001', 'archived')$$,
  'authorized manager can archive a document without deleting its versions'
);
select extensions.is(
  (select archived_at is not null from public.knowledge_documents where id = 'bf000000-0000-4000-8000-000000000001'),
  true,
  'archive timestamp is assigned by the database'
);
select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select count(*)::int from public.knowledge_documents where id = 'bf000000-0000-4000-8000-000000000001'),
  0,
  'archived documents are hidden from ordinary members'
);
select extensions.is(
  (select count(*)::int from public.knowledge_document_versions where document_id = 'bf000000-0000-4000-8000-000000000001'),
  0,
  'archiving also prevents direct reads of its historical files'
);

-- Approval authority: only same-organization document managers may decide reviews.
select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
update public.knowledge_document_versions set uploaded_at = now()
where id = 'c0000000-0000-4000-8000-000000000003';
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select public.transition_knowledge_version('c0000000-0000-4000-8000-000000000003', 'pending_review');
select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.transition_knowledge_version('c0000000-0000-4000-8000-000000000003', 'approved')$$,
  '42501', null, 'ordinary users cannot approve through RPC'
);
select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select public.transition_knowledge_version('c0000000-0000-4000-8000-000000000003', 'approved')$$,
  '42501', null, 'site supervisors cannot approve through RPC'
);
select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select public.transition_knowledge_version('c0000000-0000-4000-8000-000000000003', 'approved')$$,
  '42501', null, 'another organization manager cannot approve'
);
select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000001', true);
select extensions.is(
  (select approval_status from public.knowledge_document_versions
   where id = 'c0000000-0000-4000-8000-000000000003'),
  'pending_review', 'unauthorized approval attempts leave the version unchanged'
);
select extensions.lives_ok(
  $$select public.transition_knowledge_version('c0000000-0000-4000-8000-000000000003', 'approved')$$,
  'authorized manager can explicitly approve the uploaded version'
);

-- Scope/confidentiality applies to approved metadata, not only drafts.
select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select count(*)::int from public.knowledge_document_versions
   where id = 'c0000000-0000-4000-8000-000000000003'),
  0, 'ordinary users cannot read approved management-restricted metadata'
);
select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select count(*)::int from public.knowledge_document_versions
   where id = 'c0000000-0000-4000-8000-000000000003'),
  0, 'site supervisors cannot read approved management-restricted metadata'
);

-- History and workflow cannot be bypassed with direct SQL.
select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$update public.knowledge_document_versions set title = 'Changed approved title'
    where id = 'c0000000-0000-4000-8000-000000000003'$$,
  '42501', null, 'approved metadata cannot be overwritten'
);
select extensions.throws_ok(
  $$delete from public.knowledge_document_versions
    where id = 'c0000000-0000-4000-8000-000000000003'$$,
  '42501', null, 'managers cannot delete historical revisions'
);
select extensions.throws_ok(
  $$insert into public.knowledge_document_versions(
      id, document_id, organization_id, version_number, document_type, title,
      owner_id, uploaded_by, storage_path, original_filename, mime_type, file_size,
      approval_status
    ) values (
      'c0000000-0000-4000-8000-000000000009', 'bf000000-0000-4000-8000-000000000002',
      'bd000000-0000-4000-8000-000000000001', 2, 'procedure', 'Pre-submitted version',
      'bc000000-0000-4000-8000-000000000001', 'bc000000-0000-4000-8000-000000000001',
      'bd000000-0000-4000-8000-000000000001/bf000000-0000-4000-8000-000000000002/c0000000-0000-4000-8000-000000000009/missing.pdf',
      'missing.pdf', 'application/pdf', 100, 'pending_review'
    )$$,
  '23514', null, 'new versions cannot be inserted directly into review'
);
select extensions.lives_ok(
  $$insert into public.knowledge_document_versions(
      id, document_id, organization_id, version_number, document_type, title,
      owner_id, uploaded_by, storage_path, original_filename, mime_type, file_size
    ) values (
      'c0000000-0000-4000-8000-000000000008', 'bf000000-0000-4000-8000-000000000002',
      'bd000000-0000-4000-8000-000000000001', 2, 'procedure', 'Unuploaded draft',
      'bc000000-0000-4000-8000-000000000001', 'bc000000-0000-4000-8000-000000000001',
      'bd000000-0000-4000-8000-000000000001/bf000000-0000-4000-8000-000000000002/c0000000-0000-4000-8000-000000000008/missing.pdf',
      'missing.pdf', 'application/pdf', 100
    )$$,
  'a new draft revision can be registered'
);
select extensions.throws_ok(
  $$update public.knowledge_document_versions set approval_status = 'approved'
    where id = 'c0000000-0000-4000-8000-000000000008'$$,
  '42501', null, 'drafts cannot skip review and be approved directly'
);
select extensions.throws_ok(
  $$select public.transition_knowledge_version('c0000000-0000-4000-8000-000000000008', 'pending_review')$$,
  '23514', null, 'drafts without a verified upload cannot enter review'
);

-- Archived documents are frozen until explicitly restored.
select extensions.throws_ok(
  $$update public.knowledge_document_versions set title = 'Edited while archived'
    where id = 'c0000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'archived document drafts cannot be edited'
);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select extensions.throws_ok(
  $$update public.knowledge_document_versions set uploaded_at = now()
    where id = 'c0000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'archived document drafts cannot complete uploads'
);
reset role;
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.transition_knowledge_document('bf000000-0000-4000-8000-000000000001', 'active')$$,
  'authorized manager can restore an archived document'
);
select extensions.is(
  (select count(*)::int from public.knowledge_document_versions
   where document_id = 'bf000000-0000-4000-8000-000000000001'),
  2, 'archive and restore preserve every historical revision'
);
select extensions.lives_ok(
  $$update public.knowledge_document_versions set title = 'Edited after restore'
    where id = 'c0000000-0000-4000-8000-000000000001'$$,
  'restored document drafts become editable again'
);

select * from extensions.finish();
rollback;
