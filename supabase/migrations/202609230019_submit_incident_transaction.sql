create or replace function public.submit_new_incident(p_input jsonb)
returns public.incidents
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_profile public.profiles;
  submitted_incident public.incidents;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select * into current_profile
  from public.profiles
  where id = current_user_id
    and organization_id is not null
    and account_status = 'active';

  if not found then
    raise exception 'Your account is not active in an organization.';
  end if;

  insert into public.incidents (
    organization_id,
    report_type,
    status,
    title,
    description,
    occurred_at,
    reported_at,
    site_id,
    facility_id,
    location,
    department,
    work_activity_context,
    reported_by,
    created_by,
    contractor_involved,
    contractor_organization,
    severity,
    potential_severity,
    incident_category,
    environmental_impact,
    injury_or_illness,
    property_damage,
    work_related,
    immediate_correction,
    priority,
    gps_coordinates,
    weather_conditions,
    equipment_involved,
    people_involved,
    witnesses,
    potential_root_cause,
    digital_signature,
    accuracy_confirmed
  ) values (
    current_profile.organization_id,
    (p_input->>'reportType')::public.incident_report_type,
    'submitted'::public.incident_status,
    p_input->>'title',
    nullif(p_input->>'description', ''),
    (p_input->>'occurredAt')::timestamptz,
    now(),
    (p_input->>'siteId')::uuid,
    nullif(p_input->>'facilityId', '')::uuid,
    nullif(p_input->>'location', ''),
    nullif(p_input->>'department', ''),
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
    coalesce((p_input->>'accuracyConfirmed')::boolean, false)
  ) returning * into submitted_incident;

  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  values (
    current_profile.organization_id,
    current_user_id,
    'Incident submitted',
    jsonb_build_object('incident_id', submitted_incident.id, 'report_type', submitted_incident.report_type)
  );

  return submitted_incident;
end;
$$;

revoke all on function public.submit_new_incident(jsonb) from public, anon;
grant execute on function public.submit_new_incident(jsonb) to authenticated;
