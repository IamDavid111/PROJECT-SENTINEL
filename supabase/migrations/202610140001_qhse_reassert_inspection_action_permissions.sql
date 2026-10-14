-- Re-assert the aligned inspection permission gate after an out-of-order apply.
--
-- The inspections/actions migration was originally numbered 202610060001, which
-- collided with 202610060001_incident_closure_delegation. The migration runner
-- keys on the numeric version, so the inspections migration was silently skipped
-- (its tables and functions never existed). It has been renumbered to
-- 202610060010 so it can finally apply -- but because the remote database is
-- already past that point, it is applied *after* 202610130001 and would therefore
-- overwrite public.has_inspection_action_permission with its older, narrower role
-- set.
--
-- This migration re-asserts the aligned definition so the final state is correct
-- no matter the order in which the two earlier migrations were applied. It is a
-- pure create-or-replace: idempotent, no data impact.

create or replace function public.has_inspection_action_permission(target_organization_id uuid, target_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships membership
    join public.profiles profile on profile.id = membership.user_id and profile.organization_id = membership.organization_id
    where membership.user_id = (select auth.uid())
      and membership.organization_id = target_organization_id
      and profile.account_status = 'active'
      and (
        membership.role in ('Super Administrator', 'Organization Administrator')
        or (
          target_permission = 'create_inspection'
          and membership.role in ('QHSE Manager', 'Site Supervisor', 'Safety Officer / HSE Officer', 'Contractor')
        )
        or (
          target_permission = 'manage_actions'
          and membership.role in ('QHSE Manager', 'Site Supervisor', 'Safety Officer / HSE Officer', 'Maintenance Engineer')
        )
        or exists (
          select 1 from public.custom_roles custom_role
          where custom_role.organization_id = membership.organization_id
            and custom_role.name = membership.role and custom_role.is_active
            and custom_role.permissions ? target_permission
        )
      )
  );
$$;

revoke all on function public.has_inspection_action_permission(uuid, text) from public, anon;
grant execute on function public.has_inspection_action_permission(uuid, text) to authenticated;