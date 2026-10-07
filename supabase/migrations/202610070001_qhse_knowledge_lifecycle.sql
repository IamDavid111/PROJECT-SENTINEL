-- Lifecycle changes go through authenticated RPCs, not writable client status columns.
revoke update on public.knowledge_documents, public.knowledge_document_versions from authenticated;
grant update (
  document_type, title, description, site_id, department, owner_id,
  effective_date, review_date, expiry_date, confidentiality, access_scope
) on public.knowledge_document_versions to authenticated;

alter table public.knowledge_document_versions
  add column submitted_by uuid references auth.users(id) on delete restrict,
  add column submitted_at timestamptz,
  add constraint knowledge_versions_submission_consistency
    check ((submitted_by is null) = (submitted_at is null));

-- Do not fabricate submission evidence for pre-existing approvals.
create function public.record_knowledge_submission()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.submitted_by := null;
    new.submitted_at := null;
  else
    if new.submitted_by is distinct from old.submitted_by
      or new.submitted_at is distinct from old.submitted_at then
      raise exception 'Knowledge submission history is immutable' using errcode = '42501';
    end if;
    if old.approval_status = 'draft' and new.approval_status = 'pending_review' then
      new.submitted_by := auth.uid();
      new.submitted_at := now();
    end if;
  end if;
  return new;
end;
$$;

-- Run after prepare_knowledge_document_version has validated the unchanged saved draft.
create trigger zz_knowledge_versions_submission
before insert or update on public.knowledge_document_versions
for each row execute function public.record_knowledge_submission();

create function public.transition_knowledge_version(
  target_version_id uuid, target_status text, reason text default null
)
returns public.knowledge_document_versions
language plpgsql security definer set search_path = public
as $$
declare
  version_row public.knowledge_document_versions;
  parent public.knowledge_documents;
begin
  select v.* into version_row from public.knowledge_document_versions v
  where v.id = target_version_id;
  if not found or auth.uid() is null or not (
    case when target_status in ('approved', 'rejected')
      then public.can_review_knowledge_documents(version_row.organization_id)
      else public.can_manage_knowledge_documents(version_row.organization_id) end
  ) then
    raise exception 'Authorized knowledge lifecycle access is required' using errcode = '42501';
  end if;
  if target_status not in ('pending_review', 'approved', 'rejected') or target_status is null then
    raise exception 'Invalid knowledge lifecycle action' using errcode = '22023';
  end if;
  if (target_status = 'rejected' and (reason is null or length(trim(reason)) not between 1 and 2000))
    or (target_status <> 'rejected' and reason is not null) then
    raise exception 'A rejection requires a reason of 1 to 2000 characters' using errcode = '22023';
  end if;
  -- Match version creation's parent-first lock order; serialize decisions with archive/restore.
  select * into parent from public.knowledge_documents
  where id = version_row.document_id for update;
  if parent.lifecycle_status <> 'active' then
    raise exception 'Archived documents cannot receive lifecycle decisions' using errcode = '42501';
  end if;
  update public.knowledge_document_versions
  set approval_status = target_status,
      rejection_reason = case when target_status = 'rejected' then trim(reason) else null end
  where id = target_version_id
  returning * into version_row;
  return version_row;
end;
$$;

create function public.transition_knowledge_document(target_document_id uuid, target_lifecycle text)
returns public.knowledge_documents
language plpgsql security definer set search_path = public
as $$
declare
  document_row public.knowledge_documents;
begin
  select * into document_row from public.knowledge_documents where id = target_document_id for update;
  if not found or auth.uid() is null
    or not public.can_manage_knowledge_documents(document_row.organization_id) then
    raise exception 'Authorized knowledge lifecycle access is required' using errcode = '42501';
  end if;
  if target_lifecycle not in ('active', 'archived') or target_lifecycle is null then
    raise exception 'Invalid knowledge document lifecycle' using errcode = '22023';
  end if;
  update public.knowledge_documents set lifecycle_status = target_lifecycle
  where id = target_document_id returning * into document_row;
  return document_row;
end;
$$;

create function public.audit_knowledge_lifecycle()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  old_status text;
  new_status text;
  event_code text;
begin
  if tg_table_name = 'knowledge_documents' then
    old_status := old.lifecycle_status;
    new_status := new.lifecycle_status;
    event_code := case when new_status = 'archived' then 'knowledge_document_archived' else 'knowledge_document_restored' end;
  else
    old_status := old.approval_status;
    new_status := new.approval_status;
    event_code := case new_status
      when 'pending_review' then 'knowledge_version_submitted'
      when 'approved' then 'knowledge_version_approved'
      when 'rejected' then 'knowledge_version_rejected'
      else 'knowledge_version_status_changed' end;
  end if;
  if old_status is distinct from new_status then
    insert into public.activity_logs(organization_id, user_id, activity, metadata)
    values (new.organization_id, auth.uid(), 'QHSE knowledge lifecycle changed',
      jsonb_build_object(
        'event_code', event_code, 'record_id', new.id, 'record_type', tg_table_name,
        'document_id', case when tg_table_name = 'knowledge_documents' then new.id else (to_jsonb(new)->>'document_id')::uuid end,
        'version_number', to_jsonb(new)->'version_number',
        'from_status', old_status, 'to_status', new_status,
        'rejection_reason', to_jsonb(new)->'rejection_reason',
        'notification_ready', false
      ));
  end if;
  return new;
end;
$$;

create trigger knowledge_documents_audit_lifecycle
after update on public.knowledge_documents for each row execute function public.audit_knowledge_lifecycle();
create trigger knowledge_versions_audit_lifecycle
after update on public.knowledge_document_versions for each row execute function public.audit_knowledge_lifecycle();

-- Future indexing must use this live boundary, never the raw versions table.
-- Expiry is exclusive in UTC (migration 202610070007); review dates alone do not invalidate an approval.
-- Select the current effective approval before expiry/scope filtering: no fallback to a
-- superseded-in-practice older version when the replacement expires or is inaccessible.
create view public.knowledge_ai_index_candidates with (security_invoker = true) as
select v.*
from public.knowledge_document_versions v
join public.knowledge_documents d on d.id = v.document_id and d.organization_id = v.organization_id
where d.lifecycle_status = 'active'
  and v.approval_status = 'approved'
  and v.uploaded_at is not null
  and coalesce(v.effective_date, (v.approved_at at time zone 'UTC')::date) <= (now() at time zone 'UTC')::date
  and (v.expiry_date is null or v.expiry_date >= (now() at time zone 'UTC')::date)
  and not exists (
    select 1 from public.knowledge_document_versions newer
    where newer.document_id = v.document_id and newer.organization_id = v.organization_id
      and newer.version_number > v.version_number
      and newer.approval_status = 'approved'
      and coalesce(newer.effective_date, (newer.approved_at at time zone 'UTC')::date) <= (now() at time zone 'UTC')::date
  );

-- Caller-scoped future AI reads deliberately do not inherit managers' governance bypass.
create function public.current_ai_knowledge_versions()
returns table (
  id uuid, document_id uuid, version_number integer, title text,
  document_type text, effective_date date, expiry_date date
)
language sql stable security definer set search_path = public
as $$
  select v.id, v.document_id, v.version_number, v.title,
    v.document_type, v.effective_date, v.expiry_date
  from public.knowledge_ai_index_candidates v
  where public.can_read_knowledge_document(v.organization_id, v.access_scope, v.confidentiality);
$$;

revoke all on public.knowledge_ai_index_candidates from public, anon, authenticated;
grant select on public.knowledge_ai_index_candidates to service_role;
revoke all on function public.record_knowledge_submission(), public.audit_knowledge_lifecycle() from public, anon, authenticated;
revoke all on function public.transition_knowledge_version(uuid, text, text),
  public.transition_knowledge_document(uuid, text), public.current_ai_knowledge_versions() from public, anon;
grant execute on function public.transition_knowledge_version(uuid, text, text),
  public.transition_knowledge_document(uuid, text), public.current_ai_knowledge_versions() to authenticated;
