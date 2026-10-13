begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(14);

-- Isolated fixtures exercise existing RLS, not a second intelligence permission system.
insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('ba000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'authenticated', 'authenticated',
  'intelligence-' || n || '@example.com', '', '{}'::jsonb, '{}'::jsonb, now(), now()
from generate_series(1,4) n;
insert into public.organizations(id, company_code, company_name, industry, company_size, country, state, contact_email, contact_phone)
select ('bb000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'INTELLIGENCE_' || n,
  'Intelligence Fixture', 'Testing', '1-10', 'Nigeria', 'Lagos', 'intelligence@example.com', '12345678'
from generate_series(1,2) n;
insert into public.profiles(id, organization_id, full_name, account_status)
select ('ba000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  ('bb000000-0000-4000-8000-' || lpad((case when n=4 then 2 else 1 end)::text,12,'0'))::uuid,
  'Intelligence User ' || n, 'active' from generate_series(1,4) n;
insert into public.memberships(user_id, organization_id, role)
select id, organization_id, case when id::text like '%000001' then 'Super Administrator' else 'Field Worker' end
from public.profiles where id::text like 'ba000000%';
insert into public.sites(id, organization_id, name, code)
select ('bc000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  ('bb000000-0000-4000-8000-' || lpad((case when n=3 then 2 else 1 end)::text,12,'0'))::uuid,
  'Intelligence Site ' || n, 'INTEL_' || n from generate_series(1,3) n;
insert into public.company_settings(organization_id, operational_sites, severity_levels, incident_categories)
select ('bb000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  '["Intelligence Site 1","Intelligence Site 2","Intelligence Site 3"]','["Low"]','["Equipment"]'
from generate_series(1,2) n;

select set_config('request.jwt.claim.sub','ba000000-0000-4000-8000-000000000001',true);
insert into public.incidents(id, organization_id, report_type, status, title, site_id, severity, incident_category, occurred_at, reported_at, created_by, reported_by)
select ('bd000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  ('bb000000-0000-4000-8000-' || lpad((case when n=3 then 2 else 1 end)::text,12,'0'))::uuid,
  'incident','submitted','Intelligence report ' || n,
  ('bc000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'Low','Equipment',now()-interval '1 day',now(),
  ('ba000000-0000-4000-8000-' || lpad((n+1)::text,12,'0'))::uuid,
  ('ba000000-0000-4000-8000-' || lpad((n+1)::text,12,'0'))::uuid
from generate_series(1,3) n;
insert into public.corrective_actions(id, organization_id, incident_id, title, assigned_owner_id, assigned_by, assigned_at, created_by)
select ('be000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'bb000000-0000-4000-8000-000000000001',
  ('bd000000-0000-4000-8000-' || lpad((case when n=1 then 1 else 2 end)::text,12,'0'))::uuid,
  'Intelligence action ' || n,
  ('ba000000-0000-4000-8000-' || lpad((case when n=3 then 3 else 2 end)::text,12,'0'))::uuid,
  'ba000000-0000-4000-8000-000000000001', now(),
  'ba000000-0000-4000-8000-000000000001'
from generate_series(1,3) n;

set local role authenticated;
select extensions.is((select count(*)::int from public.incidents),2,'administrator reads only own organization incidents');
select extensions.is((select count(*)::int from public.incidents where site_id='bc000000-0000-4000-8000-000000000002'),1,'site filter narrows organization visibility');
select extensions.is((select count(*)::int from public.corrective_actions),3,'administrator reads organization actions');
select extensions.is((select count(*)::int from public.incidents where organization_id='bb000000-0000-4000-8000-000000000002'),0,'explicit foreign tenant query cannot bypass RLS');

select set_config('request.jwt.claim.sub','ba000000-0000-4000-8000-000000000002',true);
select extensions.is((select count(*)::int from public.incidents),1,'worker reads own incident only');
select extensions.is((select count(*)::int from public.incidents where site_id='bc000000-0000-4000-8000-000000000002'),0,'site filter cannot grant another reporters incident');
select extensions.is((select count(*)::int from public.corrective_actions),2,'assigned actions have independent existing RLS');
select extensions.is((select count(*)::int from public.corrective_actions a join public.incidents i on i.id=a.incident_id and i.organization_id=a.organization_id),1,'shared retrieval must intersect readable actions with readable parent incidents');
select extensions.ok(not public.can_close_incidents('bb000000-0000-4000-8000-000000000001'),'AI-capable worker is not implicitly a closure delegate');

select set_config('request.jwt.claim.sub','ba000000-0000-4000-8000-000000000001',true);
select public.set_incident_closure_delegate('ba000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.sub','ba000000-0000-4000-8000-000000000002',true);
select extensions.is((select count(*)::int from public.incidents),2,'delegated all-incident access remains authoritative');
select extensions.is((select count(*)::int from public.corrective_actions),2,'delegation does not grant independent action visibility');
select extensions.is((select count(*)::int from public.incidents where organization_id='bb000000-0000-4000-8000-000000000002'),0,'delegation never crosses organizations');

select set_config('request.jwt.claim.sub','ba000000-0000-4000-8000-000000000004',true);
select extensions.is((select count(*)::int from public.incidents),1,'other organization worker reads their own report');
select extensions.is((select count(*)::int from public.corrective_actions),0,'other organization cannot read fixture actions');
select * from extensions.finish();
rollback;
