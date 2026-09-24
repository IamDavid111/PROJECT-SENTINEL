begin;

update public.memberships
set role = 'Field Worker'
where user_id = 'a4e14589-4f05-498a-aa66-81b46a099d51'
  and organization_id = '25ad3a5c-514b-4097-96a6-a712c715d92b';

update public.memberships
set role = 'Contractor'
where user_id = '3ac72e1e-f29b-43c9-bd91-c45a58be1c2c'
  and organization_id = '2de9724e-ee06-49a2-baba-3ff9542356da';

select set_config('request.jwt.claim.sub', '74f8c1b0-817c-4cc9-a4c5-465ea0ac91d5', true);
set local role authenticated;

do $test$
declare
  created_role public.custom_roles;
begin
  created_role := public.create_custom_role(
    '173d82bb-fdac-40c2-a0a9-7ef39b8c50c5',
    'Batch 29 Authorized Test',
    null,
    '["view_users"]'::jsonb,
    '{}'::jsonb
  );
  perform public.update_custom_role(
    created_role.id,
    null,
    null,
    '["view_users","invite_users"]'::jsonb,
    null,
    true
  );
  raise notice 'PASS authorized administrator can create and edit permissions';
end;
$test$;

reset role;
select set_config('request.jwt.claim.sub', 'a4e14589-4f05-498a-aa66-81b46a099d51', true);
set local role authenticated;

do $test$
declare
  denied boolean := false;
begin
  begin
    perform public.create_custom_role(
      '25ad3a5c-514b-4097-96a6-a712c715d92b',
      'Batch 29 Worker Denial Test',
      null,
      '["view_users"]'::jsonb,
      '{}'::jsonb
    );
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'Worker was allowed to manage roles';
  end if;
  raise notice 'PASS Worker cannot manage roles';
end;
$test$;

reset role;
select set_config('request.jwt.claim.sub', '3ac72e1e-f29b-43c9-bd91-c45a58be1c2c', true);
set local role authenticated;

do $test$
declare
  denied boolean := false;
begin
  begin
    perform public.create_custom_role(
      '2de9724e-ee06-49a2-baba-3ff9542356da',
      'Batch 29 Contractor Denial Test',
      null,
      '["view_users"]'::jsonb,
      '{}'::jsonb
    );
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'Contractor was allowed to manage roles';
  end if;
  raise notice 'PASS Contractor cannot manage roles';
end;
$test$;

rollback;
