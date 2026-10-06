-- Owner-only narrow projection: audits remain private and citations never expose stale source titles.
create function public.get_ai_session_evidence(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  session public.ai_sessions;
  result jsonb;
begin
  select * into session from public.ai_sessions where id=p_session_id;
  if not found or session.user_id <> auth.uid() or session.expires_at <= now()
    or not public.can_use_ai_sessions(session.organization_id) then
    raise exception 'AI conversation evidence access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'request_id',a.request_id,
    'sourceIds',coalesce(a.response_metadata->'validated_citation_ids','[]'::jsonb),
    'asOf',a.response_metadata->'grounding_as_of',
    'methodology',a.response_metadata->'methodology_version',
    'visibility',a.response_metadata->'grounding_scope'->'visibility',
    'presentation',m.answer_presentation
  ) order by m.id),'[]'::jsonb) into result
  from public.ai_session_messages m join public.ai_request_logs a on a.request_id=m.request_id
  where m.session_id=session.id and m.role='assistant' and m.status='succeeded'
    and a.session_id=session.id and a.user_id=session.user_id
    and a.organization_id=session.organization_id and a.status='succeeded' and a.feature='safety_copilot';
  return result;
end;
$$;
revoke all on function public.get_ai_session_evidence(uuid) from public,anon;
grant execute on function public.get_ai_session_evidence(uuid) to authenticated;
-- Structured answer content shares conversation retention, not the longer-lived audit retention.
alter table public.ai_session_messages add column answer_presentation jsonb;
create or replace function public.finish_ai_session_turn(p_request_id uuid, p_completion jsonb, p_text text default null)
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
  if p_completion->>'status' not in ('succeeded','failed') then
    raise exception 'Invalid AI completion';
  end if;
  if p_completion->>'status' = 'succeeded' then
    insert into public.ai_session_messages(session_id,request_id,role,content,status,answer_presentation)
      values(session.id,p_request_id,'assistant',p_text,'succeeded',p_completion->'answer_presentation');
  end if;
  update public.ai_session_messages set status=p_completion->>'status' where request_id=p_request_id and role='user';
  update public.ai_request_logs set status=p_completion->>'status',
    completed_at=(p_completion->>'completed_at')::timestamptz,error_code=p_completion->>'error_code',
    response_metadata=p_completion->'response_metadata' where request_id=p_request_id and status='pending';
  update public.ai_sessions set active_request_id=null,active_started_at=null,updated_at=now() where id=session.id;
  return true;
end;
$$;
