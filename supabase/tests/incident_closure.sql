begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

-- Real authenticated roles exercise RLS/RPCs; the transaction removes every fixture afterward.
insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('ac000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'authenticated', 'authenticated',
  'incident-closure-' || n || '@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now()
from generate_series(1,6) n;
insert into public.organizations(id, company_code, company_name, industry, company_size, country, state, contact_email, contact_phone)
select ('ad000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'CLOSURE_' || n,
  'Closure Test', 'Testing', '1-10', 'Nigeria', 'Lagos', 'closure@example.com', '12345678'
from generate_series(1,2) n;
insert into public.profiles(id, organization_id, full_name, account_status)
select ('ac000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  ('ad000000-0000-4000-8000-' || lpad((case when n=4 then 2 else 1 end)::text,12,'0'))::uuid,
  'Closure User ' || n, 'active' from generate_series(1,6) n;
insert into public.memberships(user_id, organization_id, role)
select id, organization_id, case
  when id::text like '%000001' then 'Super Administrator'
  when id::text like '%000005' then 'QHSE Manager'
  when id::text like '%000006' then 'Organization Administrator'
  else 'Field Worker' end
from public.profiles where id::text like 'ac000000%';
insert into public.sites(id, organization_id, name, code)
values ('ae000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001','Closure Site','CLOSE');
insert into public.company_settings(organization_id, operational_sites, severity_levels, incident_categories)
values ('ad000000-0000-4000-8000-000000000001','["Closure Site"]','["Low"]','["Equipment"]');

select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000001',true);
insert into public.incidents(id, organization_id, report_type, status, title, site_id, severity, incident_category, occurred_at, reported_at, created_by, reported_by)
select ('af000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'ad000000-0000-4000-8000-000000000001','incident',
  (case when n=2 then 'draft' else 'submitted' end)::public.incident_status,
  'Closure incident ' || n, 'ae000000-0000-4000-8000-000000000001','Low','Equipment',now()-interval '1 day',
  case when n=2 then null else now() end,
  (case when n=4 then 'ac000000-0000-4000-8000-000000000001' else 'ac000000-0000-4000-8000-000000000003' end)::uuid,
  (case when n=4 then 'ac000000-0000-4000-8000-000000000001' else 'ac000000-0000-4000-8000-000000000003' end)::uuid
from generate_series(1,4) n;
insert into public.corrective_actions(id, organization_id, incident_id, title, created_by)
values ('ab000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001',
  'af000000-0000-4000-8000-000000000003','Unfinished action','ac000000-0000-4000-8000-000000000001');

set local role authenticated;
select extensions.ok(public.can_close_incidents('ad000000-0000-4000-8000-000000000001'),'Super Administrator can close');
select extensions.is((select count(*)::int from public.list_incident_closure_candidates()),5,'settings lists only this organization members');
select extensions.lives_ok($$select public.set_incident_closure_delegate('ac000000-0000-4000-8000-000000000002',true)$$,'Super Administrator delegates existing user');
select extensions.throws_ok($$select public.set_incident_closure_delegate('ac000000-0000-4000-8000-000000000004',true)$$,'42501',null,'cannot delegate another organization');
select extensions.throws_ok($$update public.incidents set status='closed' where id='af000000-0000-4000-8000-000000000001'$$,
  '42501',null,'even Super Administrator cannot bypass closure evidence');
select extensions.throws_ok($$select public.close_incident('af000000-0000-4000-8000-000000000004','Root cause','Completed repair',false)$$,
  'P0001',null,'completion confirmation required');
select extensions.throws_ok($$select public.close_incident('af000000-0000-4000-8000-000000000004',' ','Completed repair',true)$$,
  'P0001',null,'blank root cause rejected');
select extensions.throws_ok($$select public.close_incident('af000000-0000-4000-8000-000000000004','Root cause',' ',true)$$,
  'P0001',null,'blank corrective action rejected');
select extensions.throws_ok($$select public.close_incident('af000000-0000-4000-8000-000000000002','Root cause','Completed repair',true)$$,
  'P0001',null,'draft cannot close');
select extensions.throws_ok($$select public.close_incident('af000000-0000-4000-8000-000000000003','Root cause','Completed repair',true)$$,
  'P0001',null,'unfinished linked action blocks closure');
select extensions.lives_ok($$select public.close_incident('af000000-0000-4000-8000-000000000004','Worn cable','Replaced cable and checked operation',true)$$,
  'Super Administrator closes own reported incident without investigation');

select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000002',true);
select extensions.ok(public.can_close_incidents('ad000000-0000-4000-8000-000000000001'),'delegate can close');
select extensions.is((select count(*)::int from public.incidents where organization_id='ad000000-0000-4000-8000-000000000001'),4,'delegate can see all organization incidents');
select extensions.is((select count(*)::int from public.incidents where created_by=auth.uid() or reported_by=auth.uid()),0,'own view excludes other reports');
select extensions.throws_ok($$select public.set_incident_closure_delegate('ac000000-0000-4000-8000-000000000003',true)$$,
  '42501',null,'delegate cannot grant permission');
select extensions.throws_ok($$insert into public.incident_closures(incident_id,organization_id,root_cause,corrective_action,action_completed,closed_by)
  values ('af000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001','Forged cause','Forged action',true,auth.uid())$$,
  '42501',null,'client cannot forge closure record');
select extensions.lives_ok($$select public.close_incident('af000000-0000-4000-8000-000000000001','Loose guard','Secured guard and checked operation',true)$$,
  'delegate closes another member report without investigation');
select extensions.is((select status::text from public.incidents where id='af000000-0000-4000-8000-000000000001'),'closed','status persisted');
select extensions.is((select root_cause from public.incident_closures where incident_id='af000000-0000-4000-8000-000000000001'),'Loose guard','root cause persisted');
select extensions.is((select closed_by from public.incident_closures where incident_id='af000000-0000-4000-8000-000000000001'),auth.uid(),'closer derived from auth');
select extensions.ok((select closed_at is not null and action_completed from public.incident_closures where incident_id='af000000-0000-4000-8000-000000000001'),'completion and timestamp persisted');
select extensions.is((select count(*)::int from public.activity_logs where metadata->>'event_code'='incident_closed'
  and metadata->>'incident_id'='af000000-0000-4000-8000-000000000001'),1,'closure activity recorded once');
select extensions.throws_ok($$select public.close_incident('af000000-0000-4000-8000-000000000001','Different cause','Different repair',true)$$,
  'P0001',null,'duplicate closure rejected');

select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000005',true);
select extensions.ok(not public.can_close_incidents('ad000000-0000-4000-8000-000000000001'),'QHSE role alone does not confer delegated closure');
select extensions.throws_ok($$select public.close_incident('af000000-0000-4000-8000-000000000003','Root cause','Completed repair',true)$$,
  '42501',null,'nondelegated manager cannot close');
select extensions.throws_ok($$select public.close_incident('af000000-0000-4000-8000-000000000003')$$,
  '42501',null,'legacy closure RPC cannot bypass delegation');
select extensions.throws_ok($$update public.incidents set status='closed' where id='af000000-0000-4000-8000-000000000003'$$,
  '42501',null,'manager direct update cannot bypass delegation');
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000006',true);
select extensions.throws_ok($$select public.set_incident_closure_delegate('ac000000-0000-4000-8000-000000000003',true)$$,
  '42501',null,'Organization Administrator cannot delegate');
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000004',true);
select extensions.is((select count(*)::int from public.incident_closures),0,'other organization cannot read closure records');
select extensions.throws_ok($$select public.close_incident('af000000-0000-4000-8000-000000000003','Root cause','Completed repair',true)$$,
  '42501',null,'cross-organization closure rejected');
select extensions.throws_ok($$select * from public.list_incident_closure_candidates()$$,'42501',null,'other organization cannot read delegate roster');

reset role;
update public.profiles set account_status='suspended' where id='ac000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select extensions.ok(not public.can_close_incidents('ad000000-0000-4000-8000-000000000001'),'suspended delegate cannot close');
reset role;
update public.profiles set account_status='active' where id='ac000000-0000-4000-8000-000000000002';
update public.memberships set role='Contractor' where user_id='ac000000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.ok(not public.can_close_incidents('ad000000-0000-4000-8000-000000000001'),'role change invalidates delegation');
reset role;
update public.memberships set role='Field Worker' where user_id='ac000000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.ok(not public.can_close_incidents('ad000000-0000-4000-8000-000000000001'),'restoring old role does not revive delegation');
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000001',true);
select extensions.lives_ok($$select public.set_incident_closure_delegate('ac000000-0000-4000-8000-000000000002',false)$$,'Super Administrator revokes access');
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000002',true);
select extensions.ok(not public.can_close_incidents('ad000000-0000-4000-8000-000000000001'),'revoked delegate cannot close');
select extensions.is((select count(*)::int from public.incidents where organization_id='ad000000-0000-4000-8000-000000000001'),0,'revoked worker cannot see other reports');
set local role anon;
select extensions.throws_ok($$select public.close_incident('af000000-0000-4000-8000-000000000003','Root cause','Completed repair',true)$$,
  '42501',null,'anonymous closure rejected');
reset role;
select extensions.is((select count(*)::int from public.incident_closures where incident_id='af000000-0000-4000-8000-000000000003'),0,'failed closure leaves no partial evidence');
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000001',true);
update public.corrective_actions set status='verified', completion_date=current_date,
  verified_by='ac000000-0000-4000-8000-000000000001', verification_date=now(), verification_status='approved'
where id='ab000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.lives_ok($$select public.close_incident('af000000-0000-4000-8000-000000000003','Worn seal','Replaced and verified seal',true)$$,
  'verified linked action permits closure without investigation');
reset role;
select extensions.throws_ok($$insert into public.corrective_actions(organization_id,incident_id,title,created_by)
  values ('ad000000-0000-4000-8000-000000000001','af000000-0000-4000-8000-000000000003',
  'New unfinished action','ac000000-0000-4000-8000-000000000001')$$,
  'P0001',null,'closed incident cannot receive unfinished linked action');
set local role authenticated;
select public.create_custom_role('ad000000-0000-4000-8000-000000000001','Closure Custom Role',null,'[]'::jsonb,'{}'::jsonb);
reset role;
update public.memberships set role='Closure Custom Role' where user_id='ac000000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.lives_ok($$select public.set_incident_closure_delegate('ac000000-0000-4000-8000-000000000002',true)$$,
  'Super Administrator can delegate user with defined custom role');
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000002',true);
select extensions.ok(public.can_close_incidents('ad000000-0000-4000-8000-000000000001'),'active custom-role delegate can close');
reset role;
update public.custom_roles set is_active=false where name='Closure Custom Role' and organization_id='ad000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.ok(not public.can_close_incidents('ad000000-0000-4000-8000-000000000001'),'disabled custom role loses closure authority');
reset role;
select * from extensions.finish();
rollback;
