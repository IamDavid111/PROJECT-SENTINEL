create or replace function public.create_pending_invited_profile(
  p_user_id uuid,
  p_organization_id uuid,
  p_full_name text,
  p_department text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_department text := nullif(trim(p_department), '');
  next_number integer;
  assigned_employee_id text;
begin
  if p_user_id is null or p_organization_id is null then
    raise exception 'User and organization are required';
  end if;

  if nullif(trim(p_full_name), '') is null then
    raise exception 'Full name is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text || '|' || coalesce(normalized_department, ''),
    0
  ));

  select coalesce(max(employee_id::integer), 0) + 1
    into next_number
    from public.profiles
   where organization_id = p_organization_id
     and department is not distinct from normalized_department
     and employee_id ~ '^[0-9]+$';

  assigned_employee_id := lpad(next_number::text, 3, '0');

  insert into public.profiles (
    id,
    organization_id,
    employee_id,
    full_name,
    department,
    account_status
  ) values (
    p_user_id,
    p_organization_id,
    assigned_employee_id,
    trim(p_full_name),
    normalized_department,
    'pending'
  );

  return assigned_employee_id;
end;
$$;

revoke all on function public.create_pending_invited_profile(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_pending_invited_profile(uuid, uuid, text, text) to service_role;

create or replace function public.complete_admin_invitation(
  p_full_name text,
  p_employee_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text;
  email_confirmed_at timestamptz;
  invitation public.admin_invitations;
  existing_profile public.profiles;
  existing_membership public.memberships;
  now_utc timestamptz := now();
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if nullif(trim(p_full_name), '') is null then
    raise exception 'Full name is required';
  end if;

  select lower(trim(email)), email_confirmed_at
    into current_email, email_confirmed_at
    from auth.users
   where id = current_user_id;

  if current_email is null then
    raise exception 'Authenticated email is unavailable';
  end if;

  if email_confirmed_at is null then
    raise exception 'Confirm your invitation email before completing setup';
  end if;

  select * into invitation
    from public.admin_invitations
   where invited_user_id = current_user_id
     and status = 'pending'
   order by created_at desc
   limit 1
   for update;

  if not found then
    raise exception 'No pending invitation is available for this account';
  end if;

  if invitation.invitee_email <> current_email then
    raise exception 'Invitation email does not match the authenticated account';
  end if;

  if invitation.expires_at <= now_utc then
    update public.admin_invitations
       set status = 'expired', updated_at = now_utc
     where id = invitation.id and status = 'pending';
    raise exception 'This invitation has expired';
  end if;

  select * into existing_profile
    from public.profiles
   where id = current_user_id
     and organization_id = invitation.organization_id
   for update;

  if not found then
    raise exception 'The invited profile is not available';
  end if;

  if existing_profile.account_status <> 'pending' then
    raise exception 'This account is not eligible for invitation activation';
  end if;

  if public.is_builtin_role_name(invitation.role) = false
     and not exists (
       select 1
       from public.custom_roles
       where organization_id = invitation.organization_id
         and name = invitation.role
         and is_active = true
     ) then
    raise exception 'The invitation role is no longer active in this organization';
  end if;

  select * into existing_membership
    from public.memberships
   where user_id = current_user_id
     and organization_id = invitation.organization_id
   for update;

  if found then
    update public.memberships
       set role = invitation.role
     where id = existing_membership.id;
  else
    insert into public.memberships (user_id, organization_id, role)
    values (current_user_id, invitation.organization_id, invitation.role);
  end if;

  update public.profiles
     set full_name = trim(p_full_name),
         department = invitation.department,
         organization_id = invitation.organization_id,
         account_status = 'active'
   where id = current_user_id
     and organization_id = invitation.organization_id
     and account_status = 'pending';

  if not found then
    raise exception 'This account is no longer eligible for invitation activation';
  end if;

  update public.admin_invitations
     set status = 'accepted', accepted_at = now_utc, updated_at = now_utc
   where id = invitation.id
     and status = 'pending'
     and invited_user_id = current_user_id
     and invitee_email = current_email
     and expires_at > now_utc;

  if not found then
    raise exception 'This invitation is no longer available';
  end if;

  return jsonb_build_object(
    'accepted', true,
    'organization_id', invitation.organization_id,
    'role', invitation.role,
    'department', invitation.department
  );
end;
$$;

revoke all on function public.complete_admin_invitation(text, text) from public, anon;
grant execute on function public.complete_admin_invitation(text, text) to authenticated;
