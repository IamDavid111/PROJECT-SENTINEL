-- Saved-chat access re-check, set-based. Same semantics as 202610070008: every source ID recorded in
-- every succeeded copilot turn must still be readable, else the whole chat is locked. The previous
-- row-by-row loop re-checked identical IDs once per turn and hit the statement timeout on real
-- organisations (~3k IDs per turn). IDs are now de-duplicated across turns and checked per key.
create or replace function public.can_read_ai_session(target_session uuid)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare
  s public.ai_sessions;
  sig text;
  keys text[];
  ids uuid[];
  priv boolean;
  inc_priv boolean;
  member boolean;
  me uuid := auth.uid();
begin
  select * into s from public.ai_sessions where id=target_session;
  if not found or s.user_id is distinct from auth.uid() or s.expires_at<=now()
    or not public.can_use_ai_sessions(s.organization_id) then return false; end if;
  sig := public.ai_access_signature(s.user_id,s.organization_id);
  -- Visibility is evaluated set-based instead of calling can_view_incident / can_view_corrective_action /
  -- can_view_investigation per row (SECURITY DEFINER functions are not inlined, ~3k IDs per turn).
  -- The role list and ownership/assignment rules below MIRROR those functions; keep them in sync.
  member := public.is_org_member(s.organization_id);
  priv := member and public.has_org_role(s.organization_id, array[
    'Super Administrator','Organization Administrator','QHSE Manager','Site Supervisor',
    'Safety Officer / HSE Officer','Auditor','Executive / Management']::public.membership_role[]);
  inc_priv := priv or (member and public.can_close_incidents(s.organization_id));

  -- A missing/stale proof on any succeeded copilot turn locks the chat.
  if exists (
    select 1 from public.ai_session_messages m
    join public.ai_request_logs a on a.request_id=m.request_id
    left join public.ai_conversation_access p on p.request_id=m.request_id and p.session_id=s.id
    where m.session_id=s.id and m.role='assistant' and m.status='succeeded' and a.feature='safety_copilot'
      and (p.signature is null or p.sources is null or p.signature is distinct from sig)
  ) then return false; end if;

  select array_agg(d.key), array_agg(d.id) into keys, ids from (select distinct e.key, v.value::uuid id
  from public.ai_session_messages m
  join public.ai_request_logs a on a.request_id=m.request_id
  join public.ai_conversation_access p on p.request_id=m.request_id and p.session_id=s.id
  cross join lateral jsonb_each(p.sources) e
  cross join lateral jsonb_array_elements_text(e.value) v
  where m.session_id=s.id and m.role='assistant' and m.status='succeeded' and a.feature='safety_copilot') d;

  return not exists (
    select 1 from unnest(keys, ids) x(key, id) where x.key not in
      ('incidents','actions','investigations','causes','findings','closures','sites','facilities','knowledge')
  )
  and not exists (
    select 1 from unnest(keys, ids) x(key, id) where x.key='incidents' and not exists (
      select 1 from public.incidents i where i.id=x.id and i.organization_id=s.organization_id
        and i.status<>'draft' and (inc_priv or (member and exists (select 1 from public.incidents o where o.id=i.id and o.organization_id=s.organization_id and (o.created_by=me or o.reported_by=me))))))
  and not exists (
    select 1 from unnest(keys, ids) x(key, id) where x.key='actions' and not exists (
      select 1 from public.corrective_actions a where a.id=x.id and a.organization_id=s.organization_id
        and (priv or (member and (a.assigned_owner_id=me or a.created_by=me)))
        and (inc_priv or (member and exists (select 1 from public.incidents o where o.id=a.incident_id and o.organization_id=s.organization_id and (o.created_by=me or o.reported_by=me))))))
  and not exists (
    select 1 from unnest(keys, ids) x(key, id) where x.key='investigations' and not exists (
      select 1 from public.investigations i where i.id=x.id and i.organization_id=s.organization_id
        and (priv or (member and (i.assigned_investigator_id=me or i.investigation_lead_id=me or i.created_by=me)))
        and (inc_priv or (member and exists (select 1 from public.incidents o where o.id=i.incident_id and o.organization_id=s.organization_id and (o.created_by=me or o.reported_by=me))))))
  and not exists (
    select 1 from unnest(keys, ids) x(key, id) where x.key='causes' and not exists (
      select 1 from public.investigation_root_causes c join public.investigations i
        on i.id=c.investigation_id and i.organization_id=c.organization_id
      where c.id=x.id and c.organization_id=s.organization_id
        and (priv or (member and (i.assigned_investigator_id=me or i.investigation_lead_id=me or i.created_by=me)))
        and (inc_priv or (member and exists (select 1 from public.incidents o where o.id=i.incident_id and o.organization_id=s.organization_id and (o.created_by=me or o.reported_by=me))))))
  and not exists (
    select 1 from unnest(keys, ids) x(key, id) where x.key='findings' and not exists (
      select 1 from public.investigation_findings f join public.investigations i
        on i.id=f.investigation_id and i.organization_id=f.organization_id
      where f.id=x.id and f.organization_id=s.organization_id
        and (priv or (member and (i.assigned_investigator_id=me or i.investigation_lead_id=me or i.created_by=me)))
        and (inc_priv or (member and exists (select 1 from public.incidents o where o.id=i.incident_id and o.organization_id=s.organization_id and (o.created_by=me or o.reported_by=me))))))
  and not exists (
    select 1 from unnest(keys, ids) x(key, id) where x.key='closures' and not exists (
      select 1 from public.incident_closures c where c.incident_id=x.id and c.organization_id=s.organization_id
        and (inc_priv or (member and exists (select 1 from public.incidents o where o.id=c.incident_id and o.organization_id=s.organization_id and (o.created_by=me or o.reported_by=me))))))
  and not exists (
    select 1 from unnest(keys, ids) x(key, id) where x.key in ('sites','facilities') and (
      not member
      or (x.key='sites' and not exists (select 1 from public.sites t where t.id=x.id and t.organization_id=s.organization_id))
      or (x.key='facilities' and not exists (select 1 from public.facilities t where t.id=x.id and t.organization_id=s.organization_id))))
  and not exists (
    select 1 from unnest(keys, ids) x(key, id) where x.key='knowledge' and not exists (
      select 1 from public.knowledge_document_versions v where v.id=x.id and v.organization_id=s.organization_id
        and public.can_read_knowledge_document(v.organization_id,v.access_scope,v.confidentiality)));
end;
$$;
