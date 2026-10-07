create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  lifecycle_status text not null default 'active'
    check (lifecycle_status in ('active', 'archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint knowledge_documents_archive_consistency check (
    (lifecycle_status = 'active' and archived_at is null)
    or (lifecycle_status = 'archived' and archived_at is not null)
  )
);

-- Stable document identity is separate from immutable content/metadata snapshots per revision.
create table public.knowledge_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  document_type text not null check (document_type in (
    'policy', 'procedure', 'safe_work_method', 'risk_assessment',
    'standard', 'guideline', 'form', 'training_material', 'other'
  )),
  title text not null check (length(trim(title)) between 1 and 240),
  description text,
  site_id uuid,
  department text,
  owner_id uuid not null references auth.users(id) on delete restrict,
  effective_date date,
  review_date date,
  expiry_date date,
  approval_status text not null default 'draft'
    check (approval_status in ('draft', 'pending_review', 'approved', 'rejected', 'superseded')),
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  confidentiality text not null default 'internal'
    check (confidentiality in ('internal', 'confidential', 'restricted')),
  access_scope text not null default 'organization'
    check (access_scope in ('organization', 'site', 'management')),
  storage_path text not null,
  original_filename text not null check (length(trim(original_filename)) between 1 and 255),
  mime_type text not null check (length(trim(mime_type)) between 1 and 150),
  file_size bigint not null check (file_size > 0),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, version_number),
  unique (organization_id, storage_path),
  unique (id, document_id, organization_id),
  constraint knowledge_versions_document_same_organization
    foreign key (document_id, organization_id)
    references public.knowledge_documents(id, organization_id) on delete cascade,
  constraint knowledge_versions_site_same_organization
    foreign key (site_id, organization_id)
    references public.sites(id, organization_id) on delete restrict,
  constraint knowledge_versions_date_order check (
    (review_date is null or effective_date is null or review_date >= effective_date)
    and (expiry_date is null or effective_date is null or expiry_date >= effective_date)
  ),
  constraint knowledge_versions_site_scope check (
    (access_scope = 'site' and site_id is not null)
    or (access_scope <> 'site' and site_id is null)
  ),
  constraint knowledge_versions_approval_consistency check (
    (approval_status = 'approved' and approved_by is not null and approved_at is not null)
    or (approval_status <> 'approved' and approved_by is null and approved_at is null)
  )
);

create index knowledge_documents_organization_status_idx
  on public.knowledge_documents(organization_id, lifecycle_status, updated_at desc);
create index knowledge_versions_document_version_idx
  on public.knowledge_document_versions(document_id, version_number desc);
create index knowledge_versions_scope_idx
  on public.knowledge_document_versions(organization_id, access_scope, site_id);
create index knowledge_versions_review_idx
  on public.knowledge_document_versions(organization_id, review_date)
  where review_date is not null;

-- Derive tenant and actor identity from the authenticated profile rather than request values.
create function public.prepare_knowledge_document()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  actor_organization_id uuid;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      select p.organization_id into actor_organization_id
      from public.profiles p
      where p.id = auth.uid() and p.account_status = 'active';
      if actor_organization_id is null then
        raise exception 'Active organization membership is required' using errcode = '42501';
      end if;
      new.organization_id := actor_organization_id;
      new.created_by := auth.uid();
    elsif auth.role() = 'service_role' and new.organization_id is not null and new.created_by is not null then
      null;
    else
      raise exception 'Active organization membership is required' using errcode = '42501';
    end if;
    new.lifecycle_status := coalesce(new.lifecycle_status, 'active');
    new.archived_at := null;
  else
    if new.organization_id is distinct from old.organization_id
      or new.created_by is distinct from old.created_by then
      raise exception 'Knowledge document ownership is immutable' using errcode = '42501';
    end if;
    if new.lifecycle_status is distinct from old.lifecycle_status then
      new.archived_at := case when new.lifecycle_status = 'archived' then now() else null end;
    else
      new.archived_at := old.archived_at;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger knowledge_documents_prepare
before insert or update on public.knowledge_documents
for each row execute function public.prepare_knowledge_document();

-- Serialize version creation per document; version rows retain their original metadata and file reference.
create function public.prepare_knowledge_document_version()
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
    new.updated_at := now();
    if new.storage_path not like parent.organization_id::text || '/' || parent.id::text || '/' || new.id::text || '/%' then
      raise exception 'Knowledge file path does not match its organization, document and version' using errcode = '23514';
    end if;
    update public.knowledge_documents set updated_at = now() where id = parent.id;
  else
    -- Only approval state may change in place; content and file metadata require a new version.
    if (to_jsonb(new) - array['approval_status', 'approved_by', 'approved_at', 'updated_at'])
      is distinct from
       (to_jsonb(old) - array['approval_status', 'approved_by', 'approved_at', 'updated_at']) then
      raise exception 'Knowledge document version history is immutable' using errcode = '42501';
    end if;
    new.approved_by := case when new.approval_status = 'approved' then auth.uid() else null end;
    new.approved_at := case when new.approval_status = 'approved'
      then coalesce(old.approved_at, now()) else null end;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger knowledge_document_versions_prepare
before insert or update on public.knowledge_document_versions
for each row execute function public.prepare_knowledge_document_version();

create function public.can_manage_knowledge_documents(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    join public.memberships m on m.user_id = p.id and m.organization_id = p.organization_id
    where p.id = auth.uid() and p.organization_id = target_organization_id
      and p.account_status = 'active'
      and m.role = any(array[
        'Super Administrator', 'Organization Administrator', 'QHSE Manager',
        'Safety Officer / HSE Officer'
      ]::text[])
  );
$$;

create function public.can_read_knowledge_document(
  target_organization_id uuid,
  target_access_scope text,
  target_confidentiality text
)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    join public.memberships m on m.user_id = p.id and m.organization_id = p.organization_id
    where p.id = auth.uid() and p.organization_id = target_organization_id
      and p.account_status = 'active'
      and (
        target_access_scope = 'organization'
        or (target_access_scope = 'site' and m.role = any(array[
          'Super Administrator', 'Organization Administrator', 'QHSE Manager',
          'Safety Officer / HSE Officer', 'Site Supervisor'
        ]::text[]))
        or (target_access_scope = 'management' and m.role = any(array[
          'Super Administrator', 'Organization Administrator', 'QHSE Manager'
        ]::text[]))
      )
      and (
        target_confidentiality = 'internal'
        or (target_confidentiality = 'confidential' and m.role = any(array[
          'Super Administrator', 'Organization Administrator', 'QHSE Manager',
          'Safety Officer / HSE Officer'
        ]::text[]))
        or (target_confidentiality = 'restricted' and m.role = any(array[
          'Super Administrator', 'Organization Administrator', 'QHSE Manager'
        ]::text[]))
      )
  );
$$;

create function public.can_read_knowledge_document_record(target_document_id uuid, target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  -- Managers retain access to drafts and archives; other members need an active approved revision.
  select public.can_manage_knowledge_documents(target_organization_id)
    or exists (
      select 1
      from public.knowledge_documents d
      join public.knowledge_document_versions v on v.document_id = d.id
        and v.organization_id = d.organization_id
      where d.id = target_document_id
        and d.organization_id = target_organization_id
        and d.lifecycle_status = 'active'
        and v.approval_status = 'approved'
        and public.can_read_knowledge_document(v.organization_id, v.access_scope, v.confidentiality)
    );
$$;

revoke all on function public.prepare_knowledge_document() from public, anon, authenticated;
revoke all on function public.prepare_knowledge_document_version() from public, anon, authenticated;
revoke all on function public.can_manage_knowledge_documents(uuid) from public, anon;
revoke all on function public.can_read_knowledge_document(uuid, text, text) from public, anon;
revoke all on function public.can_read_knowledge_document_record(uuid, uuid) from public, anon;
grant execute on function public.can_manage_knowledge_documents(uuid) to authenticated;
grant execute on function public.can_read_knowledge_document(uuid, text, text) to authenticated;
grant execute on function public.can_read_knowledge_document_record(uuid, uuid) to authenticated;

alter table public.knowledge_documents enable row level security;
alter table public.knowledge_document_versions enable row level security;
revoke all on public.knowledge_documents, public.knowledge_document_versions from public, anon, authenticated;
grant select, insert, update on public.knowledge_documents to authenticated;
grant select, insert, update on public.knowledge_document_versions to authenticated;
grant all on public.knowledge_documents, public.knowledge_document_versions to service_role;

create policy knowledge_documents_select on public.knowledge_documents
for select to authenticated using (
  public.can_read_knowledge_document_record(id, organization_id)
);

create policy knowledge_documents_insert_manager on public.knowledge_documents
for insert to authenticated
with check (public.can_manage_knowledge_documents(organization_id));

create policy knowledge_documents_update_manager on public.knowledge_documents
for update to authenticated
using (public.can_manage_knowledge_documents(organization_id))
with check (public.can_manage_knowledge_documents(organization_id));

create policy knowledge_versions_select on public.knowledge_document_versions
for select to authenticated using (
  public.can_manage_knowledge_documents(organization_id)
  or (
    public.can_read_knowledge_document_record(document_id, organization_id)
    and approval_status = 'approved'
    and public.can_read_knowledge_document(
      organization_id, access_scope, confidentiality
    )
  )
);

create policy knowledge_versions_insert_manager on public.knowledge_document_versions
for insert to authenticated
with check (
  public.can_manage_knowledge_documents(organization_id)
  and approval_status in ('draft', 'pending_review')
);

create policy knowledge_versions_update_manager on public.knowledge_document_versions
for update to authenticated
using (public.can_manage_knowledge_documents(organization_id))
with check (public.can_manage_knowledge_documents(organization_id));

insert into storage.buckets (id, name, public)
values ('qhse-knowledge', 'qhse-knowledge', false)
on conflict (id) do nothing;

create policy qhse_knowledge_storage_select on storage.objects
for select to authenticated using (
  bucket_id = 'qhse-knowledge'
  and exists (
    select 1 from public.knowledge_document_versions v
    where v.storage_path = storage.objects.name
      and v.approval_status = 'approved'
      and public.can_read_knowledge_document_record(v.document_id, v.organization_id)
      and public.can_read_knowledge_document(v.organization_id, v.access_scope, v.confidentiality)
  )
);

create policy qhse_knowledge_storage_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'qhse-knowledge'
  and exists (
    -- The object uploads before its version row is inserted, so authorize via its document path.
    select 1 from public.knowledge_documents d
    where d.id = (storage.foldername(name))[2]::uuid
      and d.organization_id = (storage.foldername(name))[1]::uuid
      and d.lifecycle_status = 'active'
      and public.can_manage_knowledge_documents(d.organization_id)
      and (storage.foldername(name))[3]::uuid is not null
  )
);
