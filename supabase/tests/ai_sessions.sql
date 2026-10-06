begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(26);

-- Fixtures are rolled back: no test conversations or users survive this script.
insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('cc000000-0000-4000-8000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
  'ai-session-' || n || '@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now()
from generate_series(1,3) n;
insert into public.organizations(id, company_code, company_name, industry, company_size, country, state, contact_email, contact_phone)
select ('dd000000-0000-4000-8000-00000000000' || n)::uuid, 'AI_SESSION_' || n, 'Session Test', 'Testing', '1-10',
  'Nigeria', 'Lagos', 'ai-session@example.com', '12345678' from generate_series(1,2) n;
insert into public.profiles(id, organization_id, full_name, account_status)
select ('cc000000-0000-4000-8000-00000000000' || n)::uuid,
  ('dd000000-0000-4000-8000-00000000000' || case when n=3 then 2 else 1 end)::uuid, 'Session User', 'active'
from generate_series(1,3) n;
insert into public.memberships(user_id, organization_id, role)
select id, organization_id, 'Field Worker' from public.profiles where id::text like 'cc000000%';

select set_config('request.jwt.claim.sub', 'cc000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok($$select public.create_ai_session('First chat')$$, 'owner creates session with trusted identity');
select extensions.lives_ok($$select public.create_ai_session('New chat')$$, 'new chat creates a separate session');
select extensions.is((select count(*)::int from public.ai_sessions), 2, 'owner can reopen both sessions');
select extensions.ok((select bool_and(user_id = auth.uid()) from public.ai_sessions), 'session identity derives from auth');
select extensions.ok((select bool_and(expires_at = created_at + interval '30 days') from public.ai_sessions),
  'sessions have the approved fixed 30-day lifetime');
select set_config('test.ai_session_id', (select id::text from public.ai_sessions where title='First chat'), true);
reset role;

insert into public.ai_request_logs(request_id, user_id, organization_id, feature, prompt_version, model_id)
values ('ee000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001',
  'dd000000-0000-4000-8000-000000000001','ai_service','ai-foundation-v1','test-model');
set local role authenticated;
select extensions.is(
  public.begin_ai_session_turn((select id from public.ai_sessions where title='First chat'),
    'ee000000-0000-4000-8000-000000000001', 'First question'),
  '[]'::jsonb, 'first turn has no unrelated context'
);
select extensions.throws_ok(
  $$select public.begin_ai_session_turn((select id from public.ai_sessions where title='First chat'),
    'ee000000-0000-4000-8000-000000000001','Duplicate')$$,
  '55P03', null, 'overlapping turns are rejected'
);
reset role;
set local role service_role;
select extensions.ok(public.finish_ai_session_turn('ee000000-0000-4000-8000-000000000001',
  jsonb_build_object('status','succeeded','completed_at',now(),'error_code',null,'response_metadata','{}'::jsonb),
  'First answer'), 'messages and audit complete atomically');
select extensions.is((select count(*)::int from public.ai_session_messages
  where request_id='ee000000-0000-4000-8000-000000000001'), 2, 'both messages persist');
select extensions.ok((select session_id is not null and status='succeeded' from public.ai_request_logs
  where request_id='ee000000-0000-4000-8000-000000000001'), 'audit is linked to conversation');
reset role;
insert into public.ai_request_logs(request_id, user_id, organization_id, feature, prompt_version, model_id)
values ('ee000000-0000-4000-8000-000000000002','cc000000-0000-4000-8000-000000000001',
  'dd000000-0000-4000-8000-000000000001','ai_service','ai-foundation-v1','test-model');
set local role authenticated;
select extensions.is(jsonb_array_length(public.begin_ai_session_turn(
  (select id from public.ai_sessions where title='First chat'),'ee000000-0000-4000-8000-000000000002','Follow-up')), 2,
  'same session supplies its completed prior exchange');
select extensions.is((select count(*)::int from public.ai_session_messages m
  join public.ai_sessions s on s.id=m.session_id where s.title='New chat'), 0, 'new chat history is isolated');
select extensions.throws_ok($$insert into public.ai_session_messages(session_id, request_id, role, content, status)
  values (gen_random_uuid(),gen_random_uuid(),'assistant','Forged answer','succeeded')$$,
  '42501', null, 'clients cannot forge assistant messages');

reset role;
select set_config('request.jwt.claim.sub', 'cc000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.is((select count(*)::int from public.ai_sessions), 0, 'same-organization peer cannot read sessions');
select extensions.is((select count(*)::int from public.ai_session_messages), 0, 'peer cannot read messages');
reset role;
select set_config('request.jwt.claim.sub', 'cc000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.is((select count(*)::int from public.ai_sessions), 0, 'other organization cannot read sessions');
select extensions.throws_ok(
  $$select public.begin_ai_session_turn('dd000000-0000-4000-8000-000000000099',
    'ee000000-0000-4000-8000-000000000002','Steal history')$$,
  '42501', null, 'unowned or nonexistent conversation rejected'
);
select extensions.throws_ok(
  $$select public.begin_ai_session_turn(current_setting('test.ai_session_id')::uuid,
    'ee000000-0000-4000-8000-000000000002','Other tenant')$$,
  '42501', null, 'known other-organization session ID is rejected'
);
reset role;
-- Expiry is fixed, not extended by new messages: conversations cannot become permanent memory.
update public.ai_sessions set expires_at = now() - interval '1 minute'
where id = current_setting('test.ai_session_id')::uuid;
select set_config('request.jwt.claim.sub', 'cc000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is((select count(*)::int from public.ai_sessions), 1, 'expired conversation cannot be reopened');
select extensions.is((select count(*)::int from public.ai_session_messages), 0, 'expired history is hidden');
select extensions.throws_ok(
  $$select public.begin_ai_session_turn(current_setting('test.ai_session_id')::uuid,
    'ee000000-0000-4000-8000-000000000002','Expired follow-up')$$,
  '42501', null, 'expired conversation cannot supply model context'
);
set local role anon;
select extensions.throws_ok($$select public.create_ai_session('Anonymous chat')$$,
  '42501', null, 'anonymous clients cannot create conversations');
reset role;
-- Fill the second chat to the documented limit, then verify the database rejects another turn.
insert into public.ai_request_logs(request_id, user_id, organization_id, feature, prompt_version, model_id, session_id)
select ('ab000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'cc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001',
  'ai_service','ai-foundation-v1','test-model', (select id from public.ai_sessions where title='New chat'
    and user_id='cc000000-0000-4000-8000-000000000001')
from generate_series(1,50) n;
insert into public.ai_session_messages(session_id, request_id, role, content, status)
select session_id, request_id, role, 'Bounded test content', 'succeeded'
from public.ai_request_logs cross join (values ('user'),('assistant')) roles(role)
where request_id::text like 'ab000000%';
insert into public.ai_request_logs(request_id, user_id, organization_id, feature, prompt_version, model_id)
values ('ab000000-0000-4000-8000-000000000099','cc000000-0000-4000-8000-000000000001',
  'dd000000-0000-4000-8000-000000000001','ai_service','ai-foundation-v1','test-model');
set local role authenticated;
select extensions.throws_ok(
  $$select public.begin_ai_session_turn((select id from public.ai_sessions where title='New chat'),
    'ab000000-0000-4000-8000-000000000099','One more')$$,
  '54000', null, 'database enforces the 100-message storage bound'
);
select extensions.lives_ok($$delete from public.ai_sessions where title='New chat'$$, 'owner can delete chat');
select extensions.is((select count(*)::int from public.ai_session_messages), 0, 'deleted chat history is inaccessible');
reset role;
select extensions.is((select count(*)::int from public.ai_request_logs where request_id::text like 'ab000000%' and session_id is not null),
  50, 'deletion preserves audit session identifiers without retaining conversation content');
select * from extensions.finish();
rollback;
