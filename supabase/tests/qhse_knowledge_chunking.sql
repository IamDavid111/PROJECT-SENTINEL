begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('ea000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'authenticated','authenticated','chunk-' || n || '@example.com','','{}','{}',now(),now()
from generate_series(1,3) n;
insert into public.organizations(id, company_code, company_name, industry, company_size, country, state, contact_email, contact_phone)
select ('eb000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'CHUNK_' || n,'Chunk test','Testing','1-10','Nigeria','Lagos','chunk@example.com','12345678'
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
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select extensions.is(public.chunk_knowledge_document((select version_id from fixture where n=1)),3,'long source has three ordered chunks');
select extensions.is(public.chunk_knowledge_document((select version_id from fixture where n=2)),2,'Unicode uses character not byte boundaries');
select extensions.is(public.chunk_knowledge_document((select version_id from fixture where n=3)),1,'exact boundary has no empty trailing chunk');
select extensions.throws_ok($$select public.chunk_knowledge_document((select version_id from fixture where n=4))$$,'23514',null,'missing extraction fails explicitly');
select extensions.throws_ok($$select public.chunk_knowledge_document((select version_id from fixture where n=5))$$,'23514',null,'expired approval cannot be chunked');
select extensions.throws_ok($$select public.chunk_knowledge_document((select version_id from fixture where n=6))$$,'23514',null,'draft cannot be chunked');
select extensions.throws_ok($$select * from public.knowledge_chunks$$,'42501',null,'browser cannot read raw chunks');
select extensions.throws_ok($$select * from public.knowledge_current_chunks$$,'42501',null,'browser cannot read processing view');
select extensions.throws_ok($$delete from public.knowledge_chunks$$,'42501',null,'browser cannot delete chunks');
reset role;
select extensions.ok((select bool_and((select string_agg(c.text,'' order by c.chunk_order)
  from public.knowledge_chunks c where c.version_id=f.version_id)=f.content) from fixture f where n<=3),
  'ordered chunks reconstruct every character including whitespace and Unicode');
select extensions.ok((select bool_and(c.document_id=v.document_id and c.organization_id=v.organization_id
  and c.version_number=v.version_number and c.source_filename=v.original_filename)
  from public.knowledge_chunks c join public.knowledge_document_versions v on c.version_id=v.id),
  'citation identity is derived from the correct document/version');
select extensions.ok((select bool_and(c.start_offset=c.chunk_order*1200
  and c.end_offset=c.start_offset+char_length(c.text)) from public.knowledge_chunks c),
  'citation offsets are contiguous and end-exclusive');
create temp table original_chunks as select * from public.knowledge_chunks;
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select extensions.is(public.chunk_knowledge_document((select version_id from fixture where n=1)),3,'repeat returns same count');
reset role;
select extensions.is((select count(*)::integer from (
  (select * from public.knowledge_chunks except select * from original_chunks)
  union all (select * from original_chunks except select * from public.knowledge_chunks)) difference),
  0,'repeat preserves IDs, text, order and timestamps without duplicate rows');
select extensions.is((select count(*)::integer from public.activity_logs
  where metadata->>'event_code'='knowledge_chunking_succeeded' and organization_id='eb000000-0000-4000-8000-000000000001'),
  3,'idempotent repeat does not duplicate completion audit');
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.begin_knowledge_extraction((select version_id from fixture where n=2));
reset role;
select extensions.is((select count(*)::integer from public.knowledge_current_chunks
  where version_id=(select version_id from fixture where n=2)),0,'processing retry hides old chunks');
select set_config('request.jwt.claim.role','service_role',true);
select public.finish_knowledge_extraction(e.id,e.attempt_id,f.content,repeat('a',64))
from public.knowledge_extractions e join fixture f on e.version_id=f.version_id where f.n=2;
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select extensions.is(public.chunk_knowledge_document((select version_id from fixture where n=2)),2,'same-text re-extraction produces stable chunks');
reset role;
select extensions.is((select count(*)::integer from (
  (select * from public.knowledge_chunks except select * from original_chunks)
  union all (select * from original_chunks except select * from public.knowledge_chunks)) difference),
  0,'same-text extraction retry preserves chunk IDs and timestamps');
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.begin_knowledge_extraction((select version_id from fixture where n=3));
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select public.finish_knowledge_extraction(e.id,e.attempt_id,'Changed actual extraction',repeat('b',64))
from public.knowledge_extractions e where e.version_id=(select version_id from fixture where n=3);
select extensions.is((select count(*)::integer from public.knowledge_current_chunks
  where version_id=(select version_id from fixture where n=3)),0,'changed extraction hides old chunk set before re-chunking');
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select extensions.is(public.chunk_knowledge_document((select version_id from fixture where n=3)),1,'changed extraction creates new set');
reset role;
select extensions.is((select count(*)::integer from public.knowledge_chunks where version_id=(select version_id from fixture where n=3)),2,'changed extraction retains historical chunks');
select extensions.is((select text from public.knowledge_current_chunks where version_id=(select version_id from fixture where n=3)),
  'Changed actual extraction','processing view selects only current extracted text');
select extensions.throws_ok($$update public.knowledge_chunks set organization_id='eb000000-0000-4000-8000-000000000002'$$,
  '23503',null,'composite foreign key prevents mixed-organization chunks');
select extensions.throws_ok($$update public.knowledge_chunks set version_id=(select version_id from fixture where n=4)$$,
  '23503',null,'chunks cannot be attached to a different version');
select set_config('request.jwt.claim.sub','ea000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select extensions.throws_ok($$select public.chunk_knowledge_document((select version_id from fixture where n=1))$$,'42501',null,'other organization manager cannot chunk');
insert into public.knowledge_documents(id) values ('ec000000-0000-4000-8000-000000000007');
insert into public.knowledge_document_versions(id,document_id,version_number,document_type,title,storage_path,original_filename,mime_type,file_size)
values ('ed000000-0000-4000-8000-000000000007','ec000000-0000-4000-8000-000000000007',1,'procedure','Other org source',
  'eb000000-0000-4000-8000-000000000002/ec000000-0000-4000-8000-000000000007/ed000000-0000-4000-8000-000000000007/source.txt',
  'source.txt','text/plain',100);
reset role;
select set_config('request.jwt.claim.role','service_role',true);
update public.knowledge_document_versions set uploaded_at=now() where id='ed000000-0000-4000-8000-000000000007';
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.transition_knowledge_version('ed000000-0000-4000-8000-000000000007','pending_review');
select public.transition_knowledge_version('ed000000-0000-4000-8000-000000000007','approved');
select public.begin_knowledge_extraction('ed000000-0000-4000-8000-000000000007');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select public.finish_knowledge_extraction(e.id,e.attempt_id,'Other organization private text',repeat('c',64))
from public.knowledge_extractions e where version_id='ed000000-0000-4000-8000-000000000007';
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select extensions.is(public.chunk_knowledge_document('ed000000-0000-4000-8000-000000000007'),1,'other organization can process its own eligible document');
reset role;
select extensions.is((select organization_id from public.knowledge_chunks where version_id='ed000000-0000-4000-8000-000000000007'),
  'eb000000-0000-4000-8000-000000000002'::uuid,'other organization chunks retain their own identity');
set local role authenticated;
select set_config('request.jwt.claim.sub','ea000000-0000-4000-8000-000000000002',true);
select extensions.throws_ok($$select public.chunk_knowledge_document((select version_id from fixture where n=1))$$,'42501',null,'ordinary reader cannot chunk');
reset role;
set local role anon;
select extensions.throws_ok($$select public.chunk_knowledge_document(gen_random_uuid())$$,'42501',null,'anonymous cannot invoke chunking');
reset role;
select set_config('request.jwt.claim.sub','ea000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select extensions.throws_ok($$select public.chunk_knowledge_document('ed000000-0000-4000-8000-000000000007')$$,'42501',null,'first organization cannot process second organization document');
select public.transition_knowledge_document('ec000000-0000-4000-8000-000000000001','archived');
select extensions.throws_ok($$select public.chunk_knowledge_document((select version_id from fixture where n=1))$$,'23514',null,'archived version cannot be chunked');
reset role;
select extensions.is((select count(*)::integer from public.knowledge_current_chunks where version_id=(select version_id from fixture where n=1)),0,'archive immediately excludes stored chunks from current processing');
select extensions.is((select count(*)::integer from public.knowledge_chunks where version_id=(select version_id from fixture where n=1)),3,'archive preserves historical citation chunks');
select * from extensions.finish();
rollback;
