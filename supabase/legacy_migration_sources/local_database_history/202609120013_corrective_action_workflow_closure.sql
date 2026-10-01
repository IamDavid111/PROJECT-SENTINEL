-- Prompt 4 Batches 7 and 9: corrective-action workflow and controlled incident closure.

do $$ begin
  if not exists (select 1 from pg_proc where proname = 'create_corrective_action') then
    create function public.create_corrective_action(target_incident_id uuid, target_investigation_id uuid, action_title text, action_description text, action_category text, action_priority public.corrective_action_priority, target_owner_id uuid, target_due_date date)
    returns public.corrective_actions language plpgsql security definer set search_path = public as $fn$
    declare context_user uuid := (select auth.uid()); incident_row public.incidents; created_action public.corrective_actions;
    begin
      select * into incident_row from public.incidents where id=target_incident_id for update;
      if incident_row.id is null or not public.can_create_corrective_action(incident_row.organization_id) then raise exception 'You are not authorized to create this corrective action'; end if;
      if target_investigation_id is not null and not exists (select 1 from public.investigations where id=target_investigation_id and organization_id=incident_row.organization_id and incident_id=target_incident_id) then raise exception 'Investigation does not belong to this incident'; end if;
      if target_owner_id is not null and not exists (select 1 from public.profiles where id=target_owner_id and organization_id=incident_row.organization_id) then raise exception 'Action owner must belong to the incident organization'; end if;
      if target_due_date is not null and target_due_date < current_date then raise exception 'Due date cannot be in the past'; end if;
      insert into public.corrective_actions (organization_id, incident_id, investigation_id, title, description, action_category, priority, status, assigned_owner_id, assigned_by, assigned_at, due_date, created_by) values (incident_row.organization_id, target_incident_id, target_investigation_id, action_title, action_description, action_category, action_priority, (case when target_owner_id is null then 'open' else 'assigned' end)::public.corrective_action_status, target_owner_id, case when target_owner_id is null then null else context_user end, case when target_owner_id is null then null else now() end, target_due_date, context_user) returning * into created_action;
      insert into public.activity_logs(organization_id,user_id,activity,metadata) values(incident_row.organization_id,context_user,'Corrective action created',jsonb_build_object('event_code','corrective_action_created','corrective_action_id',created_action.id,'incident_id',target_incident_id,'notification_ready',false));
      return created_action;
    end;
    $fn$;
  end if;
end $$;
create or replace function public.update_corrective_action_status(target_action_id uuid, target_status public.corrective_action_status)
returns public.corrective_actions language plpgsql security definer set search_path = public as $$
declare action_row public.corrective_actions; next_action public.corrective_actions; actor uuid := (select auth.uid());
begin
 select * into action_row from public.corrective_actions where id=target_action_id for update;
 if action_row.id is null or not public.can_manage_corrective_action(action_row.organization_id, action_row.id) then raise exception 'You are not authorized to update this corrective action'; end if;
 if not ((action_row.status='open' and target_status='assigned') or (action_row.status in ('assigned','rejected') and target_status='in_progress') or (action_row.status='in_progress' and target_status='pending_verification') or (action_row.status='pending_verification' and target_status in ('verified','in_progress')) or (action_row.status='verified' and target_status='closed')) then raise exception 'Invalid corrective action transition from % to %', action_row.status, target_status; end if;
 update public.corrective_actions set status=target_status, completion_date=case when target_status='pending_verification' then current_date else completion_date end where id=target_action_id returning * into next_action;
 insert into public.activity_logs(organization_id,user_id,activity,metadata) values(action_row.organization_id,actor,'Corrective action status changed',jsonb_build_object('event_code','corrective_action_status_changed','corrective_action_id',target_action_id,'incident_id',action_row.incident_id,'from_status',action_row.status,'to_status',target_status));
 return next_action;
end; $$;
create or replace function public.close_incident(target_incident_id uuid)
returns public.incidents language plpgsql security definer set search_path = public as $$
declare incident_row public.incidents; investigation_row public.investigations; unresolved integer; closed_incident public.incidents; actor uuid := (select auth.uid());
begin
 select * into incident_row from public.incidents where id=target_incident_id for update;
 if incident_row.id is null then raise exception 'Incident not found'; end if;
 if not public.has_org_role(incident_row.organization_id,array['Super Administrator','Organization Administrator','QHSE Manager','Site Supervisor']::public.membership_role[]) then raise exception 'You are not authorized to close this incident'; end if;
 select * into investigation_row from public.investigations where incident_id=target_incident_id and organization_id=incident_row.organization_id;
 if investigation_row.id is null or investigation_row.status <> 'completed' then raise exception 'Investigation must be completed before closure'; end if;
 if not exists(select 1 from public.investigation_root_causes where investigation_id=investigation_row.id and organization_id=incident_row.organization_id) then raise exception 'Root cause is required before closure'; end if;
 select count(*) into unresolved from public.corrective_actions where incident_id=target_incident_id and organization_id=incident_row.organization_id and status not in ('verified','closed');
 if unresolved > 0 then raise exception 'All corrective actions must be verified before closure'; end if;
 update public.incidents set status='pending_verification' where id=target_incident_id;
 update public.incidents set status='closed' where id=target_incident_id returning * into closed_incident;
 insert into public.activity_logs(organization_id,user_id,activity,metadata) values(incident_row.organization_id,actor,'Incident closed',jsonb_build_object('event_code','incident_closed','incident_id',target_incident_id,'notification_key','incident_closed','notification_ready',true));
 return closed_incident;
end; $$;
revoke all on function public.create_corrective_action(uuid,uuid,text,text,text,public.corrective_action_priority,uuid,date) from public,anon;
revoke all on function public.update_corrective_action_status(uuid,public.corrective_action_status) from public,anon;
revoke all on function public.close_incident(uuid) from public,anon;
grant execute on function public.create_corrective_action(uuid,uuid,text,text,text,public.corrective_action_priority,uuid,date) to authenticated;
grant execute on function public.update_corrective_action_status(uuid,public.corrective_action_status) to authenticated;
grant execute on function public.close_incident(uuid) to authenticated;
