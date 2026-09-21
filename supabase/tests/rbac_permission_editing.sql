begin;

select set_config(
  'request.jwt.claim.sub',
  (
    select user_id::text
    from public.memberships
    where role = 'Super Administrator'
    order by created_at
    limit 1
  ),
  true
);

set local role authenticated;

do $test$
declare
  test_organization_id uuid;
  test_role public.custom_roles;
  baseline jsonb := '["view_dashboard","view_kpis","report_incident","view_own_reports","view_analytics"]'::jsonb;
  permission_name text;
  candidate jsonb;
begin
  select organization_id into test_organization_id
  from public.memberships
  where user_id = auth.uid()
    and role = 'Super Administrator'
  limit 1;

  if test_organization_id is null then
    raise exception 'No Super Administrator test fixture is available';
  end if;

  test_role := public.create_custom_role(
    test_organization_id,
    'Batch 27 Permission Test',
    null,
    '["view_users"]'::jsonb,
    '{}'::jsonb
  );

  if not test_role.permissions ? 'view_users' then
    raise exception 'Enable permission test failed';
  end if;

  test_role := public.update_custom_role(test_role.id, null, null, '[]'::jsonb, null, true);
  if test_role.permissions ? 'view_users' then
    raise exception 'Disable permission test failed';
  end if;

  test_role := public.update_custom_role(test_role.id, null, null, '["view_users"]'::jsonb, null, true);
  if not test_role.permissions ? 'view_users' then
    raise exception 'Re-enable permission test failed';
  end if;

  for permission_name in select jsonb_array_elements_text(baseline)
  loop
    select coalesce(jsonb_agg(value), '[]'::jsonb)
      into candidate
      from jsonb_array_elements_text(baseline) value
      where value <> permission_name;

    test_role := public.update_custom_role(test_role.id, null, null, candidate, null, true);
    if not test_role.permissions ? permission_name then
      raise exception 'Baseline permission removal was allowed: %', permission_name;
    end if;
  end loop;

  raise notice 'PASS permission editing and baseline protection';
end;
$test$;

rollback;
