-- RLS is enabled on admin_invitations with no frontend-facing policy, so the
-- client cannot read its own invitation history. This exposes a read-only view
-- of the caller's organization, gated on organization administrator authority.

create or replace function public.list_organization_invitations()
returns table (
  id uuid,
  invitee_email text,
  department text,
  role text,
  status text,
  invited_user_id uuid,
  inviter_id uuid,
  invited_by_name text,
  created_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  caller_organization_id uuid;
  caller_is_admin boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select p.organization_id into caller_organization_id
  from public.profiles p
  where p.id = current_user_id
    and p.account_status = 'active';

  if caller_organization_id is null then
    raise exception 'Your account is not active in an organization';
  end if;

  select public.is_org_admin_for_role_management(caller_organization_id) into caller_is_admin;
  if not caller_is_admin then
    raise exception 'Only organization administrators can view invitations';
  end if;

  return query
  select
    ai.id,
    ai.invitee_email,
    ai.department,
    ai.role,
    ai.status,
    ai.invited_user_id,
    ai.inviter_id,
    nullif(btrim(coalesce(inviter.full_name, '')), ''),
    ai.created_at,
    ai.expires_at,
    ai.accepted_at,
    ai.revoked_at
  from public.admin_invitations ai
  left join public.profiles inviter
    on inviter.id = ai.inviter_id
  where ai.organization_id = caller_organization_id
  order by ai.created_at desc;
end;
$$;

revoke all on function public.list_organization_invitations() from public, anon;
grant execute on function public.list_organization_invitations() to authenticated;
