with organization_check as (
  select exists (
    select 1 from public.organizations
    where id = '25ad3a5c-514b-4097-96a6-a712c715d92b'::uuid
      and company_code = 'SENT-23FKES'
      and company_name = 'StarNet Tech'
  ) as verified
), prefixed_incidents as (
  select id, organization_id, digital_signature
  from public.incidents
  where organization_id = '25ad3a5c-514b-4097-96a6-a712c715d92b'::uuid
    and client_submission_id like 'MOCK-STARNET-INCIDENTS-20260929-%'
), targets as (
  select id, organization_id
  from prefixed_incidents
  where digital_signature = 'MOCK:MOCK-STARNET-INCIDENTS-20260929'
), target_investigations as (
  select v.id, v.organization_id
  from public.investigations v
  join targets t on t.id = v.incident_id and t.organization_id = v.organization_id
)
select jsonb_build_object(
  'batch_id', 'MOCK-STARNET-INCIDENTS-20260929',
  'organization_verified', (select verified from organization_check),
  'incidents_with_batch_prefix', (select count(*) from prefixed_incidents),
  'incidents_missing_exact_mock_signature', (select count(*) from prefixed_incidents where digital_signature is distinct from 'MOCK:MOCK-STARNET-INCIDENTS-20260929'),
  'deletable_records', jsonb_build_object(
    'incidents', (select count(*) from targets),
    'incident_people', (select count(*) from public.incident_people p join targets t on t.id = p.incident_id and t.organization_id = p.organization_id),
    'incident_evidence', (select count(*) from public.incident_evidence e join targets t on t.id = e.incident_id and t.organization_id = e.organization_id),
    'storage_objects', (select count(*) from storage.objects o join public.incident_evidence e on e.storage_path = o.name and o.bucket_id = 'incident-evidence' join targets t on t.id = e.incident_id and t.organization_id = e.organization_id),
    'investigations', (select count(*) from target_investigations),
    'investigation_findings', (select count(*) from public.investigation_findings f join target_investigations v on v.id = f.investigation_id and v.organization_id = f.organization_id),
    'investigation_root_causes', (select count(*) from public.investigation_root_causes r join target_investigations v on v.id = r.investigation_id and v.organization_id = r.organization_id),
    'investigation_corrections', (select count(*) from public.investigation_corrections c join target_investigations v on v.id = c.investigation_id and v.organization_id = c.organization_id),
    'corrective_actions', (select count(*) from public.corrective_actions a join targets t on t.id = a.incident_id and t.organization_id = a.organization_id),
    'activity_logs', (select count(*) from public.activity_logs l where l.organization_id = '25ad3a5c-514b-4097-96a6-a712c715d92b'::uuid and (l.metadata->>'mock_batch_id' = 'MOCK-STARNET-INCIDENTS-20260929' or l.metadata->>'incident_id' in (select id::text from targets)))
  ),
  'mock_reporter_profiles_preserved', (select count(*) from public.profiles where organization_id = '25ad3a5c-514b-4097-96a6-a712c715d92b' and employee_id like 'MOCK-STARNET-20260930-%')
) as cleanup_preview;
