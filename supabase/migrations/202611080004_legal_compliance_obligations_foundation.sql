alter table public.organization_policy_objective_permission_overrides
  drop constraint if exists organization_policy_objective_permission_overrides_permission_key_check;

alter table public.organization_policy_objective_permission_overrides
  add constraint organization_policy_objective_permission_overrides_permission_key_check
  check (permission_key in (
    'view_policy_objectives_register',
    'manage_policy_objectives',
    'view_legal_compliance_register',
    'manage_legal_compliance_obligations'
  ));

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
    'manage_policy_objectives', 'view_legal_compliance_register',
    'manage_legal_compliance_obligations'
  ];
$$;

create or replace function public.has_org_permission(
  p_organization_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships membership
    join public.profiles profile
      on profile.id = membership.user_id
     and profile.organization_id = membership.organization_id
    where membership.organization_id = p_organization_id
      and membership.user_id = auth.uid()
      and profile.account_status = 'active'
      and case
        when membership.role = 'Super Administrator' then true
        when p_permission in (
          'view_policy_objectives_register',
          'manage_policy_objectives',
          'view_legal_compliance_register',
          'manage_legal_compliance_obligations'
        ) and exists (
          select 1
          from public.organization_policy_objective_permission_overrides permission_override
          where permission_override.organization_id = membership.organization_id
            and permission_override.user_id = membership.user_id
            and permission_override.permission_key = p_permission
        ) then (
          select permission_override.is_granted
          from public.organization_policy_objective_permission_overrides permission_override
          where permission_override.organization_id = membership.organization_id
            and permission_override.user_id = membership.user_id
            and permission_override.permission_key = p_permission
        )
        when public.is_builtin_role_name(membership.role) then exists (
          select 1
          from public.organization_builtin_role_settings role_setting
          where role_setting.organization_id = membership.organization_id
            and role_setting.role_key = membership.role
            and not role_setting.is_deleted
            and role_setting.permissions ? p_permission
        )
        else exists (
          select 1
          from public.custom_roles custom_role
          where custom_role.organization_id = membership.organization_id
            and custom_role.name = membership.role
            and not custom_role.is_deleted
            and custom_role.permissions ? p_permission
        )
      end
  );
$$;

create or replace function public.get_policy_objective_user_permission_overrides(
  p_organization_id uuid,
  p_target_user_id uuid
)
returns table(permission_key text, is_granted boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_org_admin_for_role_management(p_organization_id) then
    raise exception 'Only a Super Administrator can manage individual register permissions'
      using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.memberships membership
    join public.profiles profile
      on profile.id = membership.user_id
     and profile.organization_id = membership.organization_id
    where membership.organization_id = p_organization_id
      and membership.user_id = p_target_user_id
      and profile.account_status = 'active'
  ) then
    raise exception 'The selected user is not an active member of this organization'
      using errcode = '22023';
  end if;

  return query
  select permission.permission_key, permission_override.is_granted
  from unnest(array[
    'view_policy_objectives_register',
    'manage_policy_objectives',
    'view_legal_compliance_register',
    'manage_legal_compliance_obligations'
  ]::text[]) as permission(permission_key)
  left join public.organization_policy_objective_permission_overrides permission_override
    on permission_override.organization_id = p_organization_id
   and permission_override.user_id = p_target_user_id
   and permission_override.permission_key = permission.permission_key;
end;
$$;

create or replace function public.set_policy_objective_user_permission_override(
  p_organization_id uuid,
  p_target_user_id uuid,
  p_permission_key text,
  p_is_granted boolean default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_org_admin_for_role_management(p_organization_id) then
    raise exception 'Only a Super Administrator can manage individual register permissions'
      using errcode = '42501';
  end if;
  if p_permission_key not in (
    'view_policy_objectives_register',
    'manage_policy_objectives',
    'view_legal_compliance_register',
    'manage_legal_compliance_obligations'
  ) then
    raise exception 'Unsupported register permission' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.memberships membership
    join public.profiles profile
      on profile.id = membership.user_id
     and profile.organization_id = membership.organization_id
    where membership.organization_id = p_organization_id
      and membership.user_id = p_target_user_id
      and profile.account_status = 'active'
      and membership.role <> 'Super Administrator'
  ) then
    raise exception 'The selected user is not an eligible active organization member'
      using errcode = '22023';
  end if;

  if p_is_granted is null then
    delete from public.organization_policy_objective_permission_overrides
    where organization_id = p_organization_id
      and user_id = p_target_user_id
      and permission_key = p_permission_key;
  else
    insert into public.organization_policy_objective_permission_overrides (
      organization_id, user_id, permission_key, is_granted, updated_by, updated_at
    ) values (
      p_organization_id, p_target_user_id, p_permission_key, p_is_granted, auth.uid(), now()
    )
    on conflict (organization_id, user_id, permission_key) do update
    set is_granted = excluded.is_granted,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
  end if;

  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  values (
    p_organization_id,
    auth.uid(),
    'Organization register permission changed',
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'permission_key', p_permission_key,
      'is_granted', p_is_granted
    )
  );
end;
$$;

create table public.legal_compliance_obligations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  obligation_name text not null check (length(btrim(obligation_name)) between 1 and 200),
  category text not null check (category in ('license', 'permit', 'approval', 'certification', 'other')),
  issuing_authority text not null check (length(btrim(issuing_authority)) between 1 and 200),
  scope_type text not null check (scope_type in ('organization', 'site', 'department')),
  site_id uuid,
  department text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, organization_id),
  foreign key (site_id, organization_id) references public.sites(id, organization_id) on delete restrict,
  check (
    (scope_type = 'organization' and site_id is null and department is null)
    or (scope_type = 'site' and site_id is not null and department is null)
    or (scope_type = 'department' and site_id is null and length(btrim(coalesce(department, ''))) between 1 and 160)
  )
);

create table public.legal_compliance_obligation_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  obligation_id uuid not null,
  version_number integer not null default 1 check (version_number > 0),
  is_active boolean not null default true,
  issue_date date not null,
  expiry_date date,
  responsible_person_id uuid not null,
  compliance_status text not null default 'not_assessed'
    check (compliance_status in ('not_assessed', 'compliant', 'non_compliant', 'under_review')),
  document_path text,
  document_name text,
  document_mime_type text,
  document_size bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id, organization_id, obligation_id),
  unique (organization_id, obligation_id, version_number),
  foreign key (obligation_id, organization_id)
    references public.legal_compliance_obligations(id, organization_id) on delete cascade,
  foreign key (responsible_person_id, organization_id)
    references public.memberships(user_id, organization_id) on delete restrict,
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

create unique index legal_compliance_one_active_version_idx
  on public.legal_compliance_obligation_versions (organization_id, obligation_id)
  where is_active;
create index legal_compliance_obligations_org_deleted_idx
  on public.legal_compliance_obligations (organization_id, deleted_at, updated_at desc);
create index legal_compliance_versions_org_expiry_idx
  on public.legal_compliance_obligation_versions (organization_id, expiry_date)
  where is_active;

create or replace function public.set_legal_compliance_audit_fields()
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

create trigger legal_compliance_obligations_audit_fields
before insert or update on public.legal_compliance_obligations
for each row execute function public.set_legal_compliance_audit_fields();

alter table public.legal_compliance_obligations enable row level security;
alter table public.legal_compliance_obligation_versions enable row level security;
revoke all on public.legal_compliance_obligations, public.legal_compliance_obligation_versions from public, anon, authenticated;
grant select, insert, update on public.legal_compliance_obligations to authenticated;
grant select, insert, update on public.legal_compliance_obligation_versions to authenticated;
grant all on public.legal_compliance_obligations, public.legal_compliance_obligation_versions to service_role;

drop policy if exists legal_compliance_obligations_select on public.legal_compliance_obligations;
create policy legal_compliance_obligations_select on public.legal_compliance_obligations
for select to authenticated using (
  public.has_org_permission(organization_id, 'view_legal_compliance_register')
  or public.has_org_permission(organization_id, 'manage_legal_compliance_obligations')
);
drop policy if exists legal_compliance_obligations_insert on public.legal_compliance_obligations;
create policy legal_compliance_obligations_insert on public.legal_compliance_obligations
for insert to authenticated with check (
  public.has_org_permission(organization_id, 'manage_legal_compliance_obligations')
);
drop policy if exists legal_compliance_obligations_update on public.legal_compliance_obligations;
create policy legal_compliance_obligations_update on public.legal_compliance_obligations
for update to authenticated
using (public.has_org_permission(organization_id, 'manage_legal_compliance_obligations'))
with check (public.has_org_permission(organization_id, 'manage_legal_compliance_obligations'));

drop policy if exists legal_compliance_versions_select on public.legal_compliance_obligation_versions;
create policy legal_compliance_versions_select on public.legal_compliance_obligation_versions
for select to authenticated using (
  public.has_org_permission(organization_id, 'view_legal_compliance_register')
  or public.has_org_permission(organization_id, 'manage_legal_compliance_obligations')
);
drop policy if exists legal_compliance_versions_insert on public.legal_compliance_obligation_versions;
create policy legal_compliance_versions_insert on public.legal_compliance_obligation_versions
for insert to authenticated with check (
  public.has_org_permission(organization_id, 'manage_legal_compliance_obligations')
);
drop policy if exists legal_compliance_versions_update on public.legal_compliance_obligation_versions;
create policy legal_compliance_versions_update on public.legal_compliance_obligation_versions
for update to authenticated
using (public.has_org_permission(organization_id, 'manage_legal_compliance_obligations'))
with check (public.has_org_permission(organization_id, 'manage_legal_compliance_obligations'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'legal-compliance-documents',
  'legal-compliance-documents',
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

drop policy if exists legal_compliance_documents_select on storage.objects;
create policy legal_compliance_documents_select on storage.objects
for select to authenticated using (
  bucket_id = 'legal-compliance-documents'
  and exists (
    select 1 from public.legal_compliance_obligation_versions version
    where version.document_path = storage.objects.name
      and (public.has_org_permission(version.organization_id, 'view_legal_compliance_register')
        or public.has_org_permission(version.organization_id, 'manage_legal_compliance_obligations'))
  )
);
drop policy if exists legal_compliance_documents_insert on storage.objects;
create policy legal_compliance_documents_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'legal-compliance-documents'
  and exists (
    select 1
    from public.legal_compliance_obligation_versions version
    join public.legal_compliance_obligations obligation
      on obligation.id = version.obligation_id and obligation.organization_id = version.organization_id
    where version.id::text = (storage.foldername(name))[3]
      and version.obligation_id::text = (storage.foldername(name))[2]
      and version.organization_id::text = (storage.foldername(name))[1]
      and obligation.deleted_at is null
      and public.has_org_permission(version.organization_id, 'manage_legal_compliance_obligations')
  )
);
drop policy if exists legal_compliance_documents_delete on storage.objects;
create policy legal_compliance_documents_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'legal-compliance-documents'
  and public.has_org_permission((storage.foldername(name))[1]::uuid, 'manage_legal_compliance_obligations')
);

revoke all on function public.get_policy_objective_user_permission_overrides(uuid, uuid) from public, anon;
revoke all on function public.set_policy_objective_user_permission_override(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.get_policy_objective_user_permission_overrides(uuid, uuid) to authenticated;
grant execute on function public.set_policy_objective_user_permission_override(uuid, uuid, text, boolean) to authenticated;

notify pgrst, 'reload schema';