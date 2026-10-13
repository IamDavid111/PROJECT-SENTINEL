-- Phase 3: Super Administrator-configurable QHSE knowledge permissions via Roles & Permissions.

create or replace function public.custom_role_permissions_allowed()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array[
    'view_dashboard',
    'view_kpis',
    'view_analytics',
    'report_incident',
    'view_own_reports',
    'view_all_incidents',
    'manage_incidents',
    'review_incidents',
    'close_incidents',
    'view_users',
    'invite_users',
    'edit_users',
    'suspend_users',
    'deactivate_users',
    'manage_user_roles',
    'view_roles_permissions',
    'manage_roles_permissions',
    'view_all_reports',
    'manage_reports',
    'export_reports',
    'manage_qhse',
    'manage_corrective_actions',
    'manage_facility_risks',
    'access_administration',
    'use_ai_assistant',
    'view_executive_analytics',
    'view_marketplace',
    'create_inspection',
    'create_corrective_action',
    'start_audit',
    'view_reports',
    'manage_users',
    'view_profile',
    'view_activity',
    'manage_settings',
    'view_knowledge_documents',
    'manage_knowledge_documents',
    'approve_knowledge_documents',
    'view_confidential_knowledge',
    'view_restricted_knowledge'
  ];
$$;

-- Built-in roles are fixed platform defaults (view-only in Roles & Permissions) and keep the
-- Phase 3 behaviour. Custom roles get knowledge rights only through administrator-granted keys.
create function public.knowledge_role_has_permission(
  target_organization_id uuid,
  role_name text,
  permission text
)
returns boolean language sql stable security definer set search_path = public
as $$
  select case
    when role_name = 'Super Administrator' then true
    when public.is_builtin_role_name(role_name) then case permission
      when 'view_knowledge_documents' then true
      when 'manage_knowledge_documents' then role_name = any(array[
        'Organization Administrator', 'QHSE Manager', 'Safety Officer / HSE Officer'
      ]::text[])
      when 'approve_knowledge_documents' then role_name = any(array[
        'Organization Administrator', 'QHSE Manager', 'Safety Officer / HSE Officer'
      ]::text[])
      when 'view_confidential_knowledge' then role_name = any(array[
        'Organization Administrator', 'QHSE Manager', 'Safety Officer / HSE Officer'
      ]::text[])
      when 'view_restricted_knowledge' then role_name = any(array[
        'Organization Administrator', 'QHSE Manager'
      ]::text[])
      else false
    end
    else exists (
      select 1 from public.custom_roles cr
      where cr.organization_id = target_organization_id and cr.name = role_name
        and cr.is_active and cr.permissions ? permission
    )
  end;
$$;

create function public.has_knowledge_permission(target_organization_id uuid, permission text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    join public.memberships m on m.user_id = p.id and m.organization_id = p.organization_id
    where p.id = auth.uid() and p.organization_id = target_organization_id
      and p.account_status = 'active'
      and public.knowledge_role_has_permission(target_organization_id, m.role, permission)
  );
$$;

create or replace function public.can_manage_knowledge_documents(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.has_knowledge_permission(target_organization_id, 'manage_knowledge_documents');
$$;

create function public.can_review_knowledge_documents(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.has_knowledge_permission(target_organization_id, 'approve_knowledge_documents');
$$;

create or replace function public.can_read_knowledge_document(
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
      and public.knowledge_role_has_permission(target_organization_id, m.role, 'view_knowledge_documents')
      and case target_access_scope
        when 'organization' then true
        -- Site/management scopes keep built-in role defaults; custom roles need view rights
        -- for site scope and management (manage/approve) rights for management scope.
        when 'site' then case when public.is_builtin_role_name(m.role) then m.role = any(array[
            'Super Administrator', 'Organization Administrator', 'QHSE Manager',
            'Safety Officer / HSE Officer', 'Site Supervisor'
          ]::text[]) else true end
        when 'management' then case when public.is_builtin_role_name(m.role) then m.role = any(array[
            'Super Administrator', 'Organization Administrator', 'QHSE Manager'
          ]::text[]) else (
            public.knowledge_role_has_permission(target_organization_id, m.role, 'manage_knowledge_documents')
            or public.knowledge_role_has_permission(target_organization_id, m.role, 'approve_knowledge_documents')
          ) end
        else false
      end
      and case target_confidentiality
        when 'internal' then true
        when 'confidential' then public.knowledge_role_has_permission(
          target_organization_id, m.role, 'view_confidential_knowledge')
        when 'restricted' then public.knowledge_role_has_permission(
          target_organization_id, m.role, 'view_restricted_knowledge')
        else false
      end
  );
$$;

create or replace function public.can_read_knowledge_document_record(target_document_id uuid, target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  -- Managers and approvers retain governance access; other readers need an active approved
  -- revision whose scope and confidentiality their role permissions allow.
  select public.can_manage_knowledge_documents(target_organization_id)
    or public.can_review_knowledge_documents(target_organization_id)
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

-- Approval decisions require the approve permission; all other edits require manage rights.
create function public.enforce_knowledge_version_permissions()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if old.approval_status = 'pending_review' and new.approval_status in ('approved', 'rejected') then
    if not public.can_review_knowledge_documents(old.organization_id) then
      raise exception 'QHSE document approval permission is required' using errcode = '42501';
    end if;
  elsif not public.can_manage_knowledge_documents(old.organization_id) then
    raise exception 'QHSE document management permission is required' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger knowledge_document_versions_enforce_permissions
before update on public.knowledge_document_versions
for each row execute function public.enforce_knowledge_version_permissions();

create function public.current_knowledge_capabilities()
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'canView', public.has_knowledge_permission(p.organization_id, 'view_knowledge_documents'),
    'canManage', public.has_knowledge_permission(p.organization_id, 'manage_knowledge_documents'),
    'canApprove', public.has_knowledge_permission(p.organization_id, 'approve_knowledge_documents'),
    'canViewConfidential', public.has_knowledge_permission(p.organization_id, 'view_confidential_knowledge'),
    'canViewRestricted', public.has_knowledge_permission(p.organization_id, 'view_restricted_knowledge')
  )
  from public.profiles p where p.id = auth.uid();
$$;

revoke all on function public.knowledge_role_has_permission(uuid, text, text) from public, anon, authenticated;
revoke all on function public.enforce_knowledge_version_permissions() from public, anon, authenticated;
revoke all on function public.has_knowledge_permission(uuid, text) from public, anon;
revoke all on function public.can_review_knowledge_documents(uuid) from public, anon;
revoke all on function public.current_knowledge_capabilities() from public, anon;
grant execute on function public.has_knowledge_permission(uuid, text) to authenticated;
grant execute on function public.can_review_knowledge_documents(uuid) to authenticated;
grant execute on function public.current_knowledge_capabilities() to authenticated;

drop policy if exists knowledge_versions_select on public.knowledge_document_versions;
create policy knowledge_versions_select on public.knowledge_document_versions
for select to authenticated using (
  public.can_manage_knowledge_documents(organization_id)
  or public.can_review_knowledge_documents(organization_id)
  or (
    public.can_read_knowledge_document_record(document_id, organization_id)
    and approval_status = 'approved'
    and public.can_read_knowledge_document(organization_id, access_scope, confidentiality)
  )
);

drop policy if exists knowledge_versions_update_manager on public.knowledge_document_versions;
create policy knowledge_versions_update_manager on public.knowledge_document_versions
for update to authenticated
using (
  public.can_manage_knowledge_documents(organization_id)
  or public.can_review_knowledge_documents(organization_id)
)
with check (
  public.can_manage_knowledge_documents(organization_id)
  or public.can_review_knowledge_documents(organization_id)
);
