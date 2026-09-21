create or replace function public.custom_role_permissions_allowed()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array[
    'view_dashboard',
    'view_kpis',
    'view_analytics',
    'report_incident',
    'view_own_reports',
    'view_all_incidents',
    'manage_incidents',
    'review_incidents',
    'close_incidents',
    'view_users',
    'invite_users',
    'edit_users',
    'suspend_users',
    'deactivate_users',
    'manage_user_roles',
    'view_roles_permissions',
    'manage_roles_permissions',
    'view_all_reports',
    'manage_reports',
    'export_reports',
    'manage_qhse',
    'manage_corrective_actions',
    'manage_facility_risks',
    'access_administration',
    'use_ai_assistant',
    'view_executive_analytics',
    'view_marketplace',
    'create_inspection',
    'create_corrective_action',
    'start_audit',
    'view_reports',
    'manage_users',
    'view_profile',
    'view_activity',
    'manage_settings'
  ];
$$;

create or replace function public.enforce_custom_role_baseline_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  baseline_permissions constant jsonb := '["view_dashboard","view_kpis","report_incident","view_own_reports","view_analytics"]'::jsonb;
begin
  if jsonb_typeof(new.permissions) is distinct from 'array' then
    raise exception 'Role permissions must be a JSON array';
  end if;

  select jsonb_agg(permission order by permission)
    into new.permissions
    from (
      select distinct jsonb_array_elements_text(new.permissions || baseline_permissions) as permission
    ) merged_permissions;

  return new;
end;
$$;

drop trigger if exists custom_roles_enforce_baseline_permissions on public.custom_roles;
create trigger custom_roles_enforce_baseline_permissions
before insert or update of permissions on public.custom_roles
for each row execute function public.enforce_custom_role_baseline_permissions();

update public.custom_roles
set permissions = permissions || '["view_dashboard","view_kpis","report_incident","view_own_reports","view_analytics"]'::jsonb
where not permissions @> '["view_dashboard","view_kpis","report_incident","view_own_reports","view_analytics"]'::jsonb;

revoke all on function public.enforce_custom_role_baseline_permissions() from public, anon, authenticated;
