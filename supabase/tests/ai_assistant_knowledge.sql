begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
-- Users: 1 QHSE Manager org1, 2 Field Worker org1. Org2 owns a foreign document version.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
select ('ca100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',
 'assistant-knowledge-'||n||'@example.com','{}','{}' from generate_series(1,3) n;
insert into public.organizations(id,company_code,company_name,industry,company_size,country,state,contact_email,contact_phone)
select ('da100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'ASSIST_KNOW_'||n,
 'Assistant knowledge','Testing','1-10','Nigeria','Lagos','ak@example.com','12345678' from generate_series(1,2) n;
insert into public.profiles(id,organization_id,full_name,account_status)
select ('ca100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('da100000-0000-4000-8000-'||lpad((case when n=3 then 2 else 1 end)::text,12,'0'))::uuid,'AK User','active'
from generate_series(1,3) n;
insert into public.memberships(user_id,organization_id,role)
select id,organization_id,case when id::text like '%000002' then 'Field Worker' else 'QHSE Manager' end
from public.profiles where id::text like 'ca100000-%';

-- Versions: 1 org1 organization scope, 2 org1 management scope, 3 org2 organization scope.
create function pg_temp.as_user(u integer) returns void language sql as $$
  select set_config('request.jwt.claim.sub','ca100000-0000-4000-8000-'||lpad(u::text,12,'0'),true),
    set_config('request.jwt.claim.role','authenticated',true); $$;
do $$ declare f record; begin
  for f in select * from (values (1,1,1,'organization'),(2,1,1,'management'),(3,2,3,'organization')) v(n,org,owner,scope) loop
    perform pg_temp.as_user(f.owner);
    insert into public.knowledge_documents(id) values (('dc100000-0000-4000-8000-'||lpad(f.n::text,12,'0'))::uuid);
    insert into public.knowledge_document_versions(id,document_id,version_number,document_type,title,access_scope,
      storage_path,original_filename,mime_type,file_size)
    values (('dd100000-0000-4000-8000-'||lpad(f.n::text,12,'0'))::uuid,('dc100000-0000-4000-8000-'||lpad(f.n::text,12,'0'))::uuid,
      1,'procedure','AK doc '||f.n,f.scope,
      'da100000-0000-4000-8000-'||lpad(f.org::text,12,'0')||'/dc100000-0000-4000-8000-'||lpad(f.n::text,12,'0')
        ||'/dd100000-0000-4000-8000-'||lpad(f.n::text,12,'0')||'/s.txt','s.txt','text/plain',100);
  end loop;
end $$;
select set_config('request.jwt.claim.role','',true);

-- Sessions: 1 (manager, org-scope doc), 2 (field worker, management-scope doc), 3 (manager, foreign doc).
insert into public.ai_sessions(id,user_id,organization_id) values
 ('ae100000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000001','da100000-0000-4000-8000-000000000001'),
 ('ae100000-0000-4000-8000-000000000002','ca100000-0000-4000-8000-000000000002','da100000-0000-4000-8000-000000000001'),
 ('ae100000-0000-4000-8000-000000000003','ca100000-0000-4000-8000-000000000001','da100000-0000-4000-8000-000000000001');
insert into public.ai_request_logs(request_id,user_id,organization_id,feature,prompt_version,model_id)
select ('ef100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('ca100000-0000-4000-8000-'||lpad((case when n=2 then 2 else 1 end)::text,12,'0'))::uuid,
 'da100000-0000-4000-8000-000000000001','safety_copilot','safety-copilot-grounded-v2','mock' from generate_series(1,3) n;
create function pg_temp.proof(version_ids text) returns jsonb language sql as $$
  select jsonb_build_object('incidents','[]'::jsonb,'actions','[]'::jsonb,'investigations','[]'::jsonb,'causes','[]'::jsonb,
    'findings','[]'::jsonb,'closures','[]'::jsonb,'sites','[]'::jsonb,'facilities','[]'::jsonb,'knowledge',version_ids::jsonb) $$;
create function pg_temp.done(proof jsonb) returns jsonb language sql as $$
  select jsonb_build_object('status','succeeded','completed_at',now(),'access_sources',proof,
    'response_metadata',jsonb_build_object('validated_citation_ids','[]'::jsonb,
      'validated_knowledge_citation_ids','["0a1b2c3d-4e5f-0a1b-0c3d-4e5f0a1b2c3d"]'::jsonb)) $$;
grant execute on function pg_temp.proof(text), pg_temp.done(jsonb) to authenticated, service_role;

select set_config('request.jwt.claim.sub','ca100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.begin_ai_session_turn('ae100000-0000-4000-8000-000000000001','ef100000-0000-4000-8000-000000000001','Q1');
select public.begin_ai_session_turn('ae100000-0000-4000-8000-000000000003','ef100000-0000-4000-8000-000000000003','Q3');
reset role;
select set_config('request.jwt.claim.sub','ca100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.begin_ai_session_turn('ae100000-0000-4000-8000-000000000002','ef100000-0000-4000-8000-000000000002','Q2');
reset role;

set local role service_role;
select extensions.throws_ok($$select public.finish_ai_session_turn('ef100000-0000-4000-8000-000000000001',
  pg_temp.done(pg_temp.proof('["dd100000-0000-4000-8000-000000000001"]') - 'facilities'),'A')$$,
  '22023',null,'knowledge key cannot replace a mandatory operational key');
select extensions.throws_ok($$select public.finish_ai_session_turn('ef100000-0000-4000-8000-000000000001',
  pg_temp.done(pg_temp.proof('[]')),'A')$$,'22023',null,'empty knowledge proof rejected');
select extensions.ok(public.finish_ai_session_turn('ef100000-0000-4000-8000-000000000001',
  pg_temp.done(pg_temp.proof('["dd100000-0000-4000-8000-000000000001"]')),'A'),'9-key proof with knowledge accepted');
select extensions.ok(public.finish_ai_session_turn('ef100000-0000-4000-8000-000000000002',
  pg_temp.done(pg_temp.proof('["dd100000-0000-4000-8000-000000000002"]')),'A'),'restricted-doc proof stored');
select extensions.ok(public.finish_ai_session_turn('ef100000-0000-4000-8000-000000000003',
  pg_temp.done(pg_temp.proof('["dd100000-0000-4000-8000-000000000003"]')),'A'),'foreign-doc proof stored');
reset role;

select set_config('request.jwt.claim.sub','ca100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select extensions.ok(public.can_read_ai_session('ae100000-0000-4000-8000-000000000001'),'readable knowledge keeps chat readable');
select extensions.is(public.get_ai_session_evidence('ae100000-0000-4000-8000-000000000001')->0->'knowledgeSourceIds',
  '["0a1b2c3d-4e5f-0a1b-0c3d-4e5f0a1b2c3d"]'::jsonb,'evidence returns validated knowledge chunk IDs only');
select extensions.ok(not public.can_read_ai_session('ae100000-0000-4000-8000-000000000003'),'other-organization document locks chat');
reset role;
select set_config('request.jwt.claim.sub','ca100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select extensions.ok(not public.can_read_ai_session('ae100000-0000-4000-8000-000000000002'),'unreadable restricted document locks chat');
reset role;
select * from extensions.finish();
rollback;
