-- Phase 3: the Safety Copilot (AI Assistant) may ground answers in approved QHSE knowledge.
-- Saved chats store an optional `knowledge` proof key holding the document VERSION IDs whose
-- excerpts reached the model. Versions are never deleted, so a reopened chat re-checks current
-- document readability (RBAC/scope/confidentiality) and locks if the user lost access. Currency
-- (superseded/expired) is deliberately not re-checked: history is not current evidence, and
-- the citation RPC already hides non-current chunk details.

create or replace function public.can_read_ai_session(target_session uuid)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare
  s public.ai_sessions;
  proof record;
  source record;
  source_id uuid;
  allowed boolean;
begin
  select * into s from public.ai_sessions where id=target_session;
  if not found or s.user_id is distinct from auth.uid() or s.expires_at<=now()
    or not public.can_use_ai_sessions(s.organization_id) then return false; end if;
  for proof in
    select p.signature,p.sources from public.ai_session_messages m
    join public.ai_request_logs a on a.request_id=m.request_id
    left join public.ai_conversation_access p on p.request_id=m.request_id and p.session_id=s.id
    where m.session_id=s.id and m.role='assistant' and m.status='succeeded'
      and a.feature='safety_copilot'
  loop
    if proof.signature is distinct from public.ai_access_signature(s.user_id,s.organization_id)
      or proof.signature is null or proof.sources is null then return false; end if;
    for source in select key,value from jsonb_each(proof.sources) loop
      for source_id in select value::uuid from jsonb_array_elements_text(source.value) loop
        allowed := null;
        case source.key
          when 'incidents' then
            select public.can_view_incident(s.organization_id,i.id) and i.status<>'draft' into allowed
            from public.incidents i where i.id=source_id and i.organization_id=s.organization_id;
          when 'actions' then
            select public.can_view_corrective_action(s.organization_id,a.id)
              and public.can_view_incident(s.organization_id,a.incident_id) into allowed
            from public.corrective_actions a where a.id=source_id and a.organization_id=s.organization_id;
          when 'investigations' then
            select public.can_view_investigation(s.organization_id,i.id)
              and public.can_view_incident(s.organization_id,i.incident_id) into allowed
            from public.investigations i where i.id=source_id and i.organization_id=s.organization_id;
          when 'causes' then
            select public.can_view_investigation(s.organization_id,i.id)
              and public.can_view_incident(s.organization_id,i.incident_id) into allowed
            from public.investigation_root_causes c join public.investigations i on i.id=c.investigation_id
              and i.organization_id=c.organization_id
            where c.id=source_id and c.organization_id=s.organization_id;
          when 'findings' then
            select public.can_view_investigation(s.organization_id,i.id)
              and public.can_view_incident(s.organization_id,i.incident_id) into allowed
            from public.investigation_findings f join public.investigations i on i.id=f.investigation_id
              and i.organization_id=f.organization_id
            where f.id=source_id and f.organization_id=s.organization_id;
          when 'closures' then
            select public.can_view_incident(s.organization_id,c.incident_id) into allowed
            from public.incident_closures c where c.incident_id=source_id and c.organization_id=s.organization_id;
          when 'sites' then
            select public.is_org_member(s.organization_id) into allowed from public.sites
              where id=source_id and organization_id=s.organization_id;
          when 'facilities' then
            select public.is_org_member(s.organization_id) into allowed from public.facilities
              where id=source_id and organization_id=s.organization_id;
          when 'knowledge' then
            select public.can_read_knowledge_document(v.organization_id,v.access_scope,v.confidentiality) into allowed
            from public.knowledge_document_versions v where v.id=source_id and v.organization_id=s.organization_id;
          else return false;
        end case;
        if allowed is distinct from true then return false; end if;
      end loop;
    end loop;
  end loop;
  return true;
end;
$$;

create or replace function public.finish_ai_session_turn(p_request_id uuid, p_completion jsonb, p_text text default null)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  audit public.ai_request_logs;
  session public.ai_sessions;
  source record;
  source_id uuid;
begin
  select * into audit from public.ai_request_logs where request_id=p_request_id;
  select * into session from public.ai_sessions where id=audit.session_id for update;
  if not found or session.active_request_id is distinct from p_request_id
    or session.user_id is distinct from audit.user_id or session.organization_id<>audit.organization_id then
    return false;
  end if;
  if p_completion->>'status' not in ('succeeded','failed') then raise exception 'Invalid AI completion'; end if;
  if p_completion->>'status'='succeeded' then
    if audit.feature='safety_copilot' then
      -- All 8 operational keys are mandatory; `knowledge` is optional (absent when none was supplied).
      if jsonb_typeof(p_completion->'access_sources') is distinct from 'object'
        or (select count(*) from jsonb_object_keys(p_completion->'access_sources') k
            where k in ('incidents','actions','investigations','causes','findings','closures','sites','facilities'))<>8 then
        raise exception 'Missing complete conversation access proof' using errcode='22023';
      end if;
      for source in select key,value from jsonb_each(p_completion->'access_sources') loop
        if source.key not in ('incidents','actions','investigations','causes','findings','closures','sites','facilities','knowledge')
          or jsonb_typeof(source.value)<>'array' or jsonb_array_length(source.value)>10000
          or (source.key='knowledge' and jsonb_array_length(source.value) not between 1 and 50) then
          raise exception 'Invalid conversation access proof' using errcode='22023';
        end if;
        for source_id in select value::uuid from jsonb_array_elements_text(source.value) loop
          if source_id is null then raise exception 'Invalid source ID' using errcode='22023'; end if;
        end loop;
      end loop;
      update public.ai_conversation_access set sources=p_completion->'access_sources' where request_id=p_request_id;
      if not found then raise exception 'Missing reserved conversation access proof' using errcode='22023'; end if;
    end if;
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

-- Returns only validated knowledge chunk IDs; titles/excerpts are re-resolved by the client via
-- get_knowledge_citations, which re-applies current permissions.
create or replace function public.get_ai_session_evidence(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare result jsonb;
begin
  if not public.can_read_ai_session(p_session_id) then
    raise exception 'AI conversation evidence access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'request_id',a.request_id,'sourceIds',coalesce(a.response_metadata->'validated_citation_ids','[]'::jsonb),
    'knowledgeSourceIds',coalesce(a.response_metadata->'validated_knowledge_citation_ids','[]'::jsonb),
    'asOf',a.response_metadata->'grounding_as_of','methodology',a.response_metadata->'methodology_version',
    'visibility',a.response_metadata->'grounding_scope'->'visibility','presentation',m.answer_presentation
  ) order by m.id),'[]'::jsonb) into result
  from public.ai_session_messages m join public.ai_request_logs a on a.request_id=m.request_id
  where m.session_id=p_session_id and m.role='assistant' and m.status='succeeded'
    and a.session_id=m.session_id and a.user_id=auth.uid()
    and a.status='succeeded' and a.feature='safety_copilot';
  return result;
end;
$$;
