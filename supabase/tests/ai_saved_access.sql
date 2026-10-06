begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select extensions.plan(25);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
select ('cf000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',
 'saved-access-'||n||'@example.com','{}','{}' from generate_series(1,3) n;
insert into public.organizations(id,company_code,company_name,industry,company_size,country,state,contact_email,contact_phone)
select ('df000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'SAVED_ACCESS_'||n,
 'Access fixture','Testing','1-10','Nigeria','Lagos','access@example.com','12345678' from generate_series(1,2) n;
insert into public.profiles(id,organization_id,full_name,account_status)
select ('cf000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('df000000-0000-4000-8000-'||lpad((case when n=3 then 2 else 1 end)::text,12,'0'))::uuid,
 'Access User','active' from generate_series(1,3) n;
insert into public.memberships(user_id,organization_id,role)
select id,organization_id,case when id::text like '%000001' then 'Super Administrator' else 'Field Worker' end
 from public.profiles where id in ('cf000000-0000-4000-8000-000000000001',
 'cf000000-0000-4000-8000-000000000002','cf000000-0000-4000-8000-000000000003');
insert into public.sites(id,organization_id,name,code)
values('bf000000-0000-4000-8000-000000000003','df000000-0000-4000-8000-000000000001','Access Site','ACCESS');
insert into public.company_settings(organization_id,operational_sites,severity_levels,incident_categories)
values('df000000-0000-4000-8000-000000000001','["Access Site"]','["Low"]','["Equipment"]');
select set_config('request.jwt.claim.sub','cf000000-0000-4000-8000-000000000001',true);
insert into public.incidents(id,organization_id,report_type,status,title,site_id,severity,incident_category,occurred_at,reported_at,created_by,reported_by)
values('bf000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000001',
 'incident','submitted','Authorized input','bf000000-0000-4000-8000-000000000003','Low','Equipment',now(),now(),
 'cf000000-0000-4000-8000-000000000002','cf000000-0000-4000-8000-000000000002');
insert into public.corrective_actions(id,organization_id,incident_id,title,assigned_owner_id,assigned_by,assigned_at,created_by)
values('bf000000-0000-4000-8000-000000000002','df000000-0000-4000-8000-000000000001',
 'bf000000-0000-4000-8000-000000000001','Assigned input','cf000000-0000-4000-8000-000000000002',
 'cf000000-0000-4000-8000-000000000001',now(),'cf000000-0000-4000-8000-000000000001');
insert into public.ai_sessions(id,user_id,organization_id)
values('af000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000001'),
 ('af000000-0000-4000-8000-000000000002','cf000000-0000-4000-8000-000000000002','df000000-0000-4000-8000-000000000001');
insert into public.ai_request_logs(request_id,user_id,organization_id,feature,prompt_version,model_id)
values('ef000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000001',
 'df000000-0000-4000-8000-000000000001','safety_copilot','safety-copilot-grounded-v1','mock'),
 ('ef000000-0000-4000-8000-000000000002','cf000000-0000-4000-8000-000000000002',
 'df000000-0000-4000-8000-000000000001','safety_copilot','safety-copilot-grounded-v1','mock');
select set_config('test.access_sources',
 '{"incidents":["bf000000-0000-4000-8000-000000000001"],"actions":["bf000000-0000-4000-8000-000000000002"],"investigations":[],"causes":[],"findings":[],"closures":[],"sites":[],"facilities":[]}',true);
set local role authenticated;
select extensions.is(public.begin_ai_session_turn('af000000-0000-4000-8000-000000000001',
 'ef000000-0000-4000-8000-000000000001','Question'),'[]'::jsonb,'caller reserves access proof');
select extensions.throws_ok($$select * from public.ai_conversation_access$$,'42501',null,'private IDs cannot be read');
select extensions.throws_ok($$select public.ai_access_signature(auth.uid(),'df000000-0000-4000-8000-000000000001')$$,
 '42501',null,'private signature helper cannot be used as an oracle');
reset role;
set local role service_role;
select extensions.throws_ok($$select public.finish_ai_session_turn('ef000000-0000-4000-8000-000000000001',
 '{"status":"succeeded","completed_at":"2026-10-06T00:00:00Z","response_metadata":{}}','Answer')$$,
 '22023',null,'missing full footprint fails closed');
select extensions.ok(public.finish_ai_session_turn('ef000000-0000-4000-8000-000000000001',
 jsonb_build_object('status','succeeded','completed_at',now(),'response_metadata','{}'::jsonb,
 'access_sources',current_setting('test.access_sources')::jsonb),'Answer'),'service completes with private footprint');
reset role;
set local role authenticated;
select extensions.is((select count(*)::int from public.ai_session_messages),2,'unchanged owner reads full chat');
select extensions.ok(public.can_read_ai_session('af000000-0000-4000-8000-000000000001'),'full footprint currently readable');
reset role;
update public.memberships set role='Field Worker' where user_id='cf000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.ok(public.can_use_ai_sessions('df000000-0000-4000-8000-000000000001'),'downgraded owner retains AI permission');
select extensions.is((select count(*)::int from public.ai_session_messages),0,'role downgrade hides saved facts and user turns');
select extensions.throws_ok($$select public.get_ai_session_evidence('af000000-0000-4000-8000-000000000001')$$,
 '42501',null,'metadata RPC cannot bypass revoked transcript access');
select extensions.throws_ok($$select public.begin_ai_session_turn('af000000-0000-4000-8000-000000000001',
 'ef000000-0000-4000-8000-000000000001','Continue')$$,'42501',null,'revoked transcript cannot supply continuation');
reset role;
update public.memberships set role='Super Administrator' where user_id='cf000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','cf000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select extensions.ok(not public.can_read_ai_session('af000000-0000-4000-8000-000000000001'),'same-org peer denied');
select public.begin_ai_session_turn('af000000-0000-4000-8000-000000000002','ef000000-0000-4000-8000-000000000002','Own question');
reset role;
set local role service_role;
select public.finish_ai_session_turn('ef000000-0000-4000-8000-000000000002',
 jsonb_build_object('status','succeeded','completed_at',now(),'response_metadata','{}'::jsonb,
 'access_sources',current_setting('test.access_sources')::jsonb),'Own answer');
reset role;
set local role authenticated;
select extensions.ok(public.can_read_ai_session('af000000-0000-4000-8000-000000000002'),'worker sees owned parent and assigned action');
reset role;
update public.corrective_actions set assigned_owner_id='cf000000-0000-4000-8000-000000000001'
 where id='bf000000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.ok(not public.can_read_ai_session('af000000-0000-4000-8000-000000000002'),'same-role assignment loss invalidates full footprint');
select extensions.is((select count(*)::int from public.ai_session_messages),0,'uncited record revocation hides aggregate narrative');
reset role;
insert into public.custom_roles(organization_id,name,permissions,created_by)
values('df000000-0000-4000-8000-000000000001','Saved access analyst','["use_ai_assistant","view_executive_analytics"]',
 'cf000000-0000-4000-8000-000000000001');
update public.memberships set role='Saved access analyst' where user_id='cf000000-0000-4000-8000-000000000002';
insert into public.ai_sessions(id,user_id,organization_id)
values('af000000-0000-4000-8000-000000000003','cf000000-0000-4000-8000-000000000002','df000000-0000-4000-8000-000000000001');
insert into public.ai_request_logs(request_id,user_id,organization_id,feature,prompt_version,model_id)
values('ef000000-0000-4000-8000-000000000003','cf000000-0000-4000-8000-000000000002',
 'df000000-0000-4000-8000-000000000001','safety_copilot','safety-copilot-grounded-v1','mock');
set local role authenticated;
select public.begin_ai_session_turn('af000000-0000-4000-8000-000000000003','ef000000-0000-4000-8000-000000000003','Analyst question');
reset role;
set local role service_role;
select public.finish_ai_session_turn('ef000000-0000-4000-8000-000000000003',
 jsonb_build_object('status','succeeded','completed_at',now(),'response_metadata','{}'::jsonb,
 'access_sources',jsonb_set(current_setting('test.access_sources')::jsonb,'{actions}','[]')),'Analyst answer');
reset role;
set local role authenticated;
select extensions.ok(public.can_read_ai_session('af000000-0000-4000-8000-000000000003'),'AI-enabled custom-role owner reads current proof');
reset role;
update public.custom_roles set permissions='["use_ai_assistant"]' where name='Saved access analyst'
 and organization_id='df000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.ok(public.can_use_ai_sessions('df000000-0000-4000-8000-000000000001'),'custom-role edit retains AI permission');
select extensions.ok(not public.can_read_ai_session('af000000-0000-4000-8000-000000000003'),'same custom-role name with edited grants invalidates proof');
reset role;
update public.custom_roles set permissions='["use_ai_assistant","view_executive_analytics"]',scope='{"site_ids":[]}'
 where name='Saved access analyst' and organization_id='df000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.ok(not public.can_read_ai_session('af000000-0000-4000-8000-000000000003'),'role scope edits invalidate proof without inventing site enforcement');
reset role;
delete from public.ai_conversation_access where request_id='ef000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','cf000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select extensions.ok(not public.can_read_ai_session('af000000-0000-4000-8000-000000000001'),'legacy answer without proof denied');
reset role;
select set_config('request.jwt.claim.sub','cf000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select extensions.ok(not public.can_read_ai_session('af000000-0000-4000-8000-000000000002'),'foreign organization denied');
select extensions.throws_ok($$select public.get_ai_session_evidence('af000000-0000-4000-8000-000000000003')$$,
 '42501',null,'foreign organization cannot obtain answer presentation');
set local role anon;
select extensions.throws_ok($$select public.can_read_ai_session('af000000-0000-4000-8000-000000000002')$$,
 '42501',null,'anonymous access denied');
reset role;
select set_config('request.jwt.claim.sub','cf000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.delete_ai_session('af000000-0000-4000-8000-000000000002');
reset role;
select extensions.is((select count(*)::int from public.ai_conversation_access where session_id='af000000-0000-4000-8000-000000000002'),0,
 'owner can delete revoked chat and private footprint cascades');
select extensions.is((select count(*)::int from public.ai_request_logs where request_id='ef000000-0000-4000-8000-000000000002'),1,
 'chat deletion preserves audit');
select * from extensions.finish();
rollback;
