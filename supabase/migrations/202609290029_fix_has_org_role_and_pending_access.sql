-- Two corrections:
--
-- 1. has_org_role(uuid, membership_role[]) casts memberships.role back to the
--    membership_role enum. Migration 010 widened memberships.role to text so
--    organizations could define custom roles, so that cast raises an error for
--    any custom role name. Comparing the caller's enum array as text instead
--    keeps every existing call site working.
--
-- 2. is_org_member only checked for a memberships row. Invitations create that
--    row before the invitee sets a password, so a pending invitee was a full
--    tenant member and could read the organization's data. Excluding pending
--    profiles closes that. Suspended and inactive accounts keep their existing
--    access so this change does not silently lock them out. Invitation
--    acceptance does not go through this function, so setup still completes.

create or replace function public.has_org_role(
  target_organization_id uuid,
  allowed_roles public.membership_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = (select auth.uid())
      and organization_id = target_organization_id
      and role = any(
        select allowed::text from unnest(allowed_roles) as allowed
      )
  );
$$;

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    join public.profiles p
      on p.id = m.user_id
     and p.organization_id = m.organization_id
    where m.user_id = (select auth.uid())
      and m.organization_id = target_organization_id
      and p.account_status is not null
      and p.account_status <> 'pending'
  );
$$;
