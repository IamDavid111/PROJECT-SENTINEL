SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.seed_starnet_mock_incident_batch (
  p_rows jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  target_organization_id constant uuid := '25ad3a5c-514b-4097-96a6-a712c715d92b';
  target_company_code constant text := 'SENT-23FKES';
  target_batch constant text := 'MOCK-STARNET-INCIDENTS-20260929';
  current_user_id uuid := (select auth.uid());
  current_profile public.profiles;
  target_organization public.organizations;
  configured public.company_settings;
  incident_input record;
  reporter_profile public.profiles;
  investigator_profile public.profiles;
  owner_profile public.profiles;
  created_incident public.incidents;
  created_investigation public.investigations;
  created_action public.corrective_actions;
  desired_investigation_status public.investigation_status;
  desired_incident_status public.incident_status;
  desired_action_status public.corrective_action_status;
  assigned_time timestamptz;
  investigation_start timestamptz;
  investigation_complete timestamptz;
  action_created_time timestamptz;
  action_due_date date;
  requested_count integer;
  existing_count integer;
  inserted_count integer := 0;
  investigation_count integer := 0;
  finding_count integer := 0;
  root_cause_count integer := 0;
  correction_count integer := 0;
  action_count integer := 0;
  closure_count integer := 0;
  people_count integer := 0;
  activity_count integer := 0;
  evidence_count integer := 0;
  by_status jsonb := '{}'::jsonb;
  by_severity jsonb := '{}'::jsonb;
  by_category jsonb := '{}'::jsonb;
  incident_day date;
begin
  -- SECURITY DEFINER grants this function elevated database access, so it repeats caller, active-profile,
  -- organization, and administrator checks instead of trusting the Edge Function's request preflight.
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select * into current_profile
  from public.profiles
  where id = current_user_id
    and organization_id = target_organization_id
    and account_status = 'active';
  if not found or not public.has_org_role(target_organization_id, array['Super Administrator', 'Organization Administrator']::public.membership_role[]) then
    raise exception 'An active StarNet Tech organization administrator is required';
  end if;

  select * into target_organization
  from public.organizations
  where id = target_organization_id and company_code = target_company_code and company_name = 'StarNet Tech';
  if not found then raise exception 'Target StarNet Tech organization was not found'; end if;

  select * into configured from public.company_settings where organization_id = target_organization_id for share;
  if not found then raise exception 'StarNet Tech Settings were not found'; end if;

  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Incident seed payload must be a JSON array'; end if;
  requested_count := jsonb_array_length(p_rows);
  if requested_count <> 1000 then raise exception 'Exactly 1000 incident rows are required, received %', requested_count; end if;

  select count(*) into existing_count
  from public.incidents
  where organization_id = target_organization_id
    and client_submission_id like target_batch || '-%';
  if existing_count = 1000 then
    select coalesce(jsonb_object_agg(status::text, row_count), '{}'::jsonb) into by_status
    from (select status, count(*) as row_count from public.incidents where organization_id = target_organization_id and client_submission_id like target_batch || '-%' group by status) grouped_status;
    select coalesce(jsonb_object_agg(coalesce(severity, '<null>'), row_count), '{}'::jsonb) into by_severity
    from (select severity, count(*) as row_count from public.incidents where organization_id = target_organization_id and client_submission_id like target_batch || '-%' group by severity) grouped_severity;
    select coalesce(jsonb_object_agg(coalesce(incident_category, '<null>'), row_count), '{}'::jsonb) into by_category
    from (select incident_category, count(*) as row_count from public.incidents where organization_id = target_organization_id and client_submission_id like target_batch || '-%' group by incident_category) grouped_category;
    select count(*) into investigation_count from public.investigations i join public.incidents inc on inc.id = i.incident_id where inc.organization_id = target_organization_id and inc.client_submission_id like target_batch || '-%';
    select count(*) into finding_count from public.investigation_findings f join public.investigations i on i.id = f.investigation_id join public.incidents inc on inc.id = i.incident_id where inc.organization_id = target_organization_id and inc.client_submission_id like target_batch || '-%';
    select count(*) into root_cause_count from public.investigation_root_causes r join public.investigations i on i.id = r.investigation_id join public.incidents inc on inc.id = i.incident_id where inc.organization_id = target_organization_id and inc.client_submission_id like target_batch || '-%';
    select count(*) into correction_count from public.investigation_corrections c join public.investigations i on i.id = c.investigation_id join public.incidents inc on inc.id = i.incident_id where inc.organization_id = target_organization_id and inc.client_submission_id like target_batch || '-%';
    select count(*) into action_count from public.corrective_actions a join public.incidents inc on inc.id = a.incident_id where inc.organization_id = target_organization_id and inc.client_submission_id like target_batch || '-%';
    select count(*) into closure_count from public.incidents where organization_id = target_organization_id and client_submission_id like target_batch || '-%' and status = 'closed';
    select count(*) into people_count from public.incident_people p join public.incidents inc on inc.id = p.incident_id where inc.organization_id = target_organization_id and inc.client_submission_id like target_batch || '-%';
    select count(*) into activity_count from public.activity_logs where organization_id = target_organization_id and metadata->>'incident_id' in (select id::text from public.incidents where organization_id = target_organization_id and client_submission_id like target_batch || '-%');
    select count(*) into evidence_count from public.incident_evidence e join public.incidents inc on inc.id = e.incident_id where inc.organization_id = target_organization_id and inc.client_submission_id like target_batch || '-%';
    return jsonb_build_object('batch_id', target_batch, 'created_count', 0, 'existing_count', existing_count,
      'incidents', existing_count, 'people', people_count, 'evidence', evidence_count, 'activity_logs', activity_count,
      'investigations', investigation_count, 'findings', finding_count, 'root_causes', root_cause_count,
      'investigation_corrections', correction_count, 'corrective_actions', action_count, 'closed_incidents', closure_count,
      'by_status', by_status, 'by_severity', by_severity, 'by_category', by_category);
  elsif existing_count <> 0 then
    raise exception 'A partial mock incident batch already exists (% records); refusing to duplicate or extend it', existing_count;
  end if;

  for incident_input in
    select *
    from jsonb_to_recordset(p_rows) as r(
      batch_index integer,
      report_type public.incident_report_type,
      desired_status public.incident_status,
      title text,
      description text,
      occurred_at timestamptz,
      reported_at timestamptz,
      site_id uuid,
      facility_id uuid,
      location text,
      department text,
      shift text,
      work_activity_context text,
      reported_by uuid,
      severity text,
      potential_severity text,
      incident_category text,
      environmental_impact boolean,
      injury_or_illness boolean,
      property_damage boolean,
      work_related boolean,
      immediate_correction text,
      priority text,
      gps_coordinates text,
      weather_conditions text,
      equipment_involved text,
      people_involved text,
      witnesses text,
      affected_person_name text,
      affected_person_organization text,
      witness_name text,
      witness_organization text,
      witness_contact_details text,
      contractor_involved boolean,
      contractor_organization text,
      potential_root_cause text,
      investigation_status public.investigation_status,
      investigator_id uuid,
      finding text,
      root_cause_statement text,
      contributing_factors text,
      correction_description text,
      containment_taken text,
      action_title text,
      action_description text,
      action_priority public.corrective_action_priority,
      action_status public.corrective_action_status,
      action_owner_id uuid,
      action_due_date date
    )
    order by batch_index
  loop
    if incident_input.batch_index <> inserted_count + 1 then
      raise exception 'Batch indexes must be a complete sequence from 1 to 1000';
    end if;
    if (incident_input.occurred_at at time zone 'UTC')::date < date '2023-09-29'
      or (incident_input.occurred_at at time zone 'UTC')::date > date '2026-09-29'
      or incident_input.reported_at < incident_input.occurred_at
      or incident_input.reported_at >= timestamptz '2026-09-30 00:00:00+00' then
      raise exception 'Incident % is outside the allowed UTC date range: occurred_at %, reported_at %', incident_input.batch_index, incident_input.occurred_at, incident_input.reported_at;
    end if;
    if nullif(btrim(incident_input.title), '') is null
      or nullif(btrim(incident_input.description), '') is null
      or nullif(btrim(incident_input.immediate_correction), '') is null
      or nullif(btrim(incident_input.location), '') is null
      or nullif(btrim(incident_input.department), '') is null
      or nullif(btrim(incident_input.shift), '') is null
      or nullif(btrim(incident_input.severity), '') is null
      or nullif(btrim(incident_input.incident_category), '') is null
      or nullif(btrim(incident_input.equipment_involved), '') is null
      or nullif(btrim(incident_input.weather_conditions), '') is null
      or nullif(btrim(incident_input.people_involved), '') is null then
      raise exception 'Incident % is missing a required dataset field', incident_input.batch_index;
    end if;
    if incident_input.desired_status = 'draft' then raise exception 'Mock incidents cannot be drafts'; end if;
    if incident_input.desired_status in ('investigation', 'corrective_action', 'pending_verification', 'closed')
      and incident_input.investigation_status is null then
      raise exception 'Incident % needs an investigation record for its status', incident_input.batch_index;
    end if;
    if incident_input.desired_status in ('corrective_action', 'pending_verification', 'closed')
      and incident_input.investigation_status <> 'completed' then
      raise exception 'Incident % requires a completed investigation for its status', incident_input.batch_index;
    end if;
    if incident_input.desired_status = 'corrective_action'
      and (incident_input.action_title is null or incident_input.action_status is null or incident_input.action_status not in ('assigned', 'in_progress')) then
      raise exception 'Corrective-action incident % needs an assigned or active action', incident_input.batch_index;
    end if;
    if incident_input.desired_status in ('pending_verification', 'closed')
      and (incident_input.action_title is null or incident_input.action_status is null or incident_input.action_status not in ('verified', 'closed')) then
      raise exception 'Resolved incident % needs a verified corrective action', incident_input.batch_index;
    end if;
    if incident_input.action_title is not null
      and (incident_input.action_status is null or incident_input.action_due_date is null or incident_input.action_owner_id is null) then
      raise exception 'Incident % has an incomplete corrective-action assignment', incident_input.batch_index;
    end if;
    if incident_input.desired_status = 'closed' and incident_input.root_cause_statement is null then
      raise exception 'Closed incident % needs a formal root cause', incident_input.batch_index;
    end if;

    select * into reporter_profile
    from public.profiles
    where id = incident_input.reported_by
      and organization_id = target_organization_id
      and account_status = 'active'
      and employee_id like 'MOCK-STARNET-20260930-%';
    if not found or not exists (
      select 1 from public.memberships
      where user_id = incident_input.reported_by and organization_id = target_organization_id
    ) then
      raise exception 'Incident % reporter is not an active tagged mock member', incident_input.batch_index;
    end if;

    select * into investigator_profile
    from public.profiles
    where id = incident_input.investigator_id
      and organization_id = target_organization_id
      and account_status = 'active'
      and employee_id like 'MOCK-STARNET-20260930-%';
    if incident_input.investigation_status is not null and not found then
      raise exception 'Incident % investigator is not an active tagged mock member', incident_input.batch_index;
    end if;

    if not exists (select 1 from public.sites where id = incident_input.site_id and organization_id = target_organization_id)
      or not exists (select 1 from public.facilities where id = incident_input.facility_id and site_id = incident_input.site_id and organization_id = target_organization_id) then
      raise exception 'Incident % site/facility relationship is invalid', incident_input.batch_index;
    end if;
    if not public.company_setting_has_active_name(configured.operational_sites, (select name from public.sites where id = incident_input.site_id))
      or not public.company_setting_has_active_name(configured.departments, incident_input.department)
      or not public.company_setting_has_active_name(configured.working_hours->'shifts', incident_input.shift)
      or not public.company_setting_has_active_name(configured.severity_levels, incident_input.severity)
      or not public.company_setting_has_active_name(configured.incident_categories, incident_input.incident_category)
      or (incident_input.potential_severity is not null and not public.company_setting_has_active_name(configured.severity_levels, incident_input.potential_severity)) then
      raise exception 'Incident % contains a value that is not active in Settings', incident_input.batch_index;
    end if;
    if incident_input.contractor_involved is distinct from (incident_input.contractor_organization is not null) then
      raise exception 'Incident % has inconsistent contractor details', incident_input.batch_index;
    end if;

    incident_day := incident_input.occurred_at::date;
    insert into public.incidents (
      organization_id, report_type, status, title, description, occurred_at, reported_at,
      site_id, facility_id, location, department, shift, work_activity_context,
      reported_by, created_by, contractor_involved, contractor_organization,
      severity, potential_severity, incident_category, environmental_impact,
      injury_or_illness, property_damage, work_related, immediate_correction,
      priority, gps_coordinates, weather_conditions, equipment_involved, people_involved, witnesses,
      potential_root_cause, digital_signature, accuracy_confirmed, client_submission_id, created_at, updated_at
    ) values (
      target_organization_id, incident_input.report_type, 'submitted', incident_input.title,
      incident_input.description, incident_input.occurred_at, incident_input.reported_at,
      incident_input.site_id, incident_input.facility_id, incident_input.location,
      incident_input.department, incident_input.shift, incident_input.work_activity_context,
      incident_input.reported_by, incident_input.reported_by, incident_input.contractor_involved,
      incident_input.contractor_organization, incident_input.severity, incident_input.potential_severity,
      incident_input.incident_category, incident_input.environmental_impact,
      incident_input.injury_or_illness, incident_input.property_damage, incident_input.work_related,
      incident_input.immediate_correction, incident_input.priority, incident_input.gps_coordinates, incident_input.weather_conditions,
      incident_input.equipment_involved, incident_input.people_involved, incident_input.witnesses,
      incident_input.potential_root_cause, 'MOCK:' || target_batch, true,
      target_batch || '-' || lpad(incident_input.batch_index::text, 4, '0'),
      incident_input.occurred_at, incident_input.reported_at
    ) returning * into created_incident;
    inserted_count := inserted_count + 1;

    if incident_input.affected_person_name is not null then
      insert into public.incident_people (organization_id, incident_id, person_type, profile_id, full_name, organization_name)
      values (target_organization_id, created_incident.id, 'affected_person', null,
        incident_input.affected_person_name, incident_input.affected_person_organization);
    end if;
    if incident_input.witness_name is not null then
      insert into public.incident_people (organization_id, incident_id, person_type, profile_id, full_name, organization_name, contact_details)
      values (target_organization_id, created_incident.id, 'witness', null,
        incident_input.witness_name, incident_input.witness_organization, incident_input.witness_contact_details);
    end if;

    insert into public.activity_logs (organization_id, user_id, activity, metadata, created_at)
    values (target_organization_id, current_user_id, 'Mock incident report seeded',
      jsonb_build_object('event_code', 'incident_submitted', 'incident_id', created_incident.id,
        'report_type', incident_input.report_type, 'mock_batch_id', target_batch,
        'reported_by', incident_input.reported_by), incident_input.reported_at);

    desired_incident_status := incident_input.desired_status;
    if desired_incident_status = 'under_review' then
      update public.incidents set status = 'under_review' where id = created_incident.id;
    elsif desired_incident_status in ('investigation', 'corrective_action', 'pending_verification', 'closed') then
      assigned_time := incident_input.reported_at + interval '2 hours';
      investigation_start := least(assigned_time + interval '1 hour', now());
      investigation_complete := least(investigation_start + interval '1 day', now());
      insert into public.investigations (
        organization_id, incident_id, status, assigned_investigator_id, investigation_lead_id,
        assigned_by, assigned_at, started_at, target_completion_date, completed_at,
        created_by, created_at, updated_at
      ) values (
        target_organization_id, created_incident.id, 'assigned', incident_input.investigator_id,
        incident_input.investigator_id, current_user_id, assigned_time,
        case when incident_input.investigation_status = 'assigned' then null else investigation_start end,
        greatest(incident_day + 14, incident_day),
        case when incident_input.investigation_status = 'completed' then investigation_complete else null end,
        current_user_id, assigned_time, assigned_time
      ) returning * into created_investigation;
      investigation_count := investigation_count + 1;

      update public.incidents set status = 'under_review' where id = created_incident.id;
      update public.incidents set status = 'investigation' where id = created_incident.id;

      if incident_input.finding is not null then
        insert into public.investigation_findings (organization_id, investigation_id, description, finding_type, significance, evidence_reference, created_by, created_at, updated_at)
        values (target_organization_id, created_investigation.id, incident_input.finding, 'Operational observation', incident_input.severity, 'Mock interview/work-order review', current_user_id, investigation_start, investigation_start);
        finding_count := finding_count + 1;
      end if;
      if incident_input.root_cause_statement is not null then
        insert into public.investigation_root_causes (organization_id, investigation_id, root_cause_statement, contributing_factors, cause_category, supporting_explanation, evidence_reference, created_by, created_at, updated_at)
        values (target_organization_id, created_investigation.id, incident_input.root_cause_statement, incident_input.contributing_factors, 'Work process / equipment', 'Mock analysis based on the recorded event and operating conditions.', 'Mock maintenance and toolbox records', current_user_id, investigation_complete, investigation_complete);
        root_cause_count := root_cause_count + 1;
      end if;
      if incident_input.correction_description is not null then
        insert into public.investigation_corrections (organization_id, investigation_id, correction_description, containment_taken, responsible_person_id, completed_at, created_by, created_at, updated_at)
        values (target_organization_id, created_investigation.id, incident_input.correction_description, incident_input.containment_taken, incident_input.reported_by, least(investigation_complete + interval '1 day', now()), current_user_id, investigation_complete, investigation_complete);
        correction_count := correction_count + 1;
      end if;

      if incident_input.investigation_status in ('in_progress', 'pending_review', 'completed') then
        update public.investigations set status = 'in_progress' where id = created_investigation.id;
      end if;
      if incident_input.investigation_status in ('pending_review', 'completed') then
        update public.investigations set status = 'pending_review' where id = created_investigation.id;
      end if;
      if incident_input.investigation_status = 'completed' then
        update public.investigations set status = 'completed' where id = created_investigation.id;
      end if;

      if incident_input.action_title is not null then
        select * into owner_profile from public.profiles
        where id = incident_input.action_owner_id
          and organization_id = target_organization_id
          and account_status = 'active'
          and employee_id like 'MOCK-STARNET-20260930-%';
        if not found then raise exception 'Incident % corrective-action owner is not an active tagged mock member', incident_input.batch_index; end if;

        action_created_time := incident_input.reported_at + interval '3 hours';
        action_due_date := incident_input.action_due_date;
        if action_due_date < action_created_time::date then
          raise exception 'Incident % corrective action due date predates action creation', incident_input.batch_index;
        end if;
        insert into public.corrective_actions (
          organization_id, incident_id, investigation_id, title, description, action_category,
          priority, status, assigned_owner_id, assigned_by, assigned_at, due_date,
          created_by, created_at, updated_at, completion_date, verification_status,
          verification_date, verified_by, verification_notes
        ) values (
          target_organization_id, created_incident.id, created_investigation.id,
          incident_input.action_title, incident_input.action_description, 'Preventive maintenance / work practice',
          incident_input.action_priority, 'assigned', owner_profile.id, current_user_id, action_created_time,
          action_due_date, current_user_id, action_created_time, action_created_time,
          null, null, null, null, null
        ) returning * into created_action;
        action_count := action_count + 1;

        if incident_input.action_status in ('in_progress', 'pending_verification', 'verified', 'closed') then
          update public.corrective_actions set status = 'in_progress' where id = created_action.id;
        end if;
        if incident_input.action_status in ('pending_verification', 'verified', 'closed') then
          perform public.submit_corrective_action_for_verification(created_action.id);
        end if;
        if incident_input.action_status in ('verified', 'closed') then
          perform public.verify_corrective_action(created_action.id, true, 'Mock close-out evidence reviewed by organization management.');
        end if;
        if incident_input.action_status = 'closed' then
          perform public.update_corrective_action_status(created_action.id, 'closed'::public.corrective_action_status);
        end if;
      end if;

      if desired_incident_status in ('corrective_action', 'pending_verification', 'closed') then
        update public.incidents set status = 'corrective_action' where id = created_incident.id;
      end if;
      if desired_incident_status in ('pending_verification', 'closed') then
        update public.incidents set status = 'pending_verification' where id = created_incident.id;
      end if;
      if desired_incident_status = 'closed' then
        perform public.close_incident(created_incident.id);
        closure_count := closure_count + 1;
      end if;
    end if;
  end loop;

  select count(*) into people_count
  from public.incident_people
  where organization_id = target_organization_id
    and incident_id in (select id from public.incidents where organization_id = target_organization_id and client_submission_id like target_batch || '-%');
  select count(*) into activity_count
  from public.activity_logs
  where organization_id = target_organization_id
    and metadata->>'incident_id' in (select id::text from public.incidents where organization_id = target_organization_id and client_submission_id like target_batch || '-%');
  select count(*) into evidence_count
  from public.incident_evidence
  where organization_id = target_organization_id
    and incident_id in (select id from public.incidents where organization_id = target_organization_id and client_submission_id like target_batch || '-%');
  select coalesce(jsonb_object_agg(status::text, row_count), '{}'::jsonb) into by_status
  from (select status, count(*) as row_count from public.incidents where organization_id = target_organization_id and client_submission_id like target_batch || '-%' group by status) grouped_status;
  select coalesce(jsonb_object_agg(coalesce(severity, '<null>'), row_count), '{}'::jsonb) into by_severity
  from (select severity, count(*) as row_count from public.incidents where organization_id = target_organization_id and client_submission_id like target_batch || '-%' group by severity) grouped_severity;
  select coalesce(jsonb_object_agg(coalesce(incident_category, '<null>'), row_count), '{}'::jsonb) into by_category
  from (select incident_category, count(*) as row_count from public.incidents where organization_id = target_organization_id and client_submission_id like target_batch || '-%' group by incident_category) grouped_category;

  return jsonb_build_object(
    'batch_id', target_batch,
    'created_count', inserted_count,
    'existing_count', 0,
    'incidents', inserted_count,
    'people', people_count,
    'evidence', evidence_count,
    'activity_logs', activity_count,
    'investigations', investigation_count,
    'findings', finding_count,
    'root_causes', root_cause_count,
    'investigation_corrections', correction_count,
    'corrective_actions', action_count,
    'closed_incidents', closure_count,
    'by_status', by_status,
    'by_severity', by_severity,
    'by_category', by_category
  );
end;
$function$;
