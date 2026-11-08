create or replace function public.custom_role_permissions_allowed()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array[
    'view_dashboard', 'view_kpis', 'view_analytics', 'report_incident',
    'view_own_reports', 'view_all_assigned_actions', 'view_all_incidents',
    'manage_incidents', 'review_incidents', 'close_incidents', 'view_users',
    'invite_users', 'edit_users', 'suspend_users', 'deactivate_users',
    'manage_user_roles', 'view_roles_permissions', 'manage_roles_permissions',
    'view_all_reports', 'manage_reports', 'export_reports', 'manage_qhse',
    'manage_corrective_actions', 'manage_facility_risks', 'access_administration',
    'use_ai_assistant', 'view_executive_analytics', 'view_marketplace',
    'create_inspection', 'create_corrective_action', 'start_audit', 'view_reports',
    'manage_users', 'view_profile', 'view_activity', 'manage_settings',
    'view_knowledge_documents', 'manage_knowledge_documents',
    'approve_knowledge_documents', 'view_confidential_knowledge',
    'view_restricted_knowledge', 'view_policy_objectives_register',
    'manage_policy_objectives'
  ];
$$;

create table public.organization_policy_objectives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_type text not null check (item_type in ('policy', 'objective')),
  title text not null check (length(btrim(title)) between 1 and 200),
  description text not null default '',
  performance_target text not null default '',
  baseline_value text not null default '',
  approval_status text not null default 'approved' check (approval_status = 'approved'),
  document_path text,
  document_name text,
  document_mime_type text,
  document_size bigint,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (
    (document_path is null and document_name is null and document_mime_type is null and document_size is null)
    or (document_path is not null and document_name is not null and document_mime_type is not null
      and document_size between 1 and 104857600)
  ),
  check (
    document_mime_type is null or document_mime_type in (
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    )
  )
);

create index organization_policy_objectives_org_type_updated_idx
  on public.organization_policy_objectives (organization_id, item_type, updated_at desc);

create or replace function public.set_policy_objective_audit_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger organization_policy_objectives_audit_fields
before insert or update on public.organization_policy_objectives
for each row execute function public.set_policy_objective_audit_fields();

alter table public.organization_policy_objectives enable row level security;
revoke all on public.organization_policy_objectives from public, anon, authenticated;
grant select, insert, update, delete on public.organization_policy_objectives to authenticated;
grant all on public.organization_policy_objectives to service_role;

drop policy if exists organization_policy_objectives_select on public.organization_policy_objectives;
create policy organization_policy_objectives_select on public.organization_policy_objectives
for select to authenticated using (
  public.has_org_permission(organization_id, 'view_policy_objectives_register')
  or public.has_org_permission(organization_id, 'manage_policy_objectives')
);

drop policy if exists organization_policy_objectives_insert on public.organization_policy_objectives;
create policy organization_policy_objectives_insert on public.organization_policy_objectives
for insert to authenticated with check (
  public.has_org_permission(organization_id, 'manage_policy_objectives')
);

drop policy if exists organization_policy_objectives_update on public.organization_policy_objectives;
create policy organization_policy_objectives_update on public.organization_policy_objectives
for update to authenticated
using (public.has_org_permission(organization_id, 'manage_policy_objectives'))
with check (public.has_org_permission(organization_id, 'manage_policy_objectives'));

drop policy if exists organization_policy_objectives_delete on public.organization_policy_objectives;
create policy organization_policy_objectives_delete on public.organization_policy_objectives
for delete to authenticated using (
  public.has_org_permission(organization_id, 'manage_policy_objectives')
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hsse-policy-documents',
  'hsse-policy-documents',
  false,
  104857600,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists hsse_policy_documents_select on storage.objects;
create policy hsse_policy_documents_select on storage.objects
for select to authenticated using (
  bucket_id = 'hsse-policy-documents'
  and exists (
    select 1
    from public.organization_policy_objectives item
    where item.document_path = storage.objects.name
      and (
        public.has_org_permission(item.organization_id, 'view_policy_objectives_register')
        or public.has_org_permission(item.organization_id, 'manage_policy_objectives')
      )
  )
);

drop policy if exists hsse_policy_documents_insert on storage.objects;
create policy hsse_policy_documents_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'hsse-policy-documents'
  and exists (
    select 1
    from public.organization_policy_objectives item
    where item.id::text = (storage.foldername(name))[2]
      and item.organization_id::text = (storage.foldername(name))[1]
      and public.has_org_permission(item.organization_id, 'manage_policy_objectives')
  )
);

drop policy if exists hsse_policy_documents_delete on storage.objects;
create policy hsse_policy_documents_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'hsse-policy-documents'
  and public.has_org_permission((storage.foldername(name))[1]::uuid, 'manage_policy_objectives')
);

notify pgrst, 'reload schema';