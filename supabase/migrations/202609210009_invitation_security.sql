create table if not exists public.admin_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invitee_email text not null,
  invited_user_id uuid not null references auth.users(id) on delete cascade,
  department text,
  role text not null,
  inviter_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (invitee_email = lower(trim(invitee_email))),
  check ((status = 'accepted' and accepted_at is not null) or status <> 'accepted'),
  check ((status = 'revoked' and revoked_at is not null) or status <> 'revoked')
);

create index if not exists admin_invitations_user_status_idx
  on public.admin_invitations (invited_user_id, status, expires_at);

create index if not exists admin_invitations_org_status_idx
  on public.admin_invitations (organization_id, status, expires_at);

create unique index if not exists admin_invitations_one_pending_email_idx
  on public.admin_invitations (organization_id, invitee_email)
  where status = 'pending';

create trigger admin_invitations_set_updated_at
before update on public.admin_invitations
for each row execute function public.set_updated_at();

alter table public.admin_invitations enable row level security;

revoke all on public.admin_invitations from anon, authenticated;
