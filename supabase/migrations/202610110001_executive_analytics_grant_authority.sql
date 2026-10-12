-- Protect this grant at the table boundary, covering RPCs and direct RLS-authorized writes.
create or replace function public.is_active_analytics_super_admin(p_organization_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    join public.profiles p on p.id = m.user_id and p.organization_id = m.organization_id
    where m.organization_id = p_organization_id and m.user_id = p_user_id
      and m.role = 'Super Administrator' and p.account_status = 'active'
  );
$$;

create or replace function public.role_has_executive_analytics(p_organization_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_role = 'Super Administrator' or exists (
    select 1 from public.custom_roles
    where organization_id = p_organization_id and name = p_role and is_active
      and permissions ? 'view_executive_analytics'
  );
$$;

create or replace function public.guard_executive_analytics_role_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  protected_change boolean;
  target_org uuid;
begin
  if tg_op = 'INSERT' then
    protected_change := new.permissions ? 'view_executive_analytics';
    target_org := new.organization_id;
  elsif tg_op = 'DELETE' then
    protected_change := old.permissions ? 'view_executive_analytics';
    target_org := old.organization_id;
  else
    target_org := old.organization_id;
    protected_change := (old.permissions ? 'view_executive_analytics')
      is distinct from (new.permissions ? 'view_executive_analytics')
      or ((old.permissions ? 'view_executive_analytics' or new.permissions ? 'view_executive_analytics')
        and (old.name, old.organization_id, old.is_active, old.is_system, old.scope)
          is distinct from (new.name, new.organization_id, new.is_active, new.is_system, new.scope));
  end if;
  if protected_change and not public.is_active_analytics_super_admin(target_org, auth.uid()) then
    raise exception 'Only your Super Admin can grant or revoke Executive Analytics access' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and protected_change and old.organization_id <> new.organization_id
    and not public.is_active_analytics_super_admin(new.organization_id, auth.uid()) then
    raise exception 'Only your Super Admin can grant or revoke Executive Analytics access' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists custom_roles_guard_executive_analytics on public.custom_roles;
create trigger custom_roles_guard_executive_analytics
before insert or update or delete on public.custom_roles
for each row execute function public.guard_executive_analytics_role_grant();

-- Assigning an already-granted role also grants access, so protect membership changes too.
create or replace function public.guard_executive_analytics_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_access boolean := false;
  new_access boolean := false;
  target_org uuid;
begin
  if tg_op <> 'INSERT' then
    old_access := public.role_has_executive_analytics(old.organization_id, old.role);
    target_org := old.organization_id;
  end if;
  if tg_op <> 'DELETE' then
    new_access := public.role_has_executive_analytics(new.organization_id, new.role);
    target_org := new.organization_id;
  end if;
  if tg_op = 'UPDATE' and (old.user_id, old.organization_id, old.role)
    is not distinct from (new.user_id, new.organization_id, new.role) then return new; end if;
  if not old_access and not new_access then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  -- Preserve trusted service provisioning/cleanup and first-member organization registration.
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'INSERT' and (
    new.role = 'Super Administrator' and new.user_id = auth.uid()
    and not exists (select 1 from public.memberships where organization_id = new.organization_id)
  ) then return new; end if;
  if public.is_active_analytics_super_admin(target_org, auth.uid())
    and (tg_op <> 'UPDATE' or old.organization_id = new.organization_id
      or public.is_active_analytics_super_admin(old.organization_id, auth.uid())) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  -- An invitee may complete a still-valid invitation explicitly issued by their Super Admin.
  if tg_op <> 'DELETE' and new.user_id = auth.uid() and exists (
    select 1 from public.admin_invitations i
    where i.invited_user_id = new.user_id and i.organization_id = new.organization_id
      and i.role = new.role and i.status = 'pending' and i.expires_at > now()
      and public.is_active_analytics_super_admin(i.organization_id, i.inviter_id)
  ) then return new; end if;
  raise exception 'Only your Super Admin can grant or revoke Executive Analytics access' using errcode = '42501';
end;
$$;

drop trigger if exists memberships_guard_executive_analytics on public.memberships;
create trigger memberships_guard_executive_analytics
before insert or update or delete on public.memberships
for each row execute function public.guard_executive_analytics_assignment();

-- Invitation writes use a service client: verify the recorded, authenticated inviter's authority.
create or replace function public.guard_executive_analytics_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (old.organization_id, old.role, old.inviter_id, old.invited_user_id)
    is not distinct from (new.organization_id, new.role, new.inviter_id, new.invited_user_id) then return new; end if;
  if public.role_has_executive_analytics(new.organization_id, new.role)
    and not public.is_active_analytics_super_admin(new.organization_id, new.inviter_id) then
    raise exception 'Only your Super Admin can grant Executive Analytics through invitations' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists admin_invitations_guard_executive_analytics on public.admin_invitations;
create trigger admin_invitations_guard_executive_analytics
before insert or update on public.admin_invitations
for each row execute function public.guard_executive_analytics_invitation();

revoke all on function public.is_active_analytics_super_admin(uuid, uuid) from public, anon, authenticated;
revoke all on function public.role_has_executive_analytics(uuid, text) from public, anon, authenticated;
revoke all on function public.guard_executive_analytics_role_grant() from public, anon, authenticated;
revoke all on function public.guard_executive_analytics_assignment() from public, anon, authenticated;
revoke all on function public.guard_executive_analytics_invitation() from public, anon, authenticated;
