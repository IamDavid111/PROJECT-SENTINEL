create or replace function public.save_incident_draft(
  p_incident_id uuid default null,
  p_input jsonb default '{}'::jsonb,
  p_client_submission_id text default null
)
returns public.incidents
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_profile public.profiles;
  saved_incident public.incidents;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select * into current_profile
  from public.profiles
  where id = current_user_id
    and organization_id is not null
    and account_status = 'active';

  if not found or not exists (
    select 1
    from public.memberships
    where user_id = current_user_id
      and organization_id = current_profile.organization_id
  ) then
    raise exception 'Your account is not active in an organization.';
  end if;

  if p_incident_id is null and p_client_submission_id is not null then
    select * into saved_incident
    from public.incidents
    where organization_id = current_profile.organization_id
      and client_submission_id = p_client_submission_id;
    if found then
      return saved_incident;
    end if;
  end if;

  if p_incident_id is null then
    insert into public.incidents (
      organization_id, report_type, status, title, description, occurred_at,
      site_id, facility_id, location, department, shift, work_activity_context,
      reported_by, created_by, contractor_involved, contractor_organization,
      severity, potential_severity, incident_category, environmental_impact,
      injury_or_illness, property_damage, work_related, immediate_correction,
      priority, gps_coordinates, weather_conditions, equipment_involved,
      people_involved, witnesses, potential_root_cause, digital_signature,
      accuracy_confirmed, draft_stage, client_submission_id
    ) values (
      current_profile.organization_id,
      (p_input->>'reportType')::public.incident_report_type,
      'draft'::public.incident_status,
      coalesce(nullif(p_input->>'title', ''), 'Untitled draft'),
      nullif(p_input->>'description', ''),
      nullif(p_input->>'occurredAt', '')::timestamptz,
      nullif(p_input->>'siteId', '')::uuid,
      nullif(p_input->>'facilityId', '')::uuid,
      nullif(p_input->>'location', ''),
      nullif(p_input->>'department', ''),
      nullif(p_input->>'shift', ''),
      nullif(p_input->>'workActivityContext', ''),
      current_user_id,
      current_user_id,
      coalesce((p_input->>'contractorInvolved')::boolean, false),
      nullif(p_input->>'contractorOrganization', ''),
      nullif(p_input->>'severity', ''),
      nullif(p_input->>'potentialSeverity', ''),
      nullif(p_input->>'incidentCategory', ''),
      coalesce((p_input->>'environmentalImpact')::boolean, false),
      coalesce((p_input->>'injuryOrIllness')::boolean, false),
      coalesce((p_input->>'propertyDamage')::boolean, false),
      coalesce((p_input->>'workRelated')::boolean, true),
      nullif(p_input->>'immediateCorrection', ''),
      nullif(p_input->>'priority', ''),
      nullif(p_input->>'gpsCoordinates', ''),
      nullif(p_input->>'weatherConditions', ''),
      nullif(p_input->>'equipmentInvolved', ''),
      nullif(p_input->>'peopleInvolved', ''),
      nullif(p_input->>'witnesses', ''),
      nullif(p_input->>'potentialRootCause', ''),
      nullif(p_input->>'digitalSignature', ''),
      coalesce((p_input->>'accuracyConfirmed')::boolean, false),
      greatest(0, least(3, coalesce((p_input->>'draftStage')::smallint, 0))),
      p_client_submission_id
    ) returning * into saved_incident;

    insert into public.activity_logs (organization_id, user_id, activity, metadata)
    values (current_profile.organization_id, current_user_id, 'Incident draft created', jsonb_build_object('incident_id', saved_incident.id));
  else
    update public.incidents
    set report_type = (p_input->>'reportType')::public.incident_report_type,
        title = coalesce(nullif(p_input->>'title', ''), 'Untitled draft'),
        description = nullif(p_input->>'description', ''),
        occurred_at = nullif(p_input->>'occurredAt', '')::timestamptz,
        site_id = nullif(p_input->>'siteId', '')::uuid,
        facility_id = nullif(p_input->>'facilityId', '')::uuid,
        location = nullif(p_input->>'location', ''),
        department = nullif(p_input->>'department', ''),
        shift = nullif(p_input->>'shift', ''),
        work_activity_context = nullif(p_input->>'workActivityContext', ''),
        contractor_involved = coalesce((p_input->>'contractorInvolved')::boolean, false),
        contractor_organization = nullif(p_input->>'contractorOrganization', ''),
        severity = nullif(p_input->>'severity', ''),
        potential_severity = nullif(p_input->>'potentialSeverity', ''),
        incident_category = nullif(p_input->>'incidentCategory', ''),
        environmental_impact = coalesce((p_input->>'environmentalImpact')::boolean, false),
        injury_or_illness = coalesce((p_input->>'injuryOrIllness')::boolean, false),
        property_damage = coalesce((p_input->>'propertyDamage')::boolean, false),
        work_related = coalesce((p_input->>'workRelated')::boolean, true),
        immediate_correction = nullif(p_input->>'immediateCorrection', ''),
        priority = nullif(p_input->>'priority', ''),
        gps_coordinates = nullif(p_input->>'gpsCoordinates', ''),
        weather_conditions = nullif(p_input->>'weatherConditions', ''),
        equipment_involved = nullif(p_input->>'equipmentInvolved', ''),
        people_involved = nullif(p_input->>'peopleInvolved', ''),
        witnesses = nullif(p_input->>'witnesses', ''),
        potential_root_cause = nullif(p_input->>'potentialRootCause', ''),
        digital_signature = nullif(p_input->>'digitalSignature', ''),
        accuracy_confirmed = coalesce((p_input->>'accuracyConfirmed')::boolean, false),
        draft_stage = greatest(0, least(3, coalesce((p_input->>'draftStage')::smallint, 0)))
    where id = p_incident_id
      and organization_id = current_profile.organization_id
      and created_by = current_user_id
      and status = 'draft'::public.incident_status
    returning * into saved_incident;

    if not found then
      raise exception 'Draft not found or no longer editable.';
    end if;

    insert into public.activity_logs (organization_id, user_id, activity, metadata)
    values (current_profile.organization_id, current_user_id, 'Incident draft updated', jsonb_build_object('incident_id', saved_incident.id));
  end if;

  return saved_incident;
end;
$$;

revoke all on function public.save_incident_draft(uuid, jsonb, text) from public, anon;
grant execute on function public.save_incident_draft(uuid, jsonb, text) to authenticated;
