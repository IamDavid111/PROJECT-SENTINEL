-- Phase 3 re-indexing lifecycle.
--
-- Two eligibility boundaries:
--   knowledge_processing_candidates  -> may be extracted / chunked / embedded (includes approved
--                                       versions whose effective date is still in the future, so the
--                                       replacement is already indexed when it takes effect).
--   knowledge_ai_index_candidates    -> may be RETRIEVED (processing set AND effective today).
-- Retrieval views (knowledge_current_embeddings, get_knowledge_citations) are gated by the second,
-- so pre-indexed future versions never reach search or the model early.
--
-- Supersession: once a newer approved version is effective, older approved versions are relabelled
-- 'superseded'. Their rows, extractions, chunks and vectors are kept for history/audit, but they
-- were already excluded from retrieval by the views; the label makes that visible and audited.

-- A superseded version keeps its original approver/approval time (historical traceability).
alter table public.knowledge_document_versions drop constraint knowledge_versions_approval_consistency;
alter table public.knowledge_document_versions add constraint knowledge_versions_approval_consistency check (
  (approval_status in ('approved', 'superseded') and approved_by is not null and approved_at is not null)
  or (approval_status not in ('approved', 'superseded') and approved_by is null and approved_at is null));

-- 1. Processing boundary: identical to the retrieval boundary minus "own effective date <= today".
create view public.knowledge_processing_candidates with (security_invoker = true) as
select v.*
from public.knowledge_document_versions v
join public.knowledge_documents d on d.id = v.document_id and d.organization_id = v.organization_id
where d.lifecycle_status = 'active'
  and v.approval_status = 'approved'
  and v.uploaded_at is not null
  and (v.expiry_date is null or v.expiry_date > (now() at time zone 'UTC')::date)
  and not exists (
    select 1 from public.knowledge_document_versions newer
    where newer.document_id = v.document_id and newer.organization_id = v.organization_id
      and newer.version_number > v.version_number
      and newer.approval_status = 'approved'
      and coalesce(newer.effective_date, (newer.approved_at at time zone 'UTC')::date) <= (now() at time zone 'UTC')::date
  );
revoke all on public.knowledge_processing_candidates from public, anon, authenticated;
grant select on public.knowledge_processing_candidates to service_role;

-- Same rows as migration 007 (same column list), now expressed on top of the processing boundary.
create or replace view public.knowledge_ai_index_candidates with (security_invoker = true) as
select p.*
from public.knowledge_processing_candidates p
where coalesce(p.effective_date, (p.approved_at at time zone 'UTC')::date) <= (now() at time zone 'UTC')::date;

-- Chunking/chunk views now follow the processing boundary (same columns as before).
create or replace view public.knowledge_chunking_candidates with (security_invoker = true) as
select e.id as extraction_id, e.version_id, e.document_id, e.organization_id,
  e.extractor_version, e.source_sha256, e.extracted_text
from public.knowledge_extractions e join public.knowledge_processing_candidates v on v.id = e.version_id
where e.status = 'succeeded';

-- Retrieval gate: only vectors of versions that are effective and current today.
create or replace view public.knowledge_current_embeddings with (security_invoker = true) as
select c.id as chunk_id, c.organization_id, c.document_id, c.version_id, c.version_number,
  c.source_filename, c.chunk_order, c.start_offset, c.end_offset, c.text, e.embedding_model, e.embedding
from public.knowledge_current_chunks c
join public.knowledge_ai_index_candidates a on a.id = c.version_id and a.organization_id = c.organization_id
join public.knowledge_chunk_embeddings e
  on e.chunk_id = c.id and e.version_id = c.version_id and e.organization_id = c.organization_id;

-- Citations re-resolve through the retrieval gate too (pre-indexed future versions stay hidden).
create or replace function public.get_knowledge_citations(target_chunk_ids uuid[])
returns table(
  chunk_id uuid, document_id uuid, version_id uuid, version_number integer,
  title text, document_type text, effective_date date,
  source_filename text, chunk_order integer, start_offset integer, end_offset integer, content text
)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
declare
  caller_org uuid;
begin
  select p.organization_id into caller_org from public.profiles p
  where p.id = auth.uid() and p.account_status = 'active';
  if caller_org is null then
    raise exception 'Active organization access is required' using errcode = '42501';
  end if;
  if target_chunk_ids is null or cardinality(target_chunk_ids) not between 1 and 50 then
    raise exception 'Provide 1 to 50 chunk IDs' using errcode = '22023';
  end if;
  return query
  select c.id, c.document_id, c.version_id, c.version_number, v.title, v.document_type, v.effective_date,
    c.source_filename, c.chunk_order, c.start_offset, c.end_offset, c.text
  from public.knowledge_current_chunks c
  join public.knowledge_ai_index_candidates v
    on v.id = c.version_id and v.document_id = c.document_id and v.organization_id = c.organization_id
  where c.id = any(target_chunk_ids)
    and c.organization_id = caller_org
    and public.can_read_knowledge_document(v.organization_id, v.access_scope, v.confidentiality)
  order by array_position(target_chunk_ids, c.id);
end;
$$;

-- 2. Point the processing RPCs at the processing boundary. Their bodies are otherwise unchanged, so
-- they are rewritten in place rather than copied; each rewrite is asserted to have happened.
do $$
declare
  fn text;
  def text;
  patched text;
begin
  foreach fn in array array[
    'public.begin_knowledge_extraction(uuid)',
    'public.finish_knowledge_extraction(uuid,uuid,text,text,text,text)',
    'public.chunk_knowledge_document(uuid)',
    'public.begin_knowledge_indexing(uuid,text)',
    'public.finish_knowledge_indexing(uuid,uuid,jsonb,text,text)'
  ] loop
    def := pg_get_functiondef(fn::regprocedure);
    patched := replace(def, 'public.knowledge_ai_index_candidates', 'public.knowledge_processing_candidates');
    if patched = def then raise exception 'Re-indexing migration: % has no eligibility check to patch', fn; end if;
    execute patched;
  end loop;
end;
$$;

-- 3. approved -> superseded is allowed only when a newer approved version is already effective,
-- and only the status may change. Inserted into the existing version guard (same rewrite approach).
do $$
declare
  def text := pg_get_functiondef('public.prepare_knowledge_document_version()'::regprocedure);
  patched text;
begin
  patched := regexp_replace(def,
    '(\s+)else(\s+)raise exception ''Invalid knowledge document version transition''',
    E'\\1elsif old.approval_status = ''approved'' and new.approval_status = ''superseded'' then'
    || E'\n      if not exists (select 1 from public.knowledge_document_versions n'
    || E'\n        where n.document_id = old.document_id and n.organization_id = old.organization_id'
    || E'\n          and n.version_number > old.version_number and n.approval_status = ''approved'''
    || E'\n          and coalesce(n.effective_date, (n.approved_at at time zone ''UTC'')::date) <= (now() at time zone ''UTC'')::date) then'
    || E'\n        raise exception ''Only an effective newer approval can supersede a version'' using errcode = ''42501'';'
    || E'\n      end if;'
    || E'\n      if (to_jsonb(new) - array[''approval_status'', ''updated_at'']) is distinct from (to_jsonb(old) - array[''approval_status'', ''updated_at'']) then'
    || E'\n        raise exception ''Supersession cannot change document content'' using errcode = ''42501'';'
    || E'\n      end if;'
    || E'\\1else\\2raise exception ''Invalid knowledge document version transition''');
  if patched = def then raise exception 'Re-indexing migration: version guard not patched'; end if;
  execute patched;
end;
$$;

-- Relabels every approved version of a document that an effective newer approval replaces.
-- Internal only (trigger); the version guard above re-verifies each row.
create function public.supersede_knowledge_versions(target_document_id uuid)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  changed integer;
begin
  update public.knowledge_document_versions v set approval_status = 'superseded'
  where v.document_id = target_document_id and v.approval_status = 'approved'
    and exists (
      select 1 from public.knowledge_document_versions n
      where n.document_id = v.document_id and n.organization_id = v.organization_id
        and n.version_number > v.version_number and n.approval_status = 'approved'
        and coalesce(n.effective_date, (n.approved_at at time zone 'UTC')::date) <= (now() at time zone 'UTC')::date);
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.supersede_knowledge_versions(uuid) from public, anon, authenticated;

-- Fires on approval. A future-effective approval supersedes nothing yet: retrieval still switches
-- automatically on its effective date (views), and the old label catches up on the next approval
-- decision for that document. No scheduler is introduced for a cosmetic label.
create function public.after_knowledge_version_approved()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  perform public.supersede_knowledge_versions(new.document_id);
  return null;
end;
$$;
revoke all on function public.after_knowledge_version_approved() from public, anon, authenticated;
create trigger knowledge_versions_supersede
after update of approval_status on public.knowledge_document_versions
for each row when (new.approval_status = 'approved' and old.approval_status is distinct from 'approved')
execute function public.after_knowledge_version_approved();

-- 4. One safe status per version for authorized readers: lifecycle/retrieval state plus whether every
-- current chunk has a vector. No text, paths or vectors are returned.
create function public.knowledge_version_ai_status(target_version_id uuid)
returns table(retrieval_state text, processing_eligible boolean, chunk_count integer, indexed_chunk_count integer)
language plpgsql stable security definer set search_path = public
as $$
declare
  v public.knowledge_document_versions;
  d public.knowledge_documents;
  today date := (now() at time zone 'UTC')::date;
begin
  select * into v from public.knowledge_document_versions where id = target_version_id;
  if not found or auth.uid() is null
    or not public.can_read_knowledge_document(v.organization_id, v.access_scope, v.confidentiality) then
    raise exception 'Authorized knowledge access is required' using errcode = '42501';
  end if;
  select * into d from public.knowledge_documents where id = v.document_id;
  return query select
    case
      when d.lifecycle_status <> 'active' then 'archived'
      when v.approval_status in ('draft', 'pending_review', 'rejected') then 'not_approved'
      when v.approval_status = 'superseded' or exists (
        select 1 from public.knowledge_document_versions n
        where n.document_id = v.document_id and n.version_number > v.version_number
          and n.approval_status = 'approved'
          and coalesce(n.effective_date, (n.approved_at at time zone 'UTC')::date) <= today) then 'superseded'
      when v.expiry_date is not null and v.expiry_date <= today then 'expired'
      when v.uploaded_at is null then 'not_approved'
      when coalesce(v.effective_date, (v.approved_at at time zone 'UTC')::date) > today then 'scheduled'
      else 'current' end,
    exists (select 1 from public.knowledge_processing_candidates p where p.id = v.id),
    (select count(*)::integer from public.knowledge_current_chunks c where c.version_id = v.id),
    (select count(distinct c.id)::integer from public.knowledge_current_chunks c
      join public.knowledge_chunk_embeddings e on e.chunk_id = c.id and e.version_id = c.version_id
      where c.version_id = v.id);
end;
$$;
revoke all on function public.knowledge_version_ai_status(uuid) from public, anon;
grant execute on function public.knowledge_version_ai_status(uuid) to authenticated;
