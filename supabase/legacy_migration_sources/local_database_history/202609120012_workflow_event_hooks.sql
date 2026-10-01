-- Prompt 4 Batch 10: structured audit and notification-readiness events.
-- Delivery is intentionally deferred; activity_logs is the existing event store.

create or replace function public.record_workflow_event(
  target_organization_id uuid,
  event_code text,
  event_label text,
  entity_type text,
  entity_id uuid,
  incident_id uuid default null,
  event_metadata jsonb default '{}'::jsonb,
  notification_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_member(target_organization_id) then
    raise exception 'Organization membership is required';
  end if;
  if event_code is null or btrim(event_code) = '' then
    raise exception 'Workflow event code is required';
  end if;
  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  values (
    target_organization_id,
    (select auth.uid()),
    event_label,
    coalesce(event_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'event_code', event_code,
        'entity_type', entity_type,
        'entity_id', entity_id,
        'incident_id', incident_id,
        'notification_key', notification_key,
        'notification_ready', notification_key is not null
      )
  );
end;
$$;
revoke all on function public.record_workflow_event(uuid, text, text, text, uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.record_workflow_event(uuid, text, text, text, uuid, uuid, jsonb, text) to authenticated;
create index if not exists activity_logs_workflow_event_code_idx
  on public.activity_logs ((metadata ->> 'event_code'), created_at desc)
  where metadata ? 'event_code';
create index if not exists activity_logs_notification_key_idx
  on public.activity_logs ((metadata ->> 'notification_key'), created_at desc)
  where metadata ? 'notification_key';
create or replace function public.normalize_workflow_activity_event()
returns trigger
language plpgsql
as $$
declare
  normalized_code text;
  normalized_notification text;
begin
  normalized_code := case
    when new.activity = 'Investigation created' then 'investigation_created'
    when new.activity = 'Investigator assigned' then 'investigator_assigned'
    when new.activity = 'Investigation started' or new.activity ilike 'Investigation status changed to in_progress%' then 'investigation_started'
    when new.activity = 'Investigation completed' or new.activity ilike 'Investigation status changed to completed%' then 'investigation_completed'
    when new.activity = 'Finding added' then 'finding_added'
    when new.activity = 'Finding updated' then 'finding_updated'
    when new.activity = 'Root cause updated' then 'root_cause_updated'
    when new.activity = 'Immediate correction recorded' then 'immediate_correction_recorded'
    when new.activity = 'Corrective action created' then 'corrective_action_created'
    when new.activity = 'Corrective action assigned' then 'corrective_action_assigned'
    when new.activity ilike 'Corrective action status changed%' then 'corrective_action_status_changed'
    when new.activity = 'Corrective action completed' then 'corrective_action_completed'
    when new.activity = 'Corrective action verification requested' then 'verification_requested'
    when new.activity = 'Corrective action verification approved' then 'verification_approved'
    when new.activity = 'Corrective action verification rejected' then 'verification_rejected'
    when new.activity = 'Incident closed' then 'incident_closed'
    else null
  end;
  normalized_notification := case normalized_code
    when 'investigator_assigned' then 'investigation_assigned'
    when 'corrective_action_assigned' then 'corrective_action_assigned'
    when 'verification_requested' then 'verification_requested'
    when 'verification_rejected' then 'verification_rejected'
    when 'incident_closed' then 'incident_closed'
    else null
  end;
  if normalized_code is not null then
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object('event_code', normalized_code, 'notification_key', normalized_notification, 'notification_ready', normalized_notification is not null);
  end if;
  return new;
end;
$$;
drop trigger if exists activity_logs_normalize_workflow_event on public.activity_logs;
create trigger activity_logs_normalize_workflow_event
before insert on public.activity_logs
for each row execute function public.normalize_workflow_activity_event();
