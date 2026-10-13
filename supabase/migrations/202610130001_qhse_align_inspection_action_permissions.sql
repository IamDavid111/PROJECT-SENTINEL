-- Align the inspection / action database gates with the frontend permission catalog.
--
-- src/data/userManagementConfig.ts (LEGACY_ROLE_PERMISSION_KEYS) grants
-- create_inspection / create_corrective_action to built-in roles beyond the
-- ones the previous database functions accepted, so roles could see UI actions
-- (nav entries and dashboard quick actions) that the backend would then reject.
-- These replacements make the database accept exactly the built-in roles the
-- frontend catalog grants for the inspection and corrective-action modules.
-- Custom roles keep their own permission-based grants.
--
-- Replaces:
--   - public.has_inspection_action_permission(uuid, text)
--   - public.can_create_corrective_action(uuid)

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

create or replace function public.can_create_corrective_action(target_organization_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select public.has_org_role(target_organization_id, array[
    'Super Administrator', 'Organization Administrator', 'QHSE Manager',
    'Site Supervisor', 'Safety Officer / HSE Officer', 'Maintenance Engineer'
  ]::public.membership_role[]);
$function$;

revoke all on function public.has_inspection_action_permission(uuid, text) from public, anon;
revoke all on function public.can_create_corrective_action(uuid) from public, anon;
grant execute on function public.has_inspection_action_permission(uuid, text) to authenticated;
grant execute on function public.can_create_corrective_action(uuid) to authenticated;