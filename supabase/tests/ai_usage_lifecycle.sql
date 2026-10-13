begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(12);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values ('cf000000-0000-4000-8000-000000000001','authenticated','authenticated','ai-usage-fixture@example.com','{}','{}');
insert into public.organizations(id,company_code,company_name,industry,company_size,country,state,contact_email,contact_phone)
values ('df000000-0000-4000-8000-000000000001','AI_USAGE_FIXTURE','Usage fixture','Testing','1-10','Nigeria','Lagos','fixture@example.com','12345678');
insert into public.ai_request_logs(request_id,user_id,organization_id,feature,prompt_version,model_id)
select ('ef000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
 'cf000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000001','ai_service','test','test'
from generate_series(1,11) n;
select extensions.ok(public.reserve_ai_provider_attempt('ef000000-0000-4000-8000-000000000001'),'first attempt reserved');
select extensions.throws_ok($$select public.reserve_ai_provider_attempt('ef000000-0000-4000-8000-000000000001')$$,
 null,null,'same audit cannot spend twice');
select public.reserve_ai_provider_attempt(('ef000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid)
from generate_series(2,10) n;
select extensions.is(public.reserve_ai_provider_attempt('ef000000-0000-4000-8000-000000000011'),false,'11th user attempt denied');
select extensions.is((select count(*)::int from public.ai_request_logs where organization_id='df000000-0000-4000-8000-000000000001' and provider_attempted_at is not null),10,'allowance counts attempts not successes');
select extensions.ok(not has_function_privilege('authenticated','public.reserve_ai_provider_attempt(uuid)','EXECUTE'),'clients cannot reserve quota');
select extensions.ok(not has_function_privilege('authenticated','public.cleanup_ai_lifecycle()','EXECUTE'),'clients cannot run cleanup');
insert into public.ai_sessions(id,user_id,organization_id,expires_at)
values ('af000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000001',now()-interval '1 second');
update public.ai_request_logs set session_id='af000000-0000-4000-8000-000000000001' where request_id='ef000000-0000-4000-8000-000000000001';
insert into public.ai_session_messages(session_id,request_id,role,content,status)
values ('af000000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000001','user','Cleanup fixture','failed');
select public.cleanup_ai_lifecycle();
select extensions.is((select count(*)::int from public.ai_session_messages where session_id='af000000-0000-4000-8000-000000000001'),0,'expiry cleanup cascades messages');
select extensions.ok(exists(select 1 from public.ai_request_logs where request_id='ef000000-0000-4000-8000-000000000001'),'recent audit survives chat deletion');
update public.ai_request_logs set status='failed',completed_at=now(),error_code='provider_error'
 where request_id='ef000000-0000-4000-8000-000000000001';
select extensions.is(public.reserve_ai_provider_attempt('ef000000-0000-4000-8000-000000000011'),false,'failed attempt still consumes allowance');
update public.ai_request_logs set provider_attempted_at = (date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') - interval '1 second'
 where organization_id='df000000-0000-4000-8000-000000000001' and provider_attempted_at is not null;
select extensions.ok(public.reserve_ai_provider_attempt('ef000000-0000-4000-8000-000000000011'),'UTC next-day allowance resets');
insert into public.ai_request_logs(organization_id,feature,prompt_version,model_id,provider_attempted_at)
select 'df000000-0000-4000-8000-000000000001','ai_service','test','test',now() from generate_series(1,99);
insert into public.ai_request_logs(request_id,user_id,organization_id,feature,prompt_version,model_id)
values ('ef000000-0000-4000-8000-000000000012','cf000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000001','ai_service','test','test');
select extensions.is(public.reserve_ai_provider_attempt('ef000000-0000-4000-8000-000000000012'),false,'101st organization attempt denied');
update public.ai_request_logs set requested_at=now()-interval '366 days' where request_id='ef000000-0000-4000-8000-000000000001';
select public.cleanup_ai_lifecycle();
select extensions.ok(not exists(select 1 from public.ai_request_logs where request_id='ef000000-0000-4000-8000-000000000001'),'365-day audit retention enforced');
select * from extensions.finish();
rollback;
