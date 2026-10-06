alter table public.ai_request_logs add column provider_attempted_at timestamptz;
create index ai_request_logs_provider_daily_idx
  on public.ai_request_logs(organization_id, provider_attempted_at, user_id)
  where provider_attempted_at is not null;

-- Serialize reservations per organization: failed provider attempts still consume the UTC daily allowance.
create function public.reserve_ai_provider_attempt(p_request_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  entry public.ai_request_logs;
  day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  select * into entry from public.ai_request_logs where request_id = p_request_id;
  if not found or entry.status <> 'pending' or entry.user_id is null then
    raise exception 'Invalid AI usage reservation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(entry.organization_id::text, 0));
  select * into entry from public.ai_request_logs where request_id = p_request_id for update;
  if entry.status <> 'pending' or entry.provider_attempted_at is not null then
    raise exception 'AI provider attempt already reserved or completed';
  end if;
  if (select count(*) from public.ai_request_logs
      where organization_id = entry.organization_id and provider_attempted_at >= day_start) >= 100
    or (select count(*) from public.ai_request_logs
      where organization_id = entry.organization_id and user_id = entry.user_id
        and provider_attempted_at >= day_start) >= 10 then
    return false;
  end if;
  update public.ai_request_logs set provider_attempted_at = now() where request_id = p_request_id;
  return true;
end;
$$;
revoke all on function public.reserve_ai_provider_attempt(uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_provider_attempt(uuid) to service_role;

-- Messages cascade with expired chats; audits survive chat deletion until their independent retention ends.
create function public.cleanup_ai_lifecycle()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  sessions_deleted integer;
  audits_deleted integer;
begin
  delete from public.ai_sessions where expires_at <= now();
  get diagnostics sessions_deleted = row_count;
  delete from public.ai_request_logs a where requested_at < now() - interval '365 days'
    and not exists (select 1 from public.ai_session_messages m where m.request_id = a.request_id);
  get diagnostics audits_deleted = row_count;
  return jsonb_build_object('sessions_deleted', sessions_deleted, 'audits_deleted', audits_deleted);
end;
$$;
revoke all on function public.cleanup_ai_lifecycle() from public, anon, authenticated;
grant execute on function public.cleanup_ai_lifecycle() to service_role;
