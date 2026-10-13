alter table public.knowledge_extractions
  add constraint knowledge_extractions_identity_unique unique (id, version_id, document_id, organization_id);

create table public.knowledge_chunks (
  id uuid primary key,
  extraction_id uuid not null,
  version_id uuid not null,
  document_id uuid not null,
  organization_id uuid not null,
  version_number integer not null check (version_number > 0),
  source_filename text not null,
  chunker_version text not null check (chunker_version = 'characters-1200-v1'),
  content_fingerprint text not null check (content_fingerprint ~ '^[a-f0-9]{32}$'),
  chunk_order integer not null check (chunk_order >= 0),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null,
  text text not null,
  created_at timestamptz not null default now(),
  foreign key (extraction_id, version_id, document_id, organization_id)
    references public.knowledge_extractions(id, version_id, document_id, organization_id) on delete cascade,
  unique (version_id, chunker_version, content_fingerprint, chunk_order),
  check (end_offset > start_offset and end_offset - start_offset = char_length(text)
    and char_length(text) <= 1200),
  check (start_offset = chunk_order * 1200)
);
alter table public.knowledge_chunks enable row level security;
revoke all on public.knowledge_chunks from public, anon, authenticated;
grant select, insert, delete on public.knowledge_chunks to service_role;

create function public.chunk_knowledge_document(target_version_id uuid)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  v public.knowledge_document_versions;
  e public.knowledge_extractions;
  fingerprint text;
  total integer;
  added integer;
begin
  select * into v from public.knowledge_document_versions where id = target_version_id;
  if not found or auth.uid() is null
    or not public.can_manage_knowledge_documents(v.organization_id)
    or not public.can_read_knowledge_document(v.organization_id, v.access_scope, v.confidentiality) then
    raise exception 'Authorized document chunking access is required' using errcode = '42501';
  end if;
  -- Parent-first locking matches extraction and lifecycle RPCs.
  perform 1 from public.knowledge_documents where id = v.document_id for update;
  if not exists (select 1 from public.knowledge_ai_index_candidates where id = target_version_id) then
    raise exception 'Only currently eligible approved documents can be chunked' using errcode = '23514';
  end if;
  select * into e from public.knowledge_extractions where version_id = target_version_id for update;
  if not found or e.status <> 'succeeded' or e.extracted_text is null
    or char_length(e.extracted_text) = 0 or octet_length(e.extracted_text) > 2000000 then
    raise exception 'A successful nonempty extraction is required for chunking' using errcode = '23514';
  end if;
  fingerprint := md5(e.extracted_text);
  total := (char_length(e.extracted_text) + 1199) / 1200;
  -- Lossless, non-overlapping character slices: offsets are zero-based/end-exclusive
  -- in extracted text, not PDF pages or invented headings. MD5 is identity, not authentication.
  insert into public.knowledge_chunks (
    id, extraction_id, version_id, document_id, organization_id, version_number,
    source_filename, chunker_version, content_fingerprint, chunk_order, start_offset, end_offset, text
  )
  select md5(v.id::text || ':characters-1200-v1:' || fingerprint || ':' || n::text)::uuid,
    e.id, v.id, v.document_id, v.organization_id, v.version_number,
    v.original_filename, 'characters-1200-v1', fingerprint, n, n * 1200,
    least((n + 1) * 1200, char_length(e.extracted_text)),
    substring(e.extracted_text from n * 1200 + 1 for 1200)
  from generate_series(0, total - 1) n
  on conflict (version_id, chunker_version, content_fingerprint, chunk_order) do nothing;
  get diagnostics added = row_count;
  if (select string_agg(c.text, '' order by c.chunk_order) from public.knowledge_chunks c
    where c.version_id = v.id and c.chunker_version = 'characters-1200-v1'
      and c.content_fingerprint = fingerprint) is distinct from e.extracted_text then
    raise exception 'Stored chunks do not preserve extracted text' using errcode = '23514';
  end if;
  if added > 0 then
    insert into public.activity_logs(organization_id, user_id, activity, metadata)
    values (v.organization_id, auth.uid(), 'QHSE document chunking completed',
      jsonb_build_object('event_code', 'knowledge_chunking_succeeded', 'document_id', v.document_id,
        'version_id', v.id, 'extraction_id', e.id, 'chunk_count', total,
        'chunker_version', 'characters-1200-v1', 'notification_ready', false));
  end if;
  return total;
end;
$$;
revoke all on function public.chunk_knowledge_document(uuid) from public, anon;
grant execute on function public.chunk_knowledge_document(uuid) to authenticated;

-- Historical chunks remain traceable; this processing view excludes stale text/lifecycle.
create view public.knowledge_current_chunks with (security_invoker = true) as
select c.* from public.knowledge_chunks c
join public.knowledge_chunking_candidates e
  on e.extraction_id = c.extraction_id and e.version_id = c.version_id
  and e.document_id = c.document_id and e.organization_id = c.organization_id
where c.content_fingerprint = md5(e.extracted_text);
revoke all on public.knowledge_current_chunks from public, anon, authenticated;
grant select on public.knowledge_current_chunks to service_role;
