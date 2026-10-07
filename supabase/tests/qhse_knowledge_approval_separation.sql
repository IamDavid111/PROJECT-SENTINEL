-- Segregation of duties for knowledge approval (migration 011).
begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('f1000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','sod-' || n || '@example.com','','{}','{}',now(),now()
from generate_series(1,3) n;
insert into public.organizations(id, company_code, company_name, industry, company_size, country, state, contact_email, contact_phone)
select ('f2000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'SOD_' || n,'SoD test','Testing','1-10','Nigeria','Lagos','s@example.com','12345678'
from generate_series(1,2) n;
-- Org 1: two approvers (users 1, 2). Org 2: sole approver (user 3).
insert into public.profiles(id, organization_id, full_name, account_status)
select ('f1000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  ('f2000000-0000-4000-8000-' || lpad((case when n=3 then 2 else 1 end)::text,12,'0'))::uuid,'SoD tester','active'
from generate_series(1,3) n;
insert into public.memberships(user_id, organization_id, role)
select id, organization_id, 'QHSE Manager' from public.profiles where id::text like 'f1000000-%';
create temp table fx(n integer, user_id uuid, version_id uuid default gen_random_uuid());
grant select on fx to authenticated, service_role;
insert into fx(n,user_id) values (1,'f1000000-0000-4000-8000-000000000001'),(2,'f1000000-0000-4000-8000-000000000003');
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
insert into public.knowledge_documents(id) values ('f3000000-0000-4000-8000-000000000001');
insert into public.knowledge_document_versions(id,document_id,version_number,document_type,title,storage_path,original_filename,mime_type,file_size)
select version_id,'f3000000-0000-4000-8000-000000000001',1,'procedure','SoD',
  'f2000000-0000-4000-8000-000000000001/f3000000-0000-4000-8000-000000000001/' || version_id || '/s.txt','s.txt','text/plain',10 from fx where n=1;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
insert into public.knowledge_documents(id) values ('f3000000-0000-4000-8000-000000000002');
insert into public.knowledge_document_versions(id,document_id,version_number,document_type,title,storage_path,original_filename,mime_type,file_size)
select version_id,'f3000000-0000-4000-8000-000000000002',1,'procedure','SoD',
  'f2000000-0000-4000-8000-000000000002/f3000000-0000-4000-8000-000000000002/' || version_id || '/s.txt','s.txt','text/plain',10 from fx where n=2;
select set_config('request.jwt.claim.role','service_role',true);
update public.knowledge_document_versions set uploaded_at=now() where id in (select version_id from fx);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

-- Org 1: user 1 submits; self-approval is blocked because user 2 can approve.
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select public.transition_knowledge_version((select version_id from fx where n=1),'pending_review');
select extensions.throws_ok($$select public.transition_knowledge_version((select version_id from fx where n=1),'approved')$$,
  '42501',null,'submitter cannot self-approve while another approver exists');
-- A different approver can approve.
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
select extensions.is((select approval_status from public.transition_knowledge_version((select version_id from fx where n=1),'approved')),
  'approved','independent approver can approve');

-- Org 2: sole approver may self-approve, and it is logged.
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
select public.transition_knowledge_version((select version_id from fx where n=2),'pending_review');
select extensions.is((select approval_status from public.transition_knowledge_version((select version_id from fx where n=2),'approved')),
  'approved','sole approver can self-approve');
reset role;
select extensions.ok(exists (select 1 from public.activity_logs where metadata->>'event_code'='knowledge_version_self_approved'
  and metadata->>'record_id'=(select version_id from fx where n=2)::text),'sole-approver self-approval is logged');
select extensions.ok(not exists (select 1 from public.activity_logs where metadata->>'event_code'='knowledge_version_self_approved'
  and metadata->>'record_id'=(select version_id from fx where n=1)::text),'independent approval is not flagged');
set local role authenticated;
select extensions.throws_ok($$select public.knowledge_has_other_approver('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001')$$,
  '42501',null,'approver lookup is not callable by browser');
reset role;
select * from extensions.finish();
rollback;
