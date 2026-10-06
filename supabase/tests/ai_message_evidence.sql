begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select extensions.plan(12);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
select ('ce000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',
 'evidence-fixture-'||n||'@example.com','{}','{}' from generate_series(1,2) n;
insert into public.organizations(id,company_code,company_name,industry,company_size,country,state,contact_email,contact_phone)
values ('de000000-0000-4000-8000-000000000001','AI_EVIDENCE_TEST','Evidence fixture','Testing','1-10','Nigeria','Lagos','evidence@example.com','12345678');
insert into public.profiles(id,organization_id,full_name,account_status)
select ('ce000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'de000000-0000-4000-8000-000000000001','Evidence User','active' from generate_series(1,2) n;
insert into public.memberships(user_id,organization_id,role)
select id,organization_id,'Field Worker' from public.profiles where id in
 ('ce000000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000002');
insert into public.ai_sessions(id,user_id,organization_id)
values ('ae000000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000001');
insert into public.ai_request_logs(request_id,user_id,organization_id,feature,prompt_version,model_id,status,completed_at,session_id,response_metadata)
values ('ee000000-0000-4000-8000-000000000011','ce000000-0000-4000-8000-000000000001',
 'de000000-0000-4000-8000-000000000001','safety_copilot','safety-copilot-grounded-v1','test',
 'succeeded',now(),'ae000000-0000-4000-8000-000000000001',
 '{"validated_citation_ids":["incidents:ab000000-0000-4000-8000-000000000101"],"grounding_digest":"PRIVATE","grounding_as_of":"2026-10-06T12:00:00.000Z","methodology_version":"safety-intelligence-v1","grounding_scope":{"visibility":"personal"},"grounding_source_ids":["not-exposed"]}');
insert into public.ai_session_messages(session_id,request_id,role,content,status,answer_presentation)
values ('ae000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000011','assistant','Historical answer','succeeded','{"interpretation":"Advisory"}');
insert into public.ai_conversation_access(request_id,session_id,signature,sources)
values ('ee000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000001',
 public.ai_access_signature('ce000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000001'),
 '{"incidents":[],"actions":[],"investigations":[],"causes":[],"findings":[],"closures":[],"sites":[],"facilities":[]}');
select set_config('request.jwt.claim.sub','ce000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select extensions.is(jsonb_array_length(public.get_ai_session_evidence('ae000000-0000-4000-8000-000000000001')),1,'owner reopens evidence');
select extensions.is(public.get_ai_session_evidence('ae000000-0000-4000-8000-000000000001')->0->'sourceIds',
 '["incidents:ab000000-0000-4000-8000-000000000101"]'::jsonb,'only validated IDs supplied');
select extensions.ok(not (public.get_ai_session_evidence('ae000000-0000-4000-8000-000000000001')->0 ? 'grounding_digest'),'private provenance not exposed');
select extensions.ok(public.get_ai_session_evidence('ae000000-0000-4000-8000-000000000001')->0->'presentation' is not null,'structured metadata survives reopen');
select set_config('request.jwt.claim.sub','ce000000-0000-4000-8000-000000000002',true);
select extensions.throws_ok($$select public.get_ai_session_evidence('ae000000-0000-4000-8000-000000000001')$$,'42501',null,'peer cannot read evidence');
set local role anon;
select extensions.throws_ok($$select public.get_ai_session_evidence('ae000000-0000-4000-8000-000000000001')$$,'42501',null,'anonymous evidence denied');
reset role;
update public.profiles set account_status='suspended' where id='ce000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','ce000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select extensions.throws_ok($$select public.get_ai_session_evidence('ae000000-0000-4000-8000-000000000001')$$,'42501',null,'revoked session permission denied');
reset role;
update public.profiles set account_status='active' where id='ce000000-0000-4000-8000-000000000001';
update public.ai_request_logs set response_metadata='{}' where request_id='ee000000-0000-4000-8000-000000000011';
set local role authenticated;
select extensions.is(public.get_ai_session_evidence('ae000000-0000-4000-8000-000000000001')->0->'sourceIds','[]'::jsonb,'legacy metadata does not invent sources');
reset role;
update public.ai_sessions set expires_at=now()-interval '1 second' where id='ae000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select public.get_ai_session_evidence('ae000000-0000-4000-8000-000000000001')$$,'42501',null,'expired evidence denied');
reset role;
insert into public.ai_request_logs(request_id,user_id,organization_id,feature,prompt_version,model_id,session_id)
values ('ee000000-0000-4000-8000-000000000012','ce000000-0000-4000-8000-000000000001',
 'de000000-0000-4000-8000-000000000001','safety_copilot','safety-copilot-grounded-v1','test',
 'ae000000-0000-4000-8000-000000000001');
update public.ai_sessions set active_request_id='ee000000-0000-4000-8000-000000000012',active_started_at=now()
 where id='ae000000-0000-4000-8000-000000000001';
insert into public.ai_conversation_access(request_id,session_id,signature)
values ('ee000000-0000-4000-8000-000000000012','ae000000-0000-4000-8000-000000000001',
 public.ai_access_signature('ce000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000001'));
select extensions.ok(public.finish_ai_session_turn('ee000000-0000-4000-8000-000000000012',
 jsonb_build_object('status','succeeded','completed_at',now(),'error_code',null,'response_metadata','{}'::jsonb,
 'access_sources','{"incidents":[],"actions":[],"investigations":[],"causes":[],"findings":[],"closures":[],"sites":[],"facilities":[]}'::jsonb,
 'answer_presentation',jsonb_build_object('interpretation','Saved structured advice')),'Saved answer'),
 'completion atomically stores structured presentation');
select extensions.ok((select answer_presentation->>'interpretation'='Saved structured advice'
 from public.ai_session_messages where request_id='ee000000-0000-4000-8000-000000000012')
 and not (select response_metadata ? 'answer_presentation' from public.ai_request_logs
 where request_id='ee000000-0000-4000-8000-000000000012'),'generated content has conversation retention only');
delete from public.ai_sessions where id='ae000000-0000-4000-8000-000000000001';
select extensions.is((select count(*)::int from public.ai_session_messages where request_id='ee000000-0000-4000-8000-000000000011'),0,'structured answer content cascades with chat deletion');
select * from extensions.finish();
rollback;
