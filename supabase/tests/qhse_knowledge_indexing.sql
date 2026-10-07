begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('ea000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'authenticated','authenticated','index-' || n || '@example.com','','{}','{}',now(),now()
from generate_series(1,3) n;
insert into public.organizations(id, company_code, company_name, industry, company_size, country, state, contact_email, contact_phone)
select ('eb000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'INDEX_' || n,'Chunk test','Testing','1-10','Nigeria','Lagos','chunk@example.com','12345678'
from generate_series(1,2) n;
insert into public.profiles(id, organization_id, full_name, account_status)
select ('ea000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  ('eb000000-0000-4000-8000-' || lpad((case when n=3 then 2 else 1 end)::text,12,'0'))::uuid,
  'Chunk tester','active' from generate_series(1,3) n;
insert into public.memberships(user_id, organization_id, role)
select id,organization_id,case when id='ea000000-0000-4000-8000-000000000002' then 'Field Worker' else 'QHSE Manager' end
from public.profiles where id::text like 'ea000000-%';
select set_config('request.jwt.claim.sub','ea000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into public.knowledge_documents(id)
select ('ec000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid from generate_series(1,6) n;
create temp table fixture(n integer, version_id uuid, content text);
grant select on fixture to authenticated, service_role;
insert into fixture
select n,gen_random_uuid(),case when n=1 then repeat(E'Energy isolation.\n',140) || 'End.'
  when n=2 then repeat(chr(128512),1201) || E'\n  tail  '
  when n=3 then repeat('x',1200) else 'Short source text' end from generate_series(1,6) n;
insert into public.knowledge_document_versions(id,document_id,version_number,document_type,title,
  storage_path,original_filename,mime_type,file_size,expiry_date)
select version_id,('ec000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,1,'procedure','Chunk source',
  'eb000000-0000-4000-8000-000000000001/ec000000-0000-4000-8000-' || lpad(n::text,12,'0') || '/' || version_id || '/source.txt',
  'source.txt','text/plain',100,case when n=5 then (now() at time zone 'UTC')::date-1 end from fixture;
select set_config('request.jwt.claim.role','service_role',true);
update public.knowledge_document_versions set uploaded_at=now() where id in (select version_id from fixture);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.transition_knowledge_version(version_id,'pending_review') from fixture where n<>6;
select public.transition_knowledge_version(version_id,'approved') from fixture where n<>6;
select public.begin_knowledge_extraction(version_id) from fixture where n<=3;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select public.finish_knowledge_extraction(e.id,e.attempt_id,f.content,repeat('a',64))
from public.knowledge_extractions e join fixture f on e.version_id=f.version_id;
-- Indexing fixtures: n=1 approved with 3 chunks; n=4 approved without chunks; n=6 draft.
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.chunk_knowledge_document(version_id) from fixture where n=1;
select extensions.throws_ok($$select public.begin_knowledge_indexing((select version_id from fixture where n=6),'text-embedding-3-small')$$,'23514',null,'draft cannot be indexed');
select extensions.throws_ok($$select public.begin_knowledge_indexing((select version_id from fixture where n=4),'text-embedding-3-small')$$,'23514',null,'approved version without chunks cannot be indexed');
select extensions.throws_ok($$select public.begin_knowledge_indexing((select version_id from fixture where n=1),'Bad Model!')$$,'23514',null,'unsafe model label rejected');
select extensions.ok((select count(*)=1 from public.begin_knowledge_indexing((select version_id from fixture where n=1),'text-embedding-3-small')),'manager can claim eligible chunked version');
select extensions.throws_ok($$select public.begin_knowledge_indexing((select version_id from fixture where n=1),'text-embedding-3-small')$$,'55P03',null,'concurrent indexing claim is blocked');
select extensions.throws_ok($$select public.finish_knowledge_indexing(gen_random_uuid(),gen_random_uuid(),'[]')$$,'42501',null,'browser cannot complete indexing or write vectors');
select extensions.throws_ok($$select * from public.knowledge_chunk_embeddings$$,'42501',null,'browser cannot read vectors');
select extensions.throws_ok($$select * from public.knowledge_current_embeddings$$,'42501',null,'browser cannot read retrieval view');
select extensions.throws_ok($$select * from public.knowledge_indexing_runs$$,'42501',null,'browser cannot read raw indexing runs');
reset role;
create temp table vec as select jsonb_agg(jsonb_build_object('chunk_id',c.id,'embedding',
  (select jsonb_agg(0.01) from generate_series(1,1536)))) v from public.knowledge_chunks c
  where c.version_id=(select version_id from fixture where n=1);
select set_config('request.jwt.claim.role','service_role',true);
select extensions.is(public.finish_knowledge_indexing(r.id,r.attempt_id,(select jsonb_path_query_array(v,'$[0]') from vec)),'failed','partial vector set is rejected')
from public.knowledge_indexing_runs r;
select extensions.is((select error_code from public.knowledge_indexing_runs),'chunk_set_changed','partial set records safe error');
select extensions.is((select count(*)::integer from public.knowledge_chunk_embeddings),0,'no partial vectors stored');
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.begin_knowledge_indexing((select version_id from fixture where n=1),'text-embedding-3-small');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select extensions.is(public.finish_knowledge_indexing(r.id,r.attempt_id,(select v from vec)),'succeeded','full current chunk set is indexed')
from public.knowledge_indexing_runs r;
select extensions.ok((select count(*)=3 and bool_and(e.organization_id=c.organization_id and e.version_id=c.version_id and e.document_id=c.document_id)
  from public.knowledge_chunk_embeddings e join public.knowledge_chunks c on c.id=e.chunk_id),'each vector keeps its chunk/version/org identity');
select extensions.is((select count(*)::integer from public.knowledge_current_embeddings),3,'eligible vectors are retrievable by the service');
select extensions.throws_ok($$update public.knowledge_chunk_embeddings set organization_id='eb000000-0000-4000-8000-000000000002'$$,'23503',null,'vectors cannot move to another organization');
select extensions.is((select count(*)::integer from public.activity_logs where metadata->>'event_code' in ('knowledge_indexing_succeeded','knowledge_indexing_failed')),2,'indexing outcomes are audited');
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select extensions.is((select status from public.knowledge_indexing_status((select version_id from fixture where n=1))),'succeeded','authorized reader sees safe status');
select set_config('request.jwt.claim.sub','ea000000-0000-4000-8000-000000000003',true);
select extensions.throws_ok($$select public.begin_knowledge_indexing((select version_id from fixture where n=1),'text-embedding-3-small')$$,'42501',null,'other organization cannot index');
select extensions.is((select count(*)::integer from public.knowledge_indexing_status((select version_id from fixture where n=1))),0,'other organization cannot read status');
select set_config('request.jwt.claim.sub','ea000000-0000-4000-8000-000000000002',true);
select extensions.throws_ok($$select public.begin_knowledge_indexing((select version_id from fixture where n=1),'text-embedding-3-small')$$,'42501',null,'ordinary reader cannot index');
select set_config('request.jwt.claim.sub','ea000000-0000-4000-8000-000000000001',true);
select public.transition_knowledge_document('ec000000-0000-4000-8000-000000000001','archived');
reset role;
select extensions.is((select count(*)::integer from public.knowledge_current_embeddings),0,'archived document vectors are excluded from retrieval');
select extensions.is((select count(*)::integer from public.knowledge_chunk_embeddings),3,'archived vectors remain historical');
select * from extensions.finish();
rollback;
