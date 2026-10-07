alter table public.knowledge_document_versions
  add column if not exists rejected_by uuid references auth.users(id) on delete restrict,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists uploaded_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.knowledge_document_versions'::regclass
      and conname = 'knowledge_versions_rejection_consistency'
  ) then
    alter table public.knowledge_document_versions
      add constraint knowledge_versions_rejection_consistency check (
    (approval_status = 'rejected'
      and rejected_by is not null
      and rejected_at is not null
      and length(trim(rejection_reason)) between 1 and 2000)
    or (approval_status <> 'rejected'
      and rejected_by is null
      and rejected_at is null
      and rejection_reason is null)
      );
  end if;
end;
$$;

create or replace function public.prepare_knowledge_document_version()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  parent public.knowledge_documents;
  latest_version integer;
begin
  if tg_op = 'INSERT' then
    select * into parent from public.knowledge_documents
    where id = new.document_id
    for update;
    if not found or parent.lifecycle_status <> 'active' then
      raise exception 'Active knowledge document is required' using errcode = '42501';
    end if;
    -- New versions must start as drafts so review always follows a verified upload.
    if new.approval_status is distinct from 'draft' then
      raise exception 'New knowledge document versions must start as drafts' using errcode = '23514';
    end if;
    select coalesce(max(version_number), 0) into latest_version
    from public.knowledge_document_versions where document_id = parent.id;
    if new.version_number <> latest_version + 1 then
      raise exception 'Knowledge document versions must be added sequentially' using errcode = '23514';
    end if;
    new.organization_id := parent.organization_id;
    if auth.uid() is not null then
      new.owner_id := coalesce(new.owner_id, auth.uid());
      new.uploaded_by := auth.uid();
      if not exists (
        select 1 from public.profiles p
        join public.memberships m on m.user_id = p.id and m.organization_id = p.organization_id
        where p.id = new.owner_id and p.organization_id = parent.organization_id
          and p.account_status = 'active'
      ) then
        raise exception 'Document owner must be an active organization member' using errcode = '42501';
      end if;
    elsif coalesce(auth.role(), '') <> 'service_role' or new.owner_id is null or new.uploaded_by is null then
      raise exception 'Authenticated knowledge document actor is required' using errcode = '42501';
    end if;
    new.approved_by := null;
    new.approved_at := null;
    new.rejected_by := null;
    new.rejected_at := null;
    new.rejection_reason := null;
    new.uploaded_at := null;
    new.updated_at := now();
    if new.storage_path not like parent.organization_id::text || '/' || parent.id::text || '/' || new.id::text || '/%' then
      raise exception 'Knowledge file path does not match its organization, document and version' using errcode = '23514';
    end if;
    update public.knowledge_documents set updated_at = now() where id = parent.id;
  else
    if new.organization_id is distinct from old.organization_id
      or new.document_id is distinct from old.document_id
      or new.version_number is distinct from old.version_number
      or new.storage_path is distinct from old.storage_path
      or new.original_filename is distinct from old.original_filename
      or new.mime_type is distinct from old.mime_type
      or new.file_size is distinct from old.file_size
      or new.uploaded_by is distinct from old.uploaded_by
      or new.created_at is distinct from old.created_at then
      raise exception 'Knowledge document identity and file history are immutable' using errcode = '42501';
    end if;

    if old.approval_status = 'draft' and new.approval_status = 'draft' then
      -- Archiving freezes drafts: no metadata edits or upload completion until restored.
      if not exists (
        select 1 from public.knowledge_documents d
        where d.id = old.document_id and d.organization_id = old.organization_id
          and d.lifecycle_status = 'active'
      ) then
        raise exception 'Archived document drafts cannot be changed' using errcode = '42501';
      end if;
      -- Only the server may mark upload completion after verifying the private Storage object.
      if old.uploaded_at is null and new.uploaded_at is not null
        and coalesce(auth.role(), '') = 'service_role'
        and (to_jsonb(new) - array['uploaded_at', 'updated_at'])
          is not distinct from (to_jsonb(old) - array['uploaded_at', 'updated_at']) then
        new.updated_at := now();
        return new;
      end if;
      if (to_jsonb(new) - array[
        'document_type', 'title', 'description', 'site_id', 'department', 'owner_id',
        'effective_date', 'review_date', 'expiry_date', 'confidentiality',
        'access_scope', 'updated_at'
      ]) is distinct from (to_jsonb(old) - array[
        'document_type', 'title', 'description', 'site_id', 'department', 'owner_id',
        'effective_date', 'review_date', 'expiry_date', 'confidentiality',
        'access_scope', 'updated_at'
      ]) then
        raise exception 'Only draft metadata can be edited' using errcode = '42501';
      end if;
      if not exists (
        select 1 from public.profiles p
        join public.memberships m on m.user_id = p.id and m.organization_id = p.organization_id
        where p.id = new.owner_id and p.organization_id = old.organization_id
          and p.account_status = 'active'
      ) then
        raise exception 'Document owner must be an active organization member' using errcode = '42501';
      end if;
    elsif old.approval_status = 'draft' and new.approval_status = 'pending_review' then
      if old.uploaded_at is null then
        raise exception 'The registered file must be uploaded before submission' using errcode = '23514';
      end if;
      if not exists (
        select 1 from public.knowledge_documents d
        where d.id = old.document_id and d.organization_id = old.organization_id
          and d.lifecycle_status = 'active'
      ) then
        raise exception 'Archived documents cannot enter approval' using errcode = '42501';
      end if;
      if (to_jsonb(new) - array['approval_status', 'updated_at'])
        is distinct from (to_jsonb(old) - array['approval_status', 'updated_at']) then
        raise exception 'Submit the saved draft without changing its content' using errcode = '42501';
      end if;
      new.approved_by := null;
      new.approved_at := null;
      new.rejected_by := null;
      new.rejected_at := null;
      new.rejection_reason := null;
    elsif old.approval_status = 'pending_review'
      and new.approval_status in ('approved', 'rejected') then
      if not exists (
        select 1 from public.knowledge_documents d
        where d.id = old.document_id and d.organization_id = old.organization_id
          and d.lifecycle_status = 'active'
      ) then
        raise exception 'Archived documents cannot receive approval decisions' using errcode = '42501';
      end if;
      -- Defence in depth: never approve or reject a version whose file was not verified.
      if old.uploaded_at is null then
        raise exception 'The registered file must be uploaded before review' using errcode = '23514';
      end if;
      if (to_jsonb(new) - array[
        'approval_status', 'approved_by', 'approved_at',
        'rejected_by', 'rejected_at', 'rejection_reason', 'updated_at'
      ]) is distinct from (to_jsonb(old) - array[
        'approval_status', 'approved_by', 'approved_at',
        'rejected_by', 'rejected_at', 'rejection_reason', 'updated_at'
      ]) then
        raise exception 'A review decision cannot change document content' using errcode = '42501';
      end if;
      if new.approval_status = 'approved' then
        new.approved_by := auth.uid();
        new.approved_at := now();
        new.rejected_by := null;
        new.rejected_at := null;
        new.rejection_reason := null;
      else
        new.approved_by := null;
        new.approved_at := null;
        new.rejected_by := auth.uid();
        new.rejected_at := now();
        new.rejection_reason := nullif(trim(new.rejection_reason), '');
      end if;
    else
      raise exception 'Invalid knowledge document version transition' using errcode = '42501';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
