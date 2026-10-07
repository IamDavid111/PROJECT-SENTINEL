-- Phase 3 permission-aware semantic search over current QHSE knowledge vectors.
-- No answer generation: returns ranked, citation-ready chunks only.

create function public.search_knowledge(
  query_embedding extensions.vector(1536),
  target_model text,
  match_count integer default 8,
  filter_site_id uuid default null,
  filter_department text default null,
  filter_document_ids uuid[] default null,
  min_similarity double precision default 0
)
returns table(
  chunk_id uuid, document_id uuid, version_id uuid, version_number integer,
  title text, document_type text, site_id uuid, department text,
  source_filename text, chunk_order integer, start_offset integer, end_offset integer,
  content text, similarity double precision
)
language plpgsql stable security definer set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  caller_org uuid;
begin
  -- Organization comes from the caller's active profile, never from request input.
  select p.organization_id into caller_org from public.profiles p
  where p.id = auth.uid() and p.account_status = 'active';
  if caller_org is null then
    raise exception 'Active organization access is required' using errcode = '42501';
  end if;
  if target_model is null or target_model !~ '^[a-z0-9._-]{1,100}$'
    or match_count is null or match_count not between 1 and 20
    or min_similarity is null or min_similarity not between -1 and 1
    or char_length(filter_department) > 120
    or cardinality(filter_document_ids) > 50 then
    raise exception 'Invalid search parameters' using errcode = '22023';
  end if;

  -- knowledge_current_embeddings already excludes draft, pending, rejected, superseded,
  -- expired, archived and stale-text content. Per-version scope/confidentiality permission
  -- is applied here, inside the database, before any text is returned to the Edge Function
  -- and therefore before anything can reach a model.
  return query
  select e.chunk_id, e.document_id, e.version_id, e.version_number,
    v.title, v.document_type, v.site_id, v.department,
    e.source_filename, e.chunk_order, e.start_offset, e.end_offset,
    e.text, (1 - (e.embedding <=> query_embedding))::double precision
  from public.knowledge_current_embeddings e
  join public.knowledge_document_versions v
    on v.id = e.version_id and v.document_id = e.document_id and v.organization_id = e.organization_id
  where e.organization_id = caller_org
    and e.embedding_model = target_model
    and public.can_read_knowledge_document(v.organization_id, v.access_scope, v.confidentiality)
    and (filter_site_id is null or v.site_id = filter_site_id)
    and (filter_department is null or lower(v.department) = lower(filter_department))
    and (filter_document_ids is null or e.document_id = any(filter_document_ids))
    and 1 - (e.embedding <=> query_embedding) >= min_similarity
  order by e.embedding <=> query_embedding, e.chunk_id
  limit match_count;
end;
$$;

-- Callable by authenticated users (the Edge Function forwards the caller's JWT so auth.uid()
-- drives authorization). A client-supplied vector cannot widen access: results are limited
-- to content the caller may already read.
revoke all on function public.search_knowledge(extensions.vector, text, integer, uuid, text, uuid[], double precision) from public, anon;
grant execute on function public.search_knowledge(extensions.vector, text, integer, uuid, text, uuid[], double precision) to authenticated, service_role;
