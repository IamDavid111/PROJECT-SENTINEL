create table public.knowledge_extractions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null unique,
  document_id uuid not null,
  organization_id uuid not null,
  status text not null check (status in ('processing', 'succeeded', 'failed')),
  attempt_id uuid not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  extractor_version text not null default 'qhse-extractor-v1',
  extracted_text text,
  source_sha256 text,
  error_code text,
  error_message text,
  foreign key (version_id, document_id, organization_id)
    references public.knowledge_document_versions(id, document_id, organization_id) on delete cascade,
  check (
    (status = 'processing' and finished_at is null and extracted_text is null and error_code is null)
    or (status = 'succeeded' and finished_at is not null and length(trim(extracted_text)) > 0
      and source_sha256 ~ '^[a-f0-9]{64}$' and error_code is null and error_message is null)
    or (status = 'failed' and finished_at is not null and extracted_text is null
      and error_code is not null and error_message is not null)
  )
);
alter table public.knowledge_extractions enable row level security;
revoke all on public.knowledge_extractions from public, anon, authenticated;
grant all on public.knowledge_extractions to service_role;

create function public.begin_knowledge_extraction(target_version_id uuid)
returns table (id uuid, attempt_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  v public.knowledge_document_versions;
  job public.knowledge_extractions;
begin
  select * into v from public.knowledge_document_versions where knowledge_document_versions.id = target_version_id;
  if not found or auth.uid() is null or not public.can_manage_knowledge_documents(v.organization_id)
    or not public.can_read_knowledge_document(v.organization_id, v.access_scope, v.confidentiality) then
    raise exception 'Authorized document extraction access is required' using errcode = '42501';
  end if;
  -- Serialize claims with lifecycle decisions; stale workers cannot overwrite later retries.
  perform 1 from public.knowledge_documents where knowledge_documents.id = v.document_id for update;
  if not exists (select 1 from public.knowledge_ai_index_candidates c where c.id = target_version_id) then
    raise exception 'Only currently eligible approved documents can be extracted' using errcode = '23514';
  end if;
  select * into job from public.knowledge_extractions e where e.version_id = target_version_id for update;
  if found and job.status = 'processing' and job.started_at > now() - interval '5 minutes' then
    raise exception 'Document extraction is already processing' using errcode = '55P03';
  end if;
  insert into public.knowledge_extractions as e(
    version_id, document_id, organization_id, status, attempt_id, requested_by
  ) values (v.id, v.document_id, v.organization_id, 'processing', gen_random_uuid(), auth.uid())
  on conflict (version_id) do update set
    status = 'processing', attempt_id = gen_random_uuid(), requested_by = auth.uid(),
    started_at = now(), finished_at = null, extracted_text = null,
    source_sha256 = null, error_code = null, error_message = null
  returning e.* into job;
  insert into public.activity_logs(organization_id, user_id, activity, metadata)
  values (v.organization_id, auth.uid(), 'QHSE document extraction started',
    jsonb_build_object('event_code', 'knowledge_extraction_started', 'document_id', v.document_id,
      'version_id', v.id, 'extraction_id', job.id, 'attempt_id', job.attempt_id, 'notification_ready', false));
  return query select job.id, job.attempt_id;
end;
$$;

create function public.finish_knowledge_extraction(
  target_id uuid, target_attempt uuid, content text, source_hash text,
  failure_code text default null, failure_message text default null
)
returns text language plpgsql security definer set search_path = public
as $$
declare
  job public.knowledge_extractions;
  result_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted extraction worker is required' using errcode = '42501';
  end if;
  select * into job from public.knowledge_extractions where id = target_id;
  if not found then raise exception 'Extraction attempt is unavailable' using errcode = '23514'; end if;
  perform 1 from public.knowledge_documents where id = job.document_id for update;
  select * into job from public.knowledge_extractions where id = target_id for update;
  if job.attempt_id <> target_attempt or job.status <> 'processing' then
    raise exception 'Extraction attempt is no longer current' using errcode = '23514';
  end if;
  if failure_code is null and not exists (
    select 1 from public.knowledge_ai_index_candidates c where c.id = job.version_id
      and public.can_manage_knowledge_documents_for_extraction(job.requested_by, c.organization_id, c.access_scope, c.confidentiality)
  ) then
    failure_code := 'eligibility_changed';
    failure_message := 'Document eligibility or processing authorization changed during extraction.';
  end if;
  if failure_code is null and (content is null or length(trim(content)) = 0
    or octet_length(content) > 2000000 or source_hash is null or source_hash !~ '^[a-f0-9]{64}$') then
    raise exception 'Invalid extraction output' using errcode = '23514';
  end if;
  result_status := case when failure_code is null then 'succeeded' else 'failed' end;
  update public.knowledge_extractions set status = result_status, finished_at = now(),
    extracted_text = case when failure_code is null then content else null end,
    source_sha256 = source_hash, error_code = failure_code, error_message = failure_message
  where id = job.id;
  insert into public.activity_logs(organization_id, user_id, activity, metadata)
  values (job.organization_id, job.requested_by, 'QHSE document extraction finished',
    jsonb_build_object('event_code', 'knowledge_extraction_' || result_status,
      'document_id', job.document_id, 'version_id', job.version_id, 'extraction_id', job.id,
      'attempt_id', job.attempt_id, 'error_code', failure_code, 'notification_ready', false));
  return result_status;
end;
$$;

-- Recheck the original requester without accepting caller-supplied identity in any public API.
create function public.can_manage_knowledge_documents_for_extraction(actor uuid, org uuid, scope text, confidentiality text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p join public.memberships m on m.user_id=p.id and m.organization_id=p.organization_id
    where p.id=actor and p.organization_id=org and p.account_status='active'
      and public.knowledge_role_has_permission(org, m.role, 'manage_knowledge_documents')
      and public.knowledge_role_has_permission(org, m.role, 'view_knowledge_documents')
      and (confidentiality='internal' or public.knowledge_role_has_permission(org, m.role, 'view_' || confidentiality || '_knowledge'))
      and (scope in ('organization','site') or (
        scope='management' and (m.role in ('Super Administrator','Organization Administrator','QHSE Manager')
          or not public.is_builtin_role_name(m.role))))
  );
$$;

create function public.knowledge_extraction_status(target_version_id uuid)
returns table (status text, started_at timestamptz, finished_at timestamptz, error_code text, error_message text)
language sql stable security definer set search_path = public
as $$
  select e.status, e.started_at, e.finished_at, e.error_code, e.error_message
  from public.knowledge_extractions e
  where e.version_id = target_version_id
    and public.can_manage_knowledge_documents(e.organization_id)
    and exists (select 1 from public.knowledge_document_versions v where v.id=e.version_id
      and public.can_read_knowledge_document(v.organization_id, v.access_scope, v.confidentiality));
$$;

-- Stored extraction is not an index. Future chunking must use this live eligibility join.
create view public.knowledge_chunking_candidates with (security_invoker = true) as
select e.id as extraction_id, e.version_id, e.document_id, e.organization_id,
  e.extractor_version, e.source_sha256, e.extracted_text
from public.knowledge_extractions e join public.knowledge_ai_index_candidates v on v.id=e.version_id
where e.status='succeeded';
revoke all on public.knowledge_chunking_candidates from public, anon, authenticated;
grant select on public.knowledge_chunking_candidates to service_role;
revoke all on function public.begin_knowledge_extraction(uuid), public.knowledge_extraction_status(uuid) from public, anon;
grant execute on function public.begin_knowledge_extraction(uuid), public.knowledge_extraction_status(uuid) to authenticated;
revoke all on function public.finish_knowledge_extraction(uuid,uuid,text,text,text,text),
  public.can_manage_knowledge_documents_for_extraction(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.finish_knowledge_extraction(uuid,uuid,text,text,text,text) to service_role;
