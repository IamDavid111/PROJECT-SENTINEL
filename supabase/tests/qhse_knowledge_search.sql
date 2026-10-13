begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
-- Users: 1 QHSE Manager org1, 2 Field Worker org1, 3 QHSE Manager org2.
insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('fa000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'authenticated','authenticated','search-' || n || '@example.com','','{}','{}',now(),now()
from generate_series(1,3) n;
insert into public.organizations(id, company_code, company_name, industry, company_size, country, state, contact_email, contact_phone)
select ('fb000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'SEARCH_' || n,'Search test','Testing','1-10','Nigeria','Lagos','search@example.com','12345678'
from generate_series(1,2) n;
insert into public.profiles(id, organization_id, full_name, account_status)
select ('fa000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  ('fb000000-0000-4000-8000-' || lpad((case when n=3 then 2 else 1 end)::text,12,'0'))::uuid,
  'Search tester','active' from generate_series(1,3) n;
insert into public.memberships(user_id, organization_id, role)
select id,organization_id,case when id='fa000000-0000-4000-8000-000000000002' then 'Field Worker' else 'QHSE Manager' end
from public.profiles where id::text like 'fa000000-%';

-- Documents: n=1 org1 organization scope, n=2 org1 management scope, n=3 org1 draft,
-- n=4 org2 organization scope. Each indexed doc gets a distinct one-hot vector (axis n).
create temp table fixture(n integer, version_id uuid, org integer, owner integer, scope text);
grant select on fixture to authenticated, service_role;
insert into fixture values (1,gen_random_uuid(),1,1,'organization'),(2,gen_random_uuid(),1,1,'management'),
  (3,gen_random_uuid(),1,1,'organization'),(4,gen_random_uuid(),2,3,'organization');
create function pg_temp.axis(k integer) returns extensions.vector language sql as
  $$ select ('[' || string_agg(case when g=k then '1' else '0' end, ',' order by g) || ']')::extensions.vector from generate_series(1,1536) g $$;
create function pg_temp.as_user(u integer) returns void language sql as $$
  select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-' || lpad(u::text,12,'0'),true),
    set_config('request.jwt.claim.role','authenticated',true); $$;

do $$ declare f record; r record; begin
  for f in select * from fixture order by n loop
    perform pg_temp.as_user(f.owner);
    insert into public.knowledge_documents(id) values (('fc000000-0000-4000-8000-' || lpad(f.n::text,12,'0'))::uuid);
    insert into public.knowledge_document_versions(id,document_id,version_number,document_type,title,department,access_scope,
      storage_path,original_filename,mime_type,file_size,effective_date)
    values (f.version_id,('fc000000-0000-4000-8000-' || lpad(f.n::text,12,'0'))::uuid,1,'procedure','Search doc ' || f.n,
      case when f.n=1 then 'Operations' end, f.scope,
      'fb000000-0000-4000-8000-' || lpad(f.org::text,12,'0') || '/fc000000-0000-4000-8000-' || lpad(f.n::text,12,'0') || '/' || f.version_id || '/s.txt',
      's.txt','text/plain',100,case when f.n=1 then date '2026-01-01' end);
    perform set_config('request.jwt.claim.role','service_role',true);
    update public.knowledge_document_versions set uploaded_at=now() where id=f.version_id;
    if f.n = 3 then continue; end if;
    perform pg_temp.as_user(f.owner);
    perform public.transition_knowledge_version(f.version_id,'pending_review');
    perform public.transition_knowledge_version(f.version_id,'approved');
    select * into r from public.begin_knowledge_extraction(f.version_id);
    perform set_config('request.jwt.claim.role','service_role',true);
    perform public.finish_knowledge_extraction(r.id,r.attempt_id,'Search source text ' || f.n,repeat('a',64));
    perform pg_temp.as_user(f.owner);
    perform public.chunk_knowledge_document(f.version_id);
    select * into r from public.begin_knowledge_indexing(f.version_id,'text-embedding-3-small');
    perform set_config('request.jwt.claim.role','service_role',true);
    perform public.finish_knowledge_indexing(r.id,r.attempt_id,(select jsonb_agg(jsonb_build_object('chunk_id',c.id,
      'embedding',(select jsonb_agg(case when g=f.n then 1 else 0 end order by g) from generate_series(1,1536) g)))
      from public.knowledge_chunks c where c.version_id=f.version_id));
  end loop;
end $$;
create temp table q as select pg_temp.axis(1) as near1, pg_temp.axis(2) as near2,
  ('[0.9,0.4,0,0.1,' || array_to_string(array_fill(0,array[1532]),',') || ']')::extensions.vector as mixed;
grant select on q to authenticated;

select pg_temp.as_user(1);
set local role authenticated;
select extensions.is((select array_agg(document_id order by similarity desc) from public.search_knowledge((select mixed from q),'text-embedding-3-small')),
  array['fc000000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000002']::uuid[],'manager gets ranked results from own organization only');
select extensions.ok((select bool_and(version_id=(select version_id from fixture where n=1) and version_number=1 and chunk_order=0
  and content='Search source text 1' and source_filename='s.txt' and title='Search doc 1' and start_offset=0 and end_offset=20
  and similarity > 0.99) from public.search_knowledge((select near1 from q),'text-embedding-3-small',1)),'result carries citation metadata and score');
select extensions.is((select count(*)::integer from public.search_knowledge((select mixed from q),'text-embedding-3-small',1)),1,'match_count limits results');
select extensions.is((select count(*)::integer from public.search_knowledge((select mixed from q),'text-embedding-3-small',8,null,null,
  array['fc000000-0000-4000-8000-000000000002']::uuid[])),1,'document filter applies');
select extensions.is((select count(*)::integer from public.search_knowledge((select mixed from q),'text-embedding-3-small',8,null,'operations')),1,'department filter applies');
select extensions.is((select count(*)::integer from public.search_knowledge((select mixed from q),'text-embedding-3-small',8,
  'fb000000-0000-4000-8000-000000000009')),0,'site filter applies');
select extensions.is((select count(*)::integer from public.search_knowledge((select mixed from q),'other-model')),0,'other embedding model vectors are not mixed');
select extensions.is((select count(*)::integer from public.search_knowledge((select mixed from q),'text-embedding-3-small',8,null,null,
  array['fc000000-0000-4000-8000-000000000003','fc000000-0000-4000-8000-000000000004']::uuid[])),0,'draft and other-organization documents are never returned');
select extensions.throws_ok($$select * from public.search_knowledge((select mixed from q),'text-embedding-3-small',0)$$,'22023',null,'invalid match_count rejected');
select extensions.throws_ok($$select * from public.search_knowledge((select mixed from q),'Bad Model!')$$,'22023',null,'unsafe model label rejected');

select pg_temp.as_user(2);
select extensions.is((select array_agg(document_id) from public.search_knowledge((select mixed from q),'text-embedding-3-small')),
  array['fc000000-0000-4000-8000-000000000001']::uuid[],'field worker cannot retrieve management-scope knowledge');

select pg_temp.as_user(3);
select extensions.is((select array_agg(document_id) from public.search_knowledge((select mixed from q),'text-embedding-3-small')),
  array['fc000000-0000-4000-8000-000000000004']::uuid[],'other organization sees only its own knowledge');

select set_config('request.jwt.claim.sub','',true);
select extensions.throws_ok($$select * from public.search_knowledge((select mixed from q),'text-embedding-3-small')$$,'42501',null,'unauthenticated caller rejected');
reset role;
set local role anon;
select extensions.throws_ok($$select * from public.search_knowledge(null,'text-embedding-3-small')$$,'42501',null,'anon cannot execute search');
reset role;

select pg_temp.as_user(1);
set local role authenticated;
-- Citations: every search field must equal the stored chunk/version it claims to cite.
create temp table cited as select * from public.search_knowledge((select mixed from q),'text-embedding-3-small');
reset role;
select extensions.ok((select count(*)=2 and bool_and(c.document_id=s.document_id and c.version_id=s.version_id
  and c.version_number=s.version_number and c.chunk_order=s.chunk_order and c.start_offset=s.start_offset
  and c.end_offset=s.end_offset and c.text=s.content and c.source_filename=s.source_filename
  and v.title=s.title and v.document_type=s.document_type and v.effective_date is not distinct from s.effective_date)
  from cited s join public.knowledge_chunks c on c.id=s.chunk_id join public.knowledge_document_versions v on v.id=c.version_id),
  'search citations map exactly to the stored document/version/chunk');
select extensions.is((select effective_date from cited where document_id='fc000000-0000-4000-8000-000000000001'),date '2026-01-01','effective date is the version''s own value');
select extensions.ok((select bool_and(e.text=substr(x.extracted_text, s.start_offset+1, s.end_offset-s.start_offset))
  from cited s join public.knowledge_extractions x on x.version_id=s.version_id
  join public.knowledge_chunks e on e.id=s.chunk_id),'excerpt equals the cited offsets in the extracted source text');
grant select on cited to authenticated;
select pg_temp.as_user(1);
set local role authenticated;
select extensions.ok((select count(*)=2 and bool_and(g.version_id=s.version_id and g.content=s.content and g.chunk_order=s.chunk_order)
  from public.get_knowledge_citations((select array_agg(chunk_id) from cited)) g join cited s using (chunk_id)),
  'citation lookup re-resolves the same version and chunk');
select extensions.is((select count(*)::integer from public.get_knowledge_citations(array[gen_random_uuid()])),0,'unknown chunk returns nothing');
select extensions.throws_ok($$select * from public.get_knowledge_citations(array[]::uuid[])$$,'22023',null,'empty citation request rejected');
select pg_temp.as_user(2);
select extensions.is((select array_agg(document_id) from public.get_knowledge_citations((select array_agg(chunk_id) from cited))),
  array['fc000000-0000-4000-8000-000000000001']::uuid[],'field worker cannot resolve a management-scope citation');
select pg_temp.as_user(3);
select extensions.is((select count(*)::integer from public.get_knowledge_citations((select array_agg(chunk_id) from cited))),0,'other organization cannot resolve citations');
reset role;

-- Expires today: excluded from 00:00 UTC on its expiry date (bypassing edit triggers in this test only).
set local session_replication_role = replica;
update public.knowledge_document_versions set expiry_date=(now() at time zone 'UTC')::date where id=(select version_id from fixture where n=1);
set local session_replication_role = origin;
select pg_temp.as_user(1);
set local role authenticated;
select extensions.is((select array_agg(document_id) from public.search_knowledge((select mixed from q),'text-embedding-3-small')),
  array['fc000000-0000-4000-8000-000000000002']::uuid[],'expired knowledge is excluded');
select public.transition_knowledge_document('fc000000-0000-4000-8000-000000000002','archived');
select extensions.is((select count(*)::integer from public.search_knowledge((select mixed from q),'text-embedding-3-small')),0,'archived knowledge is excluded');
select extensions.is((select count(*)::integer from public.get_knowledge_citations((select array_agg(chunk_id) from cited))),0,'expired/archived sources no longer resolve as citations');
reset role;
select * from extensions.finish();
rollback;
