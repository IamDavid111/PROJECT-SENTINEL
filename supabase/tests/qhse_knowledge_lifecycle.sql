begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('da000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'lifecycle-manager@example.com', '', '{}', '{}', now(), now()),
  ('da000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'lifecycle-worker@example.com', '', '{}', '{}', now(), now()),
  ('da000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'lifecycle-other@example.com', '', '{}', '{}', now(), now());
insert into public.organizations(id, company_code, company_name, industry, company_size, country, state, contact_email, contact_phone)
values
  ('db000000-0000-4000-8000-000000000001', 'LIFECYCLE_ONE', 'Lifecycle One', 'Testing', '1-10', 'Nigeria', 'Lagos', 'lifecycle-one@example.com', '12345678'),
  ('db000000-0000-4000-8000-000000000002', 'LIFECYCLE_TWO', 'Lifecycle Two', 'Testing', '1-10', 'Nigeria', 'Lagos', 'lifecycle-two@example.com', '12345678');
insert into public.profiles(id, organization_id, full_name, account_status)
values
  ('da000000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000001', 'Lifecycle Manager', 'active'),
  ('da000000-0000-4000-8000-000000000002', 'db000000-0000-4000-8000-000000000001', 'Lifecycle Worker', 'active'),
  ('da000000-0000-4000-8000-000000000003', 'db000000-0000-4000-8000-000000000002', 'Lifecycle Other Manager', 'active');
insert into public.memberships(user_id, organization_id, role)
values
  ('da000000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000001', 'QHSE Manager'),
  ('da000000-0000-4000-8000-000000000002', 'db000000-0000-4000-8000-000000000001', 'Field Worker'),
  ('da000000-0000-4000-8000-000000000003', 'db000000-0000-4000-8000-000000000002', 'QHSE Manager');

select set_config('request.jwt.claim.sub', 'da000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into public.knowledge_documents(id)
select ('dc000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 5) n;

-- Fixture helper registers drafts and simulates trusted upload verification, not AI indexing.
create function pg_temp.add_version(doc integer, revision integer, effective date, expiry date, confidentiality text default 'internal', uploaded boolean default true)
returns uuid language plpgsql as $$
declare
  version_id uuid := gen_random_uuid();
  document_id uuid := ('dc000000-0000-4000-8000-' || lpad(doc::text, 12, '0'))::uuid;
begin
  insert into public.knowledge_document_versions(
    id, document_id, version_number, document_type, title, effective_date, expiry_date,
    review_date, confidentiality, owner_id, uploaded_by, storage_path, original_filename, mime_type, file_size
  ) values (
    version_id, document_id, revision, 'procedure', 'Lifecycle test', effective, expiry,
    effective, confidentiality, auth.uid(), auth.uid(),
    'db000000-0000-4000-8000-000000000001/' || document_id || '/' || version_id || '/test.txt',
    'test.txt', 'text/plain', 52
  );
  if uploaded then
    perform set_config('request.jwt.claim.role', 'service_role', true);
    update public.knowledge_document_versions set uploaded_at = now() where id = version_id;
    perform set_config('request.jwt.claim.role', 'authenticated', true);
  end if;
  return version_id;
end;
$$;
create temp table fixtures(name text primary key, id uuid);
grant select on fixtures to authenticated, service_role;
insert into fixtures values
  ('valid', pg_temp.add_version(1, 1, (now() at time zone 'UTC')::date - 1, (now() at time zone 'UTC')::date + 1)),
  ('expired', pg_temp.add_version(2, 1, (now() at time zone 'UTC')::date - 3, (now() at time zone 'UTC')::date)),
  ('future', pg_temp.add_version(3, 1, (now() at time zone 'UTC')::date + 1, null)),
  ('missing_upload', pg_temp.add_version(4, 1, null, null, 'internal', false)),
  ('restricted', pg_temp.add_version(5, 1, null, null, 'restricted'));

set local role authenticated;
select extensions.throws_ok(
  $$update public.knowledge_document_versions set approval_status='approved' where id=(select id from fixtures where name='valid')$$,
  '42501', null, 'even a manager cannot manipulate status columns directly'
);
select extensions.throws_ok(
  $$update public.knowledge_documents set lifecycle_status='archived' where id='dc000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'even a manager cannot manipulate lifecycle columns directly'
);
select extensions.throws_ok(
  $$select public.transition_knowledge_version((select id from fixtures where name='valid'), 'approved')$$,
  '42501', null, 'approval cannot skip submission'
);
select extensions.throws_ok(
  $$select public.transition_knowledge_version((select id from fixtures where name='missing_upload'), 'pending_review')$$,
  '23514', null, 'submission requires trusted upload completion'
);
select extensions.is((select count(*)::integer from public.current_ai_knowledge_versions()), 0, 'drafts are not AI eligible');
select public.transition_knowledge_version(id, 'pending_review') from fixtures where name <> 'missing_upload';
select extensions.is((select count(*)::integer from public.current_ai_knowledge_versions()), 0, 'submitted versions are not AI eligible');
select extensions.ok(
  (select bool_and(submitted_by=auth.uid() and submitted_at is not null) from public.knowledge_document_versions where approval_status='pending_review'),
  'submission actor and timestamp are server-derived'
);
select public.transition_knowledge_version(id, 'approved') from fixtures where name <> 'missing_upload';
select extensions.ok(
  (select bool_and(approved_by=auth.uid() and approved_at is not null) from public.knowledge_document_versions where approval_status='approved'),
  'approval actor and timestamp are server-derived'
);
select extensions.is((select count(*)::integer from public.current_ai_knowledge_versions()), 2, 'only effective unexpired approvals are eligible; expiry day is excluded');
select extensions.is(
  (select count(*)::integer from public.current_ai_knowledge_versions() where id=(select id from fixtures where name='expired')),
  0, 'expired approvals cannot enter normal AI retrieval'
);
select extensions.is(
  (select count(*)::integer from public.current_ai_knowledge_versions() where id=(select id from fixtures where name='future')),
  0, 'future-effective approvals cannot enter normal AI retrieval'
);
select extensions.throws_ok(
  $$select public.begin_knowledge_extraction((select id from fixtures where name='expired'))$$,
  '23514', null, 'expired approvals cannot start extraction'
);
select extensions.throws_ok(
  $$select public.begin_knowledge_extraction((select id from fixtures where name='missing_upload'))$$,
  '23514', null, 'drafts cannot start extraction'
);
select extensions.is(
  (select retrieval_state from public.knowledge_version_ai_status((select id from fixtures where name='future'))),
  'scheduled', 'future-effective approvals are scheduled (pre-indexable, not retrievable until effective)'
);
select extensions.lives_ok(
  $$select public.begin_knowledge_extraction((select id from fixtures where name='valid'))$$,
  'eligible authorized approval can start extraction'
);
select extensions.throws_ok(
  $$select public.begin_knowledge_extraction((select id from fixtures where name='valid'))$$,
  '55P03', null, 'concurrent processing is explicitly rejected'
);
select extensions.is(
  (select status from public.knowledge_extraction_status((select id from fixtures where name='valid'))),
  'processing', 'safe processing status is available to the authorized manager'
);
select extensions.throws_ok(
  $$select * from public.knowledge_extractions$$, '42501', null, 'browser cannot read extracted text'
);
select extensions.throws_ok(
  $$select public.finish_knowledge_extraction(gen_random_uuid(),gen_random_uuid(),'forged',repeat('a',64))$$,
  '42501', null, 'browser cannot fabricate extraction results'
);
reset role;
set local role service_role;
select extensions.lives_ok(
  $$select set_config('request.jwt.claim.role', 'service_role', true)$$,
  'trusted worker fixture has service claims'
);
select extensions.lives_ok(
  $$select public.finish_knowledge_extraction(id,attempt_id,'Actual extracted procedure text',repeat('a',64))
    from public.knowledge_extractions where version_id=(select id from fixtures where name='valid')$$,
  'trusted worker persists extraction result'
);
select extensions.is(
  (select extracted_text from public.knowledge_chunking_candidates where version_id=(select id from fixtures where name='valid')),
  'Actual extracted procedure text', 'successful eligible extraction is available for future chunking'
);
select extensions.throws_ok(
  $$select public.finish_knowledge_extraction(id,attempt_id,'overwrite',repeat('b',64))
    from public.knowledge_extractions where version_id=(select id from fixtures where name='valid')$$,
  '23514', null, 'completed attempts cannot be overwritten'
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select extensions.throws_ok(
  $$update public.knowledge_document_versions set title='Changed approved metadata' where id=(select id from fixtures where name='valid')$$,
  '42501', null, 'approved metadata and dates remain immutable'
);
select extensions.throws_ok(
  $$update public.knowledge_document_versions set approved_by=auth.uid(), submitted_at=now() where id=(select id from fixtures where name='valid')$$,
  '42501', null, 'clients cannot forge lifecycle evidence'
);
select extensions.throws_ok(
  $$select count(*) from public.knowledge_ai_index_candidates$$,
  '42501', null, 'authenticated clients cannot use service-only index candidates'
);
reset role;
update public.memberships set role='Safety Officer / HSE Officer'
where user_id='da000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.knowledge_document_versions where id=(select id from fixtures where name='restricted')),
  1, 'governance permissions allow restricted-version review'
);
select extensions.is(
  (select count(*)::integer from public.current_ai_knowledge_versions() where id=(select id from fixtures where name='restricted')),
  0, 'governance review permission does not bypass AI confidentiality'
);
reset role;
update public.memberships set role='QHSE Manager'
where user_id='da000000-0000-4000-8000-000000000001';
set local role service_role;
select extensions.is(
  (select count(*)::integer from public.knowledge_ai_index_candidates where organization_id='db000000-0000-4000-8000-000000000001'),
  2, 'service indexing boundary excludes draft, expired and future content too'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'da000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.begin_knowledge_extraction((select id from fixtures where name='valid'))$$,
  '42501', null, 'ordinary readers cannot trigger extraction'
);
select extensions.is((select count(*)::integer from public.current_ai_knowledge_versions()), 1, 'AI reads enforce confidentiality, not governance access');
select extensions.throws_ok(
  $$select public.transition_knowledge_version((select id from fixtures where name='valid'), 'approved')$$,
  '42501', null, 'ordinary readers cannot decide approvals'
);
select extensions.throws_ok(
  $$select public.transition_knowledge_document('dc000000-0000-4000-8000-000000000001', 'archived')$$,
  '42501', null, 'ordinary readers cannot archive'
);
select set_config('request.jwt.claim.sub', 'da000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select public.begin_knowledge_extraction((select id from fixtures where name='valid'))$$,
  '42501', null, 'other organization cannot trigger extraction'
);
select extensions.is(
  (select count(*)::integer from public.knowledge_extraction_status((select id from fixtures where name='valid'))),
  0, 'other organization cannot read processing status'
);
select extensions.is((select count(*)::integer from public.current_ai_knowledge_versions()), 0, 'another organization cannot retrieve AI metadata');
select extensions.throws_ok(
  $$select public.transition_knowledge_document('dc000000-0000-4000-8000-000000000001', 'active')$$,
  '42501', null, 'another organization manager cannot restore'
);
select set_config('request.jwt.claim.sub', 'da000000-0000-4000-8000-000000000001', true);
reset role;
insert into fixtures values ('replacement', pg_temp.add_version(1, 2, null, null));
set local role authenticated;
select public.transition_knowledge_version((select id from fixtures where name='replacement'), 'pending_review');
select extensions.is(
  (select id from public.current_ai_knowledge_versions() where document_id='dc000000-0000-4000-8000-000000000001'),
  (select id from fixtures where name='valid'), 'pending replacement does not displace the approved current version'
);
select extensions.throws_ok(
  $$select public.transition_knowledge_version((select id from fixtures where name='replacement'), 'rejected', ' ')$$,
  '22023', null, 'rejection requires a nonempty reason'
);
select public.transition_knowledge_version((select id from fixtures where name='replacement'), 'rejected', 'Needs correction');
select extensions.ok(
  (select rejected_by=auth.uid() and rejected_at is not null and rejection_reason='Needs correction'
    from public.knowledge_document_versions where id=(select id from fixtures where name='replacement')),
  'rejection metadata records the actor, date and reason'
);
select extensions.is(
  (select count(*)::integer from public.current_ai_knowledge_versions() where id=(select id from fixtures where name='replacement')),
  0, 'rejected versions are never AI eligible'
);
select extensions.is(
  (select id from public.current_ai_knowledge_versions() where document_id='dc000000-0000-4000-8000-000000000001'),
  (select id from fixtures where name='valid'), 'rejection preserves current approval'
);
reset role;
insert into fixtures values ('future_replacement', pg_temp.add_version(1, 3, (now() at time zone 'UTC')::date + 1, null));
set local role authenticated;
select public.transition_knowledge_version((select id from fixtures where name='future_replacement'), 'pending_review');
select public.transition_knowledge_version((select id from fixtures where name='future_replacement'), 'approved');
select extensions.is(
  (select id from public.current_ai_knowledge_versions() where document_id='dc000000-0000-4000-8000-000000000001'),
  (select id from fixtures where name='valid'), 'future approval waits without prematurely displacing effective approval'
);
select public.transition_knowledge_document('dc000000-0000-4000-8000-000000000001', 'archived');
reset role;
set local role service_role;
select extensions.is(
  (select count(*)::integer from public.knowledge_chunking_candidates where version_id=(select id from fixtures where name='valid')),
  0, 'archive immediately removes existing extraction from chunking candidates'
);
select extensions.is(
  (select status from public.knowledge_extractions where version_id=(select id from fixtures where name='valid')),
  'succeeded', 'historical extraction remains stored after archive'
);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.current_ai_knowledge_versions() where document_id='dc000000-0000-4000-8000-000000000001'),
  0, 'archive immediately excludes all versions from AI'
);
select extensions.is(
  (select count(*)::integer from public.knowledge_document_versions where document_id='dc000000-0000-4000-8000-000000000001'),
  3, 'archived version history remains traceable by authorized governance users'
);
select public.transition_knowledge_document('dc000000-0000-4000-8000-000000000001', 'active');
select public.begin_knowledge_extraction((select id from fixtures where name='valid'));
select public.transition_knowledge_document('dc000000-0000-4000-8000-000000000001', 'archived');
reset role;
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select extensions.is(
  (select public.finish_knowledge_extraction(id,attempt_id,'Actual text',repeat('a',64))
    from public.knowledge_extractions where version_id=(select id from fixtures where name='valid')),
  'failed', 'archive during processing rejects success at completion'
);
select extensions.ok(
  (select extracted_text is null and error_code='eligibility_changed'
    from public.knowledge_extractions where version_id=(select id from fixtures where name='valid')),
  'changed eligibility records explicit failure without available text'
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select public.transition_knowledge_document('dc000000-0000-4000-8000-000000000001', 'active');
select public.begin_knowledge_extraction((select id from fixtures where name='valid'));
reset role;
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select extensions.is(
  (select public.finish_knowledge_extraction(id,attempt_id,null,null,'invalid_document','Document parsing failed.')
    from public.knowledge_extractions where version_id=(select id from fixtures where name='valid')),
  'failed', 'parser failures are stored explicitly'
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select extensions.is(
  (select error_code from public.knowledge_extraction_status((select id from fixtures where name='valid'))),
  'invalid_document', 'safe parser failure code is available for status checks'
);
select extensions.is(
  (select id from public.current_ai_knowledge_versions() where document_id='dc000000-0000-4000-8000-000000000001'),
  (select id from fixtures where name='valid'), 'restore re-evaluates eligibility rather than changing approval history'
);
reset role;
insert into fixtures values ('expired_replacement', pg_temp.add_version(1, 4, (now() at time zone 'UTC')::date - 2, (now() at time zone 'UTC')::date - 1));
set local role authenticated;
select public.transition_knowledge_version((select id from fixtures where name='expired_replacement'), 'pending_review');
select public.transition_knowledge_version((select id from fixtures where name='expired_replacement'), 'approved');
select extensions.is(
  (select count(*)::integer from public.current_ai_knowledge_versions() where document_id='dc000000-0000-4000-8000-000000000001'),
  0, 'expired replacement cannot resurrect an older approval'
);
select public.transition_knowledge_document('dc000000-0000-4000-8000-000000000001', 'archived');
select public.transition_knowledge_document('dc000000-0000-4000-8000-000000000001', 'active');
select extensions.is(
  (select count(*)::integer from public.current_ai_knowledge_versions() where document_id='dc000000-0000-4000-8000-000000000001'),
  0, 'restore cannot make expired content eligible'
);
reset role;
insert into public.knowledge_documents(id) values ('dc000000-0000-4000-8000-000000000006');
insert into fixtures values
  ('internal_previous', pg_temp.add_version(6, 1, null, null)),
  ('restricted_replacement', pg_temp.add_version(6, 2, null, null, 'restricted'));
set local role authenticated;
select public.transition_knowledge_version((select id from fixtures where name='internal_previous'), 'pending_review');
select public.transition_knowledge_version((select id from fixtures where name='internal_previous'), 'approved');
select public.transition_knowledge_version((select id from fixtures where name='restricted_replacement'), 'pending_review');
select public.transition_knowledge_version((select id from fixtures where name='restricted_replacement'), 'approved');
select set_config('request.jwt.claim.sub', 'da000000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.current_ai_knowledge_versions() where document_id='dc000000-0000-4000-8000-000000000006'),
  0, 'AI retrieval never falls back past an inaccessible current approval'
);
select set_config('request.jwt.claim.sub', 'da000000-0000-4000-8000-000000000001', true);
reset role;
select extensions.is(
  (select count(*)::integer from public.activity_logs where organization_id='db000000-0000-4000-8000-000000000001'
    and metadata->>'event_code' = 'knowledge_version_rejected'),
  1, 'rejection emits one durable activity event'
);
select extensions.ok(
  exists (select 1 from public.activity_logs where metadata->>'event_code'='knowledge_version_approved'
    and organization_id='db000000-0000-4000-8000-000000000001' and user_id='da000000-0000-4000-8000-000000000001'),
  'approvals use existing organization-scoped activity audit'
);
select extensions.ok(
  exists (select 1 from public.activity_logs where metadata->>'event_code'='knowledge_document_archived'
    and metadata->>'document_id'='dc000000-0000-4000-8000-000000000001'),
  'archive audit retains document identity'
);
set local role anon;
select extensions.throws_ok(
  $$select * from public.current_ai_knowledge_versions()$$, '42501', null, 'anonymous AI eligibility reads are forbidden'
);
reset role;
select * from extensions.finish();
rollback;
