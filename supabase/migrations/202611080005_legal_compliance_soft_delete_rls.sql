drop policy if exists legal_compliance_obligations_select on public.legal_compliance_obligations;
create policy legal_compliance_obligations_select on public.legal_compliance_obligations
for select to authenticated using (
  deleted_at is null
  and (
    public.has_org_permission(organization_id, 'view_legal_compliance_register')
    or public.has_org_permission(organization_id, 'manage_legal_compliance_obligations')
  )
);

drop policy if exists legal_compliance_versions_select on public.legal_compliance_obligation_versions;
create policy legal_compliance_versions_select on public.legal_compliance_obligation_versions
for select to authenticated using (
  exists (
    select 1 from public.legal_compliance_obligations obligation
    where obligation.id = legal_compliance_obligation_versions.obligation_id
      and obligation.organization_id = legal_compliance_obligation_versions.organization_id
      and obligation.deleted_at is null
      and (
        public.has_org_permission(obligation.organization_id, 'view_legal_compliance_register')
        or public.has_org_permission(obligation.organization_id, 'manage_legal_compliance_obligations')
      )
  )
);

drop policy if exists legal_compliance_versions_insert on public.legal_compliance_obligation_versions;
create policy legal_compliance_versions_insert on public.legal_compliance_obligation_versions
for insert to authenticated with check (
  exists (
    select 1 from public.legal_compliance_obligations obligation
    where obligation.id = legal_compliance_obligation_versions.obligation_id
      and obligation.organization_id = legal_compliance_obligation_versions.organization_id
      and obligation.deleted_at is null
      and public.has_org_permission(obligation.organization_id, 'manage_legal_compliance_obligations')
  )
);

drop policy if exists legal_compliance_versions_update on public.legal_compliance_obligation_versions;
create policy legal_compliance_versions_update on public.legal_compliance_obligation_versions
for update to authenticated
using (
  exists (
    select 1 from public.legal_compliance_obligations obligation
    where obligation.id = legal_compliance_obligation_versions.obligation_id
      and obligation.organization_id = legal_compliance_obligation_versions.organization_id
      and obligation.deleted_at is null
      and public.has_org_permission(obligation.organization_id, 'manage_legal_compliance_obligations')
  )
)
with check (
  exists (
    select 1 from public.legal_compliance_obligations obligation
    where obligation.id = legal_compliance_obligation_versions.obligation_id
      and obligation.organization_id = legal_compliance_obligation_versions.organization_id
      and obligation.deleted_at is null
      and public.has_org_permission(obligation.organization_id, 'manage_legal_compliance_obligations')
  )
);

drop policy if exists legal_compliance_documents_select on storage.objects;
create policy legal_compliance_documents_select on storage.objects
for select to authenticated using (
  bucket_id = 'legal-compliance-documents'
  and exists (
    select 1
    from public.legal_compliance_obligation_versions version
    join public.legal_compliance_obligations obligation
      on obligation.id = version.obligation_id and obligation.organization_id = version.organization_id
    where version.document_path = storage.objects.name
      and obligation.deleted_at is null
      and (public.has_org_permission(obligation.organization_id, 'view_legal_compliance_register')
        or public.has_org_permission(obligation.organization_id, 'manage_legal_compliance_obligations'))
  )
);

notify pgrst, 'reload schema';