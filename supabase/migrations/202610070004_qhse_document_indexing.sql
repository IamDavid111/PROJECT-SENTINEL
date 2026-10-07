-- Phase 3 vector index. Embeddings are generated only by the trusted Edge worker;
-- browsers can claim/inspect indexing but can never read or write vectors.
create extension if not exists vector with schema extensions;

alter table public.knowledge_chunks
  add constraint knowledge_chunks_identity_unique unique (id, version_id, document_id, organization_id);

create table public.knowledge_indexing_runs (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.knowledge_document_versions(id) on delete cascade,
  document_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  embedding_model text not null check (embedding_model ~ '^[a-z0-9._-]{1,100}$'),
  status text not null check (status in ('processing', 'succeeded', 'failed')),
  attempt_id uuid not null,
  requested_by uuid references auth.users(id) on delete set null,
  chunk_count integer check (chunk_count >= 0),
  error_code text check (error_code ~ '^[a-z_]{1,60}$'),
  error_message text check (char_length(error_message) <= 300),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (version_id, embedding_model),
  check ((status = 'failed') = (error_code is not null))
);
alter table public.knowledge_indexing_runs enable row level security;
revoke all on public.knowledge_indexing_runs from public, anon, authenticated;
grant select, insert, update on public.knowledge_indexing_runs to service_role;

-- One vector per chunk and model. The composite FK ties every vector to its chunk's
-- exact version/document/organization, so vectors cannot be attached across tenants.
-- New versions or re-extracted text produce new chunk IDs and therefore new vectors;
-- old vectors stay historical and are excluded by the current-embeddings view.
create table public.knowledge_chunk_embeddings (
  chunk_id uuid not null,
  version_id uuid not null,
  document_id uuid not null,
  organization_id uuid not null,
  embedding_model text not null,
  embedding extensions.vector(1536) not null,
  indexing_run_id uuid not null references public.knowledge_indexing_runs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (chunk_id, embedding_model),
  foreign key (chunk_id, version_id, document_id, organization_id)
    references public.knowledge_chunks(id, version_id, document_id, organization_id) on delete cascade
);
alter table public.knowledge_chunk_embeddings enable row level security;
revoke all on public.knowledge_chunk_embeddings from public, anon, authenticated;
grant select, insert, delete on public.knowledge_chunk_embeddings to service_role;
create index knowledge_chunk_embeddings_org_model_idx on public.knowledge_chunk_embeddings(organization_id, embedding_model);
create index knowledge_chunk_embeddings_hnsw_idx on public.knowledge_chunk_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

-- Caller-authorized claim. The model name comes from server configuration via the Edge
-- worker; it only labels the run, and vectors are written solely by finish (service role).
create function public.begin_knowledge_indexing(target_version_id uuid, target_model text)
returns table(id uuid, attempt_id uuid) language plpgsql security definer set search_path = public
as $$
declare
  v public.knowledge_document_versions;
  r public.knowledge_indexing_runs;
begin
  select * into v from public.knowledge_document_versions kv where kv.id = target_version_id;
  if not found or auth.uid() is null
    or not public.can_manage_knowledge_documents(v.organization_id)
    or not public.can_read_knowledge_document(v.organization_id, v.access_scope, v.confidentiality) then
    raise exception 'Authorized document indexing access is required' using errcode = '42501';
  end if;
  perform 1 from public.knowledge_documents d where d.id = v.document_id for update;
  if not exists (select 1 from public.knowledge_ai_index_candidates c where c.id = target_version_id)
    or not exists (select 1 from public.knowledge_current_chunks c where c.version_id = target_version_id) then
    raise exception 'Only eligible approved documents with current chunks can be indexed' using errcode = '23514';
  end if;
  select * into r from public.knowledge_indexing_runs kr
  where kr.version_id = target_version_id and kr.embedding_model = target_model for update;
  if found and r.status = 'processing' and r.started_at > now() - interval '5 minutes' then
    raise exception 'Document indexing is already processing' using errcode = '55P03';
  end if;
  insert into public.knowledge_indexing_runs(version_id, document_id, organization_id, embedding_model,
    status, attempt_id, requested_by)
  values (v.id, v.document_id, v.organization_id, target_model, 'processing', gen_random_uuid(), auth.uid())
  on conflict (version_id, embedding_model) do update set status = 'processing',
    attempt_id = excluded.attempt_id, requested_by = excluded.requested_by, chunk_count = null,
    error_code = null, error_message = null, started_at = now(), finished_at = null
  returning * into r;
  return query select r.id, r.attempt_id;
end;
$$;
revoke all on function public.begin_knowledge_indexing(uuid, text) from public, anon;
grant execute on function public.begin_knowledge_indexing(uuid, text) to authenticated;

-- Trusted completion. Eligibility is rechecked and the vector set must match the version's
-- current chunks exactly, so partial, stale or foreign chunk vectors are never stored.
create function public.finish_knowledge_indexing(target_id uuid, target_attempt uuid, vectors jsonb,
  failure_code text default null, failure_message text default null)
returns text language plpgsql security definer set search_path = public
as $$
declare
  r public.knowledge_indexing_runs;
  expected integer;
  result_code text := failure_code;
  result_message text := failure_message;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted indexing worker is required' using errcode = '42501';
  end if;
  select * into r from public.knowledge_indexing_runs where id = target_id for update;
  if not found or r.status <> 'processing' or r.attempt_id <> target_attempt then
    raise exception 'Indexing attempt is no longer current' using errcode = '23514';
  end if;
  if result_code is null then
    select count(*) into expected from public.knowledge_current_chunks c
    where c.version_id = r.version_id and c.organization_id = r.organization_id;
    if not exists (select 1 from public.knowledge_ai_index_candidates c where c.id = r.version_id) or expected = 0 then
      result_code := 'eligibility_changed'; result_message := 'Document is no longer eligible for indexing.';
    elsif jsonb_typeof(vectors) <> 'array' or jsonb_array_length(vectors) <> expected
      or (select count(distinct x->>'chunk_id') from jsonb_array_elements(vectors) x) <> expected
      or exists (select 1 from jsonb_array_elements(vectors) x where not exists (
        select 1 from public.knowledge_current_chunks c where c.id = (x->>'chunk_id')::uuid
          and c.version_id = r.version_id and c.organization_id = r.organization_id)) then
      result_code := 'chunk_set_changed'; result_message := 'Document chunks changed during indexing. Retry indexing.';
    else
      insert into public.knowledge_chunk_embeddings(chunk_id, version_id, document_id, organization_id,
        embedding_model, embedding, indexing_run_id)
      select c.id, c.version_id, c.document_id, c.organization_id, r.embedding_model,
        (x->'embedding')::text::extensions.vector(1536), r.id
      from jsonb_array_elements(vectors) x
      join public.knowledge_current_chunks c on c.id = (x->>'chunk_id')::uuid
      on conflict (chunk_id, embedding_model) do update
        set embedding = excluded.embedding, indexing_run_id = excluded.indexing_run_id, created_at = now();
    end if;
  end if;
  update public.knowledge_indexing_runs set
    status = case when result_code is null then 'succeeded' else 'failed' end,
    chunk_count = case when result_code is null then expected end,
    error_code = result_code, error_message = left(result_message, 300), finished_at = now()
  where id = r.id;
  insert into public.activity_logs(organization_id, user_id, activity, metadata)
  values (r.organization_id, r.requested_by,
    case when result_code is null then 'QHSE document indexing completed' else 'QHSE document indexing failed' end,
    jsonb_build_object('event_code', case when result_code is null then 'knowledge_indexing_succeeded' else 'knowledge_indexing_failed' end,
      'document_id', r.document_id, 'version_id', r.version_id, 'embedding_model', r.embedding_model,
      'chunk_count', expected, 'error_code', result_code, 'notification_ready', false));
  return case when result_code is null then 'succeeded' else 'failed' end;
end;
$$;
revoke all on function public.finish_knowledge_indexing(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.finish_knowledge_indexing(uuid, uuid, jsonb, text, text) to service_role;

-- Safe status for authorized readers: no vectors, text or paths.
create function public.knowledge_indexing_status(target_version_id uuid)
returns table(embedding_model text, status text, chunk_count integer, error_code text, error_message text,
  started_at timestamptz, finished_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select r.embedding_model, r.status, r.chunk_count, r.error_code, r.error_message, r.started_at, r.finished_at
  from public.knowledge_indexing_runs r
  join public.knowledge_document_versions v on v.id = r.version_id
  where r.version_id = target_version_id and auth.uid() is not null
    and public.can_read_knowledge_document(v.organization_id, v.access_scope, v.confidentiality);
$$;
revoke all on function public.knowledge_indexing_status(uuid) from public, anon;
grant execute on function public.knowledge_indexing_status(uuid) to authenticated;

-- Service-only retrieval source for the later RAG batch: only vectors of currently
-- eligible, current-text chunks (drafts, rejected, expired, archived, superseded excluded).
create view public.knowledge_current_embeddings with (security_invoker = true) as
select c.id as chunk_id, c.organization_id, c.document_id, c.version_id, c.version_number,
  c.source_filename, c.chunk_order, c.start_offset, c.end_offset, c.text, e.embedding_model, e.embedding
from public.knowledge_current_chunks c
join public.knowledge_chunk_embeddings e
  on e.chunk_id = c.id and e.version_id = c.version_id and e.organization_id = c.organization_id;
revoke all on public.knowledge_current_embeddings from public, anon, authenticated;
grant select on public.knowledge_current_embeddings to service_role;
