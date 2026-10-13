-- Conversations are private working history, never authoritative QHSE records.
create table public.ai_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null default 'New chat' check (length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  active_request_id uuid,
  active_started_at timestamptz,
  unique (id, user_id, organization_id)
);

create table public.ai_session_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.ai_sessions(id) on delete cascade,
  request_id uuid not null references public.ai_request_logs(request_id) on delete restrict,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) between 1 and 32000),
  status text not null check (status in ('pending', 'succeeded', 'failed')),
  created_at timestamptz not null default now(),
  unique (request_id, role)
);
create index ai_sessions_owner_updated_idx on public.ai_sessions(user_id, organization_id, updated_at desc);
create index ai_session_messages_history_idx on public.ai_session_messages(session_id, id desc);

alter table public.ai_request_logs add column session_id uuid;
-- Deleting a chat removes its content while preserving the request's session identifier in the audit.
create index ai_request_logs_session_idx on public.ai_request_logs(session_id);

-- Reuse membership/profile/custom-role records; active account and AI permission are checked
-- in RLS as well as the endpoint, since browser requests can bypass frontend service helpers.
create function public.can_use_ai_sessions(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    join public.profiles p on p.id = m.user_id and p.organization_id = m.organization_id
    where m.user_id = auth.uid() and m.organization_id = target_organization_id
      and p.account_status = 'active'
      and (public.is_builtin_role_name(m.role) or exists (
        select 1 from public.custom_roles cr
        where cr.organization_id = m.organization_id and cr.name = m.role
          and cr.is_active and cr.permissions ? 'use_ai_assistant'
      ))
  );
$$;
revoke all on function public.can_use_ai_sessions(uuid) from public, anon;
grant execute on function public.can_use_ai_sessions(uuid) to authenticated;

alter table public.ai_sessions enable row level security;
alter table public.ai_session_messages enable row level security;
revoke all on public.ai_sessions, public.ai_session_messages from public, anon, authenticated;
grant select, delete on public.ai_sessions to authenticated;
grant select on public.ai_session_messages to authenticated;
grant all on public.ai_sessions, public.ai_session_messages to service_role;
grant usage, select on sequence public.ai_session_messages_id_seq to service_role;

create policy ai_sessions_owner on public.ai_sessions for select to authenticated
using (user_id = auth.uid() and expires_at > now() and public.can_use_ai_sessions(organization_id));
create policy ai_sessions_owner_delete on public.ai_sessions for delete to authenticated
using (user_id = auth.uid() and public.can_use_ai_sessions(organization_id));
create policy ai_messages_owner on public.ai_session_messages for select to authenticated
using (exists (select 1 from public.ai_sessions s where s.id = session_id));

create function public.create_ai_session(p_title text default 'New chat')
returns public.ai_sessions language plpgsql security definer set search_path = public
as $$
declare
  org_id uuid;
  result public.ai_sessions;
begin
  select organization_id into org_id from public.profiles
  where id = auth.uid() and account_status = 'active';
  if org_id is null or not public.can_use_ai_sessions(org_id) then
    raise exception 'AI session access denied' using errcode = '42501';
  end if;
  insert into public.ai_sessions(user_id, organization_id, title)
  values (auth.uid(), org_id, trim(p_title)) returning * into result;
  return result;
end;
$$;
revoke all on function public.create_ai_session(text) from public, anon;
grant execute on function public.create_ai_session(text) to authenticated;

-- A row lock prevents two prompts from reading the same history and racing to append answers.
create function public.begin_ai_session_turn(p_session_id uuid, p_request_id uuid, p_prompt text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  session public.ai_sessions;
  history jsonb;
begin
  select * into session from public.ai_sessions where id = p_session_id for update;
  if not found or session.user_id <> auth.uid() or session.expires_at <= now()
    or not public.can_use_ai_sessions(session.organization_id) then
    raise exception 'AI session access denied' using errcode = '42501';
  end if;
  if length(trim(p_prompt)) not between 1 and 4000 then
    raise exception 'Invalid session prompt' using errcode = '22023';
  end if;
  if session.active_request_id is not null and session.active_started_at > now() - interval '2 minutes' then
    raise exception 'AI session is busy' using errcode = '55P03';
  end if;
  if not exists (select 1 from public.ai_request_logs a
    where a.request_id = p_request_id and a.user_id = auth.uid()
      and a.organization_id = session.organization_id and a.status = 'pending' and a.session_id is null) then
    raise exception 'AI request audit mismatch' using errcode = '42501';
  end if;
  -- Recover abandoned turns without placing incomplete exchanges into future model context.
  if session.active_request_id is not null then
    update public.ai_session_messages set status = 'failed'
      where request_id = session.active_request_id and status = 'pending';
    update public.ai_request_logs set status = 'failed', completed_at = now(), error_code = 'session_turn_abandoned'
      where request_id = session.active_request_id and status = 'pending';
  end if;
  if (select count(*) from public.ai_session_messages where session_id = session.id) >= 99 then
    raise exception 'AI session message limit reached' using errcode = '54000';
  end if;
  select coalesce(jsonb_agg(to_jsonb(h) order by h.id), '[]'::jsonb) into history
    from (select id, role, content, request_id from public.ai_session_messages
      where session_id = session.id and status = 'succeeded' order by id desc limit 20) h;
  update public.ai_request_logs set session_id = session.id where request_id = p_request_id;
  insert into public.ai_session_messages(session_id, request_id, role, content, status)
    values (session.id, p_request_id, 'user', trim(p_prompt), 'pending');
  update public.ai_sessions set active_request_id = p_request_id, active_started_at = now(), updated_at = now()
    where id = session.id;
  return history;
end;
$$;
-- Caller-scoped reservation requires a server-created, matching pending audit; no supplied identity.
revoke all on function public.begin_ai_session_turn(uuid, uuid, text) from public, anon;
grant execute on function public.begin_ai_session_turn(uuid, uuid, text) to authenticated;

-- The endpoint's service-role token has no auth.uid(); ownership is taken from its trusted audit.
create function public.finish_ai_session_turn(p_request_id uuid, p_completion jsonb, p_text text default null)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  audit public.ai_request_logs;
  session public.ai_sessions;
begin
  select * into audit from public.ai_request_logs where request_id = p_request_id;
  select * into session from public.ai_sessions where id = audit.session_id for update;
  if not found or session.active_request_id is distinct from p_request_id
    or session.user_id is distinct from audit.user_id or session.organization_id <> audit.organization_id then
    return false;
  end if;
  if p_completion->>'status' not in ('succeeded', 'failed') then
    raise exception 'Invalid AI completion';
  end if;
  -- Message persistence and audit completion are one transaction: no success with missing history.
  if p_completion->>'status' = 'succeeded' then
    insert into public.ai_session_messages(session_id, request_id, role, content, status)
      values (session.id, p_request_id, 'assistant', p_text, 'succeeded');
  end if;
  update public.ai_session_messages set status = p_completion->>'status'
    where request_id = p_request_id and role = 'user';
  update public.ai_request_logs set status = p_completion->>'status',
    completed_at = (p_completion->>'completed_at')::timestamptz,
    error_code = p_completion->>'error_code', response_metadata = p_completion->'response_metadata'
    where request_id = p_request_id and status = 'pending';
  update public.ai_sessions set active_request_id = null, active_started_at = null, updated_at = now()
    where id = session.id;
  return true;
end;
$$;
revoke all on function public.finish_ai_session_turn(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.finish_ai_session_turn(uuid, jsonb, text) to service_role;
