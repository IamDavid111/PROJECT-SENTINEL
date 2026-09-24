create or replace function public.audit_custom_role_permission_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_permission text;
  previous_enabled boolean;
  new_enabled boolean;
  current_actor_id uuid := (select auth.uid());
begin
  if old.permissions is not distinct from new.permissions then
    return new;
  end if;

  for changed_permission in
    select permission
    from (
      select jsonb_array_elements_text(old.permissions) as permission
      union
      select jsonb_array_elements_text(new.permissions) as permission
    ) permission_union
    where (old.permissions ? permission) is distinct from (new.permissions ? permission)
  loop
    previous_enabled := old.permissions ? changed_permission;
    new_enabled := new.permissions ? changed_permission;

    insert into public.role_audit_events (
      organization_id,
      actor_id,
      target_role_id,
      action,
      before_data,
      after_data,
      reason
    ) values (
      new.organization_id,
      current_actor_id,
      new.id,
      'updated',
      jsonb_build_object(
        'role_name', old.name,
        'permission', changed_permission,
        'enabled', previous_enabled
      ),
      jsonb_build_object(
        'role_name', new.name,
        'permission', changed_permission,
        'enabled', new_enabled
      ),
      'Custom role permission assignment changed'
    );

    insert into public.activity_logs (
      organization_id,
      user_id,
      activity,
      metadata
    ) values (
      new.organization_id,
      current_actor_id,
      'Role permission changed',
      jsonb_build_object(
        'role_id', new.id,
        'role_name', new.name,
        'permission', changed_permission,
        'previous_enabled', previous_enabled,
        'new_enabled', new_enabled
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists custom_roles_audit_permission_changes on public.custom_roles;
create trigger custom_roles_audit_permission_changes
after update of permissions on public.custom_roles
for each row execute function public.audit_custom_role_permission_changes();

revoke all on function public.audit_custom_role_permission_changes() from public, anon, authenticated;
