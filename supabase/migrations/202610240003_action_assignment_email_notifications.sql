create or replace function public.claim_action_assignment_email(target_event_id uuid, target_actor_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.activity_logs
  set metadata = metadata || jsonb_build_object(
    'email_delivery_status', 'sending',
    'email_delivery_started_at', now()
  )
  where id = target_event_id
    and user_id = target_actor_id
    and activity in ('Action assigned', 'Action reassigned')
    and metadata ? 'notification_key'
    and metadata->>'notification_ready' = 'true'
    and metadata->>'email_delivery_status' is null;
  return found;
end;
$$;

create or replace function public.complete_action_assignment_email(
  target_event_id uuid,
  target_actor_id uuid,
  delivery_succeeded boolean,
  failure_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.activity_logs
  set metadata = metadata || jsonb_build_object(
    'email_delivery_status', case when delivery_succeeded then 'sent' else 'failed' end,
    'email_delivery_completed_at', now(),
    'email_delivery_error_code', case when delivery_succeeded then null else left(coalesce(failure_code, 'unknown'), 80) end
  )
  where id = target_event_id
    and user_id = target_actor_id
    and activity in ('Action assigned', 'Action reassigned')
    and metadata->>'email_delivery_status' = 'sending';
end;
$$;

revoke all on function public.claim_action_assignment_email(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_action_assignment_email(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_action_assignment_email(uuid, uuid) to service_role;
grant execute on function public.complete_action_assignment_email(uuid, uuid, boolean, text) to service_role;
