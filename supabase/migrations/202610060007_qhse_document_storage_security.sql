alter table public.knowledge_document_versions
  add constraint knowledge_versions_file_type_size
  check (
    mime_type in (
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    )
    and file_size <= 104857600
  );

-- Keep Storage limits aligned with the document evidence types already accepted by the app.
update storage.buckets
set public = false,
    file_size_limit = 104857600,
    allowed_mime_types = array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ]::text[]
where id = 'qhse-knowledge';

drop policy if exists qhse_knowledge_storage_insert on storage.objects;

create policy qhse_knowledge_storage_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'qhse-knowledge'
  and exists (
    -- Create immutable version metadata first so an upload cannot leave unlinked storage objects.
    select 1
    from public.knowledge_document_versions v
    join public.knowledge_documents d
      on d.id = v.document_id and d.organization_id = v.organization_id
    where v.storage_path = storage.objects.name
      and d.lifecycle_status = 'active'
      and v.approval_status in ('draft', 'pending_review')
      and public.can_manage_knowledge_documents(v.organization_id)
  )
);
