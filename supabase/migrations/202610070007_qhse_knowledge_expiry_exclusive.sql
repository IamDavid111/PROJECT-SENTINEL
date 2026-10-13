-- Expiry is now exclusive: a version stops being AI-eligible at 00:00 UTC on its expiry date
-- (previously valid through that day). Every retrieval path (search_knowledge,
-- get_knowledge_citations, indexing eligibility, current views) reads this view, so this single
-- boundary change applies everywhere. Column list is unchanged, so dependants stay valid.
create or replace view public.knowledge_ai_index_candidates with (security_invoker = true) as
select v.*
from public.knowledge_document_versions v
join public.knowledge_documents d on d.id = v.document_id and d.organization_id = v.organization_id
where d.lifecycle_status = 'active'
  and v.approval_status = 'approved'
  and v.uploaded_at is not null
  and coalesce(v.effective_date, (v.approved_at at time zone 'UTC')::date) <= (now() at time zone 'UTC')::date
  and (v.expiry_date is null or v.expiry_date > (now() at time zone 'UTC')::date)
  and not exists (
    select 1 from public.knowledge_document_versions newer
    where newer.document_id = v.document_id and newer.organization_id = v.organization_id
      and newer.version_number > v.version_number
      and newer.approval_status = 'approved'
      and coalesce(newer.effective_date, (newer.approved_at at time zone 'UTC')::date) <= (now() at time zone 'UTC')::date
  );
