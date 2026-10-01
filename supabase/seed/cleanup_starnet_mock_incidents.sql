begin;

create temporary table starnet_cleanup_targets on commit drop as
select i.id, i.organization_id
from public.incidents i
where i.organization_id = '25ad3a5c-514b-4097-96a6-a712c715d92b'::uuid
  and i.client_submission_id like 'MOCK-STARNET-INCIDENTS-20260929-%'
  and i.digital_signature = 'MOCK:MOCK-STARNET-INCIDENTS-20260929';

create unique index on starnet_cleanup_targets (id);

create temporary table starnet_cleanup_evidence_paths on commit drop as
select distinct e.storage_path
from public.incident_evidence e
join starnet_cleanup_targets t
  on t.id = e.incident_id and t.organization_id = e.organization_id;

create temporary table starnet_cleanup_counts on commit drop as
select
  (select count(*) from starnet_cleanup_targets) as incidents,
  (select count(*) from public.incident_people p join starnet_cleanup_targets t on t.id = p.incident_id and t.organization_id = p.organization_id) as incident_people,
  (select count(*) from public.incident_evidence e join starnet_cleanup_targets t on t.id = e.incident_id and t.organization_id = e.organization_id) as incident_evidence,
  (select count(*) from public.investigations v join starnet_cleanup_targets t on t.id = v.incident_id and t.organization_id = v.organization_id) as investigations,
  (select count(*) from public.investigation_findings f join public.investigations v on v.id = f.investigation_id and v.organization_id = f.organization_id join starnet_cleanup_targets t on t.id = v.incident_id and t.organization_id = v.organization_id) as investigation_findings,
  (select count(*) from public.investigation_root_causes r join public.investigations v on v.id = r.investigation_id and v.organization_id = r.organization_id join starnet_cleanup_targets t on t.id = v.incident_id and t.organization_id = v.organization_id) as investigation_root_causes,
  (select count(*) from public.investigation_corrections c join public.investigations v on v.id = c.investigation_id and v.organization_id = c.organization_id join starnet_cleanup_targets t on t.id = v.incident_id and t.organization_id = v.organization_id) as investigation_corrections,
  (select count(*) from public.corrective_actions a join starnet_cleanup_targets t on t.id = a.incident_id and t.organization_id = a.organization_id) as corrective_actions,
  (select count(*) from public.activity_logs l where l.organization_id = '25ad3a5c-514b-4097-96a6-a712c715d92b'::uuid and (l.metadata->>'mock_batch_id' = 'MOCK-STARNET-INCIDENTS-20260929' or l.metadata->>'incident_id' in (select id::text from starnet_cleanup_targets))) as activity_logs,
  (select count(*) from storage.objects o join starnet_cleanup_evidence_paths p on p.storage_path = o.name where o.bucket_id = 'incident-evidence') as storage_objects;

do $guard$
declare
  organization_ok boolean;
  mismarked_count bigint;
  targeted_count bigint;
begin
  select exists (
    select 1 from public.organizations
    where id = '25ad3a5c-514b-4097-96a6-a712c715d92b'::uuid
      and company_code = 'SENT-23FKES'
      and company_name = 'StarNet Tech'
  ) into organization_ok;
  if not organization_ok then
    raise exception 'Cleanup stopped: the fixed StarNet Tech organization identity did not match';
  end if;

  select count(*) into mismarked_count
  from public.incidents
  where organization_id = '25ad3a5c-514b-4097-96a6-a712c715d92b'::uuid
    and client_submission_id like 'MOCK-STARNET-INCIDENTS-20260929-%'
    and digital_signature is distinct from 'MOCK:MOCK-STARNET-INCIDENTS-20260929';
  if mismarked_count <> 0 then
    raise exception 'Cleanup stopped: found % incidents with the batch prefix but without the exact mock signature', mismarked_count;
  end if;

  select count(*) into targeted_count from starnet_cleanup_targets;
  if targeted_count > 1000 then
    raise exception 'Cleanup stopped: expected at most 1000 tagged mock incidents, found %', targeted_count;
  end if;
end;
$guard$;

delete from storage.objects o
using starnet_cleanup_evidence_paths p
where o.bucket_id = 'incident-evidence'
  and o.name = p.storage_path;

delete from public.incident_evidence e
using starnet_cleanup_targets t
where e.incident_id = t.id and e.organization_id = t.organization_id;

delete from public.incident_people p
using starnet_cleanup_targets t
where p.incident_id = t.id and p.organization_id = t.organization_id;

delete from public.investigation_findings f
using public.investigations v, starnet_cleanup_targets t
where f.investigation_id = v.id and f.organization_id = v.organization_id
  and v.incident_id = t.id and v.organization_id = t.organization_id;

delete from public.investigation_root_causes r
using public.investigations v, starnet_cleanup_targets t
where r.investigation_id = v.id and r.organization_id = v.organization_id
  and v.incident_id = t.id and v.organization_id = t.organization_id;

delete from public.investigation_corrections c
using public.investigations v, starnet_cleanup_targets t
where c.investigation_id = v.id and c.organization_id = v.organization_id
  and v.incident_id = t.id and v.organization_id = t.organization_id;

delete from public.corrective_actions a
using starnet_cleanup_targets t
where a.incident_id = t.id and a.organization_id = t.organization_id;

delete from public.investigations v
using starnet_cleanup_targets t
where v.incident_id = t.id and v.organization_id = t.organization_id;

delete from public.activity_logs l
where l.organization_id = '25ad3a5c-514b-4097-96a6-a712c715d92b'::uuid
  and (
    l.metadata->>'mock_batch_id' = 'MOCK-STARNET-INCIDENTS-20260929'
    or l.metadata->>'incident_id' in (select id::text from starnet_cleanup_targets)
  );

delete from public.incidents i
using starnet_cleanup_targets t
where i.id = t.id and i.organization_id = t.organization_id;

select jsonb_build_object(
  'batch_id', 'MOCK-STARNET-INCIDENTS-20260929',
  'deleted_candidates', to_jsonb(c),
  'remaining_tagged_incidents', (
    select count(*) from public.incidents
    where organization_id = '25ad3a5c-514b-4097-96a6-a712c715d92b'::uuid
      and client_submission_id like 'MOCK-STARNET-INCIDENTS-20260929-%'
      and digital_signature = 'MOCK:MOCK-STARNET-INCIDENTS-20260929'
  )
) as cleanup_result
from starnet_cleanup_counts c;

commit;
