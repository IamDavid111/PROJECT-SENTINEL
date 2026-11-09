update storage.buckets
set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/rtf',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/tab-separated-values',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.presentation',
    'text/plain',
    'text/markdown',
    'application/json'
  ]::text[]
where id in ('hsse-policy-documents', 'legal-compliance-documents');

alter table public.organization_policy_objectives
  drop constraint if exists organization_policy_objectives_check,
  drop constraint if exists organization_policy_objectives_document_mime_type_check;

alter table public.organization_policy_objectives
  add constraint organization_policy_objectives_check check (
    (document_path is null and document_name is null and document_mime_type is null and document_size is null)
    or (document_path is not null and document_name is not null and document_mime_type is not null
      and document_size between 1 and 20971520)
  ),
  add constraint organization_policy_objectives_document_mime_type_check check (
    document_mime_type is null or document_mime_type = any(array[
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/tiff',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/rtf',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/tab-separated-values',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.presentation',
      'text/plain',
      'text/markdown',
      'application/json'
    ]::text[])
  );

alter table public.legal_compliance_obligation_versions
  drop constraint if exists legal_compliance_obligation_versions_check,
  drop constraint if exists legal_compliance_obligation_versions_document_mime_type_check;

alter table public.legal_compliance_obligation_versions
  add constraint legal_compliance_obligation_versions_check check (
    (document_path is null and document_name is null and document_mime_type is null and document_size is null)
    or (document_path is not null and document_name is not null and document_mime_type is not null
      and document_size between 1 and 20971520)
  ),
  add constraint legal_compliance_obligation_versions_document_mime_type_check check (
    document_mime_type is null or document_mime_type = any(array[
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/tiff',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/rtf',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/tab-separated-values',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.presentation',
      'text/plain',
      'text/markdown',
      'application/json'
    ]::text[])
  );
