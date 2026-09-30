-- Prompt 4 Batch 5: findings, root cause, and investigation-stage immediate correction.
-- The original incidents.immediate_correction field remains report-time capture.

create table public.investigation_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  investigation_id uuid not null,
  description text not null check (char_length(btrim(description)) >= 3),
  finding_type text,
  significance text,
  evidence_reference text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investigation_findings_id_organization_unique unique (id, organization_id),
  constraint investigation_findings_investigation_same_organization
    foreign key (investigation_id, organization_id)
    references public.investigations(id, organization_id)
    on delete cascade,
  constraint investigation_findings_created_by_same_organization
    foreign key (created_by, organization_id)
    references public.profiles(id, organization_id)
    on delete restrict
);
create table public.investigation_root_causes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  investigation_id uuid not null,
  root_cause_statement text not null check (char_length(btrim(root_cause_statement)) >= 3),
  contributing_factors text,
  cause_category text,
  supporting_explanation text,
  evidence_reference text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investigation_root_causes_id_organization_unique unique (id, organization_id),
  constraint investigation_root_causes_investigation_unique unique (organization_id, investigation_id),
  constraint investigation_root_causes_investigation_same_organization
    foreign key (investigation_id, organization_id)
    references public.investigations(id, organization_id)
    on delete cascade,
  constraint investigation_root_causes_created_by_same_organization
    foreign key (created_by, organization_id)
    references public.profiles(id, organization_id)
    on delete restrict
);
create table public.investigation_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  investigation_id uuid not null,
  correction_description text not null check (char_length(btrim(correction_description)) >= 3),
  containment_taken text,
  responsible_person_id uuid,
  completed_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investigation_corrections_id_organization_unique unique (id, organization_id),
  constraint investigation_corrections_investigation_unique unique (organization_id, investigation_id),
  constraint investigation_corrections_investigation_same_organization
    foreign key (investigation_id, organization_id)
    references public.investigations(id, organization_id)
    on delete cascade,
  constraint investigation_corrections_responsible_same_organization
    foreign key (responsible_person_id, organization_id)
    references public.profiles(id, organization_id)
    on delete restrict,
  constraint investigation_corrections_created_by_same_organization
    foreign key (created_by, organization_id)
    references public.profiles(id, organization_id)
    on delete restrict,
  constraint investigation_corrections_completed_after_creation
    check (completed_at is null or completed_at::date >= created_at::date)
);
create table public.investigation_correction_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  correction_id uuid not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, storage_path),
  constraint investigation_correction_evidence_id_organization_unique unique (id, organization_id),
  constraint investigation_correction_evidence_correction_same_organization
    foreign key (correction_id, organization_id)
    references public.investigation_corrections(id, organization_id)
    on delete cascade
);
create index investigation_findings_organization_investigation_idx on public.investigation_findings(organization_id, investigation_id);
create index investigation_root_causes_organization_investigation_idx on public.investigation_root_causes(organization_id, investigation_id);
create index investigation_corrections_organization_investigation_idx on public.investigation_corrections(organization_id, investigation_id);
create index investigation_correction_evidence_organization_correction_idx on public.investigation_correction_evidence(organization_id, correction_id);
create trigger investigation_findings_set_updated_at before update on public.investigation_findings for each row execute function public.set_updated_at();
create trigger investigation_root_causes_set_updated_at before update on public.investigation_root_causes for each row execute function public.set_updated_at();
create trigger investigation_corrections_set_updated_at before update on public.investigation_corrections for each row execute function public.set_updated_at();
create or replace function public.can_manage_investigation_content(target_organization_id uuid, target_investigation_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_investigation(target_organization_id, target_investigation_id);
$$;
revoke all on function public.can_manage_investigation_content(uuid, uuid) from public, anon;
grant execute on function public.can_manage_investigation_content(uuid, uuid) to authenticated;
revoke all on table public.investigation_findings, public.investigation_root_causes, public.investigation_corrections, public.investigation_correction_evidence from public, anon;
grant select, insert, update, delete on public.investigation_findings, public.investigation_root_causes, public.investigation_corrections, public.investigation_correction_evidence to authenticated;
alter table public.investigation_findings enable row level security;
alter table public.investigation_root_causes enable row level security;
alter table public.investigation_corrections enable row level security;
alter table public.investigation_correction_evidence enable row level security;
create policy investigation_findings_select_authorized on public.investigation_findings for select to authenticated using (public.can_view_investigation(organization_id, investigation_id));
create policy investigation_findings_manage_authorized on public.investigation_findings for all to authenticated using (public.can_manage_investigation_content(organization_id, investigation_id)) with check (public.can_manage_investigation_content(organization_id, investigation_id) and created_by = (select auth.uid()));
create policy investigation_root_causes_select_authorized on public.investigation_root_causes for select to authenticated using (public.can_view_investigation(organization_id, investigation_id));
create policy investigation_root_causes_manage_authorized on public.investigation_root_causes for all to authenticated using (public.can_manage_investigation_content(organization_id, investigation_id)) with check (public.can_manage_investigation_content(organization_id, investigation_id) and created_by = (select auth.uid()));
create policy investigation_corrections_select_authorized on public.investigation_corrections for select to authenticated using (public.can_view_investigation(organization_id, investigation_id));
create policy investigation_corrections_manage_authorized on public.investigation_corrections for all to authenticated using (public.can_manage_investigation_content(organization_id, investigation_id)) with check (public.can_manage_investigation_content(organization_id, investigation_id) and created_by = (select auth.uid()));
create policy investigation_correction_evidence_select_authorized on public.investigation_correction_evidence for select to authenticated using (exists (select 1 from public.investigation_corrections correction where correction.id = correction_id and correction.organization_id = organization_id and public.can_view_investigation(correction.organization_id, correction.investigation_id)));
create policy investigation_correction_evidence_insert_authorized on public.investigation_correction_evidence for insert to authenticated with check (uploaded_by = (select auth.uid()) and exists (select 1 from public.investigation_corrections correction where correction.id = correction_id and correction.organization_id = organization_id and public.can_manage_investigation_content(correction.organization_id, correction.investigation_id)));
create policy investigation_correction_evidence_delete_authorized on public.investigation_correction_evidence for delete to authenticated using (uploaded_by = (select auth.uid()) or exists (select 1 from public.investigation_corrections correction where correction.id = correction_id and correction.organization_id = organization_id and public.can_manage_investigation_content(correction.organization_id, correction.investigation_id)));
create policy investigation_correction_storage_select on storage.objects for select to authenticated using (bucket_id = 'incident-evidence' and public.is_org_member((storage.foldername(name))[1]::uuid));
create policy investigation_correction_storage_insert on storage.objects for insert to authenticated with check (bucket_id = 'incident-evidence' and public.is_org_member((storage.foldername(name))[1]::uuid) and (storage.foldername(name))[3]::uuid = (select auth.uid()));
create policy investigation_correction_storage_delete on storage.objects for delete to authenticated using (bucket_id = 'incident-evidence' and public.is_org_member((storage.foldername(name))[1]::uuid) and ((storage.foldername(name))[3]::uuid = (select auth.uid()) or public.has_org_role((storage.foldername(name))[1]::uuid, array['Super Administrator', 'Organization Administrator', 'QHSE Manager', 'Safety Officer / HSE Officer']::public.membership_role[])));
