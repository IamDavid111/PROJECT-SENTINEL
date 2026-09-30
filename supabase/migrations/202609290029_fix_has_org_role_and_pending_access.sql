-- Reconstructed from deployed PostgreSQL definitions on 2026-09-30.
-- The linked migration ledger did not retain the original migration body.
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

create or replace function public.is_org_admin_for_role_management(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and organization_id = p_organization_id
      and role = any(array['Super Administrator', 'Organization Administrator']::text[])
  );
$$;