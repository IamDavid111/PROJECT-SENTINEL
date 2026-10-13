-- Phase 3 re-indexing lifecycle: new approved versions are processed and take over retrieval, older
-- versions stay stored but stop competing, and expired/archived/draft content never reaches AI.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('fa000000-0000-4000-8000-000000000001','authenticated','authenticated','reindex@example.com','','{}','{}',now(),now());
insert into public.organizations(id, company_code, company_name, industry, company_size, country, state, contact_email, contact_phone)
values ('fb000000-0000-4000-8000-000000000001','REINDEX_1','Reindex test','Testing','1-10','Nigeria','Lagos','r@example.com','12345678');
insert into public.profiles(id, organization_id, full_name, account_status)
values ('fa000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001','Reindex tester','active');
insert into public.memberships(user_id, organization_id, role)
values ('fa000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001','QHSE Manager');
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
-- Documents: 1 = v1 then effective v2; 2 = v1 then future-effective v2; 3 = expired v1.
insert into public.knowledge_documents(id)
select ('fc000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid from generate_series(1,3) n;
create temp table fx(key text primary key, doc integer, version_number integer, version_id uuid default gen_random_uuid(),
  effective date, expiry date, content text);
grant select on fx to authenticated, service_role;
insert into fx(key,doc,version_number,effective,expiry,content) values
  ('d1v1',1,1,null,null,'Hot work permit version one requires a fire watch.'),
  ('d1v2',1,2,(now() at time zone 'UTC')::date,null,'Hot work permit version two requires gas testing and a fire watch.'),
  ('d2v1',2,1,null,null,'Confined space entry version one.'),
  ('d2v2',2,2,(now() at time zone 'UTC')::date+5,null,'Confined space entry version two, effective later.'),
  ('d3v1',3,1,null,(now() at time zone 'UTC')::date-1,'Expired lifting procedure.');
create temp table step(version_id uuid, content text);
grant select on step to authenticated, service_role;

create function pg_temp.add_version(k text) returns void language sql as $$
  insert into public.knowledge_document_versions(id,document_id,version_number,document_type,title,
    storage_path,original_filename,mime_type,file_size,effective_date,expiry_date)
  select version_id,('fc000000-0000-4000-8000-' || lpad(doc::text,12,'0'))::uuid,version_number,'procedure',
    'Doc ' || doc || ' v' || version_number,
    'fb000000-0000-4000-8000-000000000001/fc000000-0000-4000-8000-' || lpad(doc::text,12,'0') || '/' || version_id || '/source.txt',
    'source.txt','text/plain',100,effective,expiry
  from fx where key = k;
$$;
create function pg_temp.vid(k text) returns uuid language sql stable as $$ select version_id from fx where key = k $$;
grant execute on function pg_temp.vid(text) to authenticated, service_role;

-- v1 drafts for all three documents, uploaded and approved.
select pg_temp.add_version(k) from unnest(array['d1v1','d2v1','d3v1']) k;
select set_config('request.jwt.claim.role','service_role',true);
update public.knowledge_document_versions set uploaded_at=now() where id in (select version_id from fx);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.transition_knowledge_version(pg_temp.vid(k),'pending_review') from unnest(array['d1v1','d2v1','d3v1']) k;
select public.transition_knowledge_version(pg_temp.vid(k),'approved') from unnest(array['d1v1','d2v1','d3v1']) k;
select extensions.throws_ok($$select public.begin_knowledge_extraction(pg_temp.vid('d3v1'))$$,'23514',null,'expired approved version is not processed');
reset role;

-- Process d1v1 + d2v1: extract -> chunk -> embed -> index.
insert into step select version_id, content from fx where key in ('d1v1','d2v1');
set local role authenticated;
select public.begin_knowledge_extraction(version_id) from step;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select public.finish_knowledge_extraction(e.id,e.attempt_id,s.content,repeat('a',64))
from public.knowledge_extractions e join step s on s.version_id=e.version_id;
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.chunk_knowledge_document(version_id) from step;
select public.begin_knowledge_indexing(version_id,'text-embedding-3-small') from step;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select public.finish_knowledge_indexing(r.id,r.attempt_id,(select jsonb_agg(jsonb_build_object('chunk_id',c.id,'embedding',
  (select jsonb_agg(0.01) from generate_series(1,1536)))) from public.knowledge_chunks c where c.version_id=r.version_id))
from public.knowledge_indexing_runs r join step s on s.version_id=r.version_id;

-- 1-2. v1 approved and retrievable.
select extensions.ok((select count(*)>0 and bool_and(version_id=pg_temp.vid('d1v1')) from public.knowledge_current_embeddings
  where document_id='fc000000-0000-4000-8000-000000000001'),'v1 is the retrieved version');
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select extensions.is((select retrieval_state from public.knowledge_version_ai_status(pg_temp.vid('d1v1'))),'current','v1 status is current');
select extensions.ok((select indexed_chunk_count=chunk_count and chunk_count>0 from public.knowledge_version_ai_status(pg_temp.vid('d1v1'))),'v1 status reports fully indexed');
select extensions.is((select retrieval_state from public.knowledge_version_ai_status(pg_temp.vid('d3v1'))),'expired','expired version status');
select extensions.throws_ok($$update public.knowledge_document_versions set approval_status='superseded' where id=pg_temp.vid('d1v1')$$,
  '42501',null,'cannot supersede without an effective newer approval');
reset role;

-- 3. v2 drafts (d1 effective today, d2 effective in 5 days), uploaded and approved.
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.add_version(k) from unnest(array['d1v2','d2v2']) k;
select set_config('request.jwt.claim.role','service_role',true);
update public.knowledge_document_versions set uploaded_at=now() where id in (pg_temp.vid('d1v2'),pg_temp.vid('d2v2'));
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.transition_knowledge_version(pg_temp.vid(k),'pending_review') from unnest(array['d1v2','d2v2']) k;
select public.transition_knowledge_version(pg_temp.vid(k),'approved') from unnest(array['d1v2','d2v2']) k;
select extensions.is((select approval_status from public.knowledge_document_versions where id=pg_temp.vid('d1v1')),'superseded','effective v2 approval supersedes v1');
select extensions.is((select approval_status from public.knowledge_document_versions where id=pg_temp.vid('d2v1')),'approved','future-effective v2 does not supersede v1 yet');
select extensions.is((select retrieval_state from public.knowledge_version_ai_status(pg_temp.vid('d2v2'))),'scheduled','future-effective v2 is scheduled');
reset role;
select extensions.ok((select count(*)=0 from public.knowledge_current_embeddings where document_id='fc000000-0000-4000-8000-000000000001'),
  'superseded v1 drops out before v2 is indexed (no stale fallback)');

-- Process both v2s (the future-effective one is pre-indexed so it is ready on its effective date).
delete from step;
insert into step select version_id, content from fx where key in ('d1v2','d2v2');
set local role authenticated;
select public.begin_knowledge_extraction(version_id) from step;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select public.finish_knowledge_extraction(e.id,e.attempt_id,s.content,repeat('a',64))
from public.knowledge_extractions e join step s on s.version_id=e.version_id;
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.chunk_knowledge_document(version_id) from step;
select public.begin_knowledge_indexing(version_id,'text-embedding-3-small') from step;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select public.finish_knowledge_indexing(r.id,r.attempt_id,(select jsonb_agg(jsonb_build_object('chunk_id',c.id,'embedding',
  (select jsonb_agg(0.01) from generate_series(1,1536)))) from public.knowledge_chunks c where c.version_id=r.version_id))
from public.knowledge_indexing_runs r join step s on s.version_id=r.version_id;

-- 4. v2 is retrieved.
select extensions.ok((select count(*)>0 and bool_and(version_id=pg_temp.vid('d1v2')) from public.knowledge_current_embeddings
  where document_id='fc000000-0000-4000-8000-000000000001'),'v2 is the retrieved version');
-- 5. v1 remains historically stored.
select extensions.ok((select count(*)>0 from public.knowledge_chunk_embeddings where version_id=pg_temp.vid('d1v1'))
  and exists (select 1 from public.knowledge_document_versions where id=pg_temp.vid('d1v1'))
  and exists (select 1 from public.knowledge_chunks where version_id=pg_temp.vid('d1v1')),'v1 version, chunks and vectors are retained');
select extensions.ok(exists (select 1 from public.activity_logs where metadata->>'record_id'=pg_temp.vid('d1v1')::text
  and metadata->>'from_status'='approved' and metadata->>'to_status'='superseded'),'supersession is audited');
-- 6. v1 no longer wins retrieval or resolves as a citation.
create temp table ids as select version_id, array_agg(id) chunk_ids from public.knowledge_chunks group by version_id;
grant select on ids to authenticated;
select extensions.ok(not exists (select 1 from public.knowledge_current_embeddings where version_id=pg_temp.vid('d1v1')),'v1 excluded from retrieval');
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.get_knowledge_citations(
  (select chunk_ids from ids where version_id=pg_temp.vid('d1v1')))),0,'v1 chunks no longer resolve as citations');
select extensions.ok((select count(*)>0 from public.get_knowledge_citations(
  (select chunk_ids from ids where version_id=pg_temp.vid('d1v2')))),'v2 chunks resolve as citations');
select extensions.is((select retrieval_state from public.knowledge_version_ai_status(pg_temp.vid('d1v1'))),'superseded','v1 status is superseded');
select extensions.is((select count(*)::integer from public.get_knowledge_citations(
  (select chunk_ids from ids where version_id=pg_temp.vid('d2v2')))),0,'pre-indexed future version is not citable yet');
reset role;
select extensions.ok((select count(*)>0 and bool_and(version_id=pg_temp.vid('d2v1')) from public.knowledge_current_embeddings
  where document_id='fc000000-0000-4000-8000-000000000002'),'current v1 keeps serving until future v2 takes effect');
select extensions.ok((select count(*)>0 from public.knowledge_chunk_embeddings where version_id=pg_temp.vid('d2v2')),'future v2 already has vectors');

-- 7. Archived and expired content is excluded.
select extensions.ok(not exists (select 1 from public.knowledge_current_embeddings where document_id='fc000000-0000-4000-8000-000000000003'),'expired document excluded');
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.transition_knowledge_document('fc000000-0000-4000-8000-000000000001','archived');
select extensions.is((select retrieval_state from public.knowledge_version_ai_status(pg_temp.vid('d1v2'))),'archived','archived status');
reset role;
select extensions.ok(not exists (select 1 from public.knowledge_current_embeddings where document_id='fc000000-0000-4000-8000-000000000001'),'archived document excluded');
select extensions.ok(exists (select 1 from public.knowledge_chunk_embeddings where version_id=pg_temp.vid('d1v2')),'archived vectors retained for history');
select * from extensions.finish();
rollback;
