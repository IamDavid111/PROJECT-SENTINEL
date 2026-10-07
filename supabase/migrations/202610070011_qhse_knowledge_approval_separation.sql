-- Phase 3 security fix: segregation of duties for knowledge approval.
-- A submitter may not approve their own version while another active approver exists in the
-- organisation. If the submitter is the only approver, self-approval is allowed so small
-- organisations are not blocked, and it is recorded explicitly in the activity log.

-- True when any other active member of the organisation could approve knowledge documents.
create function public.knowledge_has_other_approver(target_organization_id uuid, excluded_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    join public.profiles p on p.id = m.user_id and p.organization_id = m.organization_id
    where m.organization_id = target_organization_id
      and m.user_id <> excluded_user_id
      and p.account_status = 'active'
      and public.knowledge_role_has_permission(m.organization_id, m.role, 'approve_knowledge_documents')
  );
$$;
revoke all on function public.knowledge_has_other_approver(uuid, uuid) from public, anon, authenticated;

create or replace function public.transition_knowledge_version(
  target_version_id uuid, target_status text, reason text default null
)
returns public.knowledge_document_versions
language plpgsql security definer set search_path = public
as $$
declare
  version_row public.knowledge_document_versions;
  parent public.knowledge_documents;
  self_approval boolean := false;
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
  if target_status = 'approved' and version_row.approval_status = 'pending_review'
    and version_row.submitted_by = auth.uid() then
    if public.knowledge_has_other_approver(version_row.organization_id, auth.uid()) then
      raise exception 'Another approver must review this submission' using errcode = '42501';
    end if;
    self_approval := true;
  end if;
  update public.knowledge_document_versions
  set approval_status = target_status,
      rejection_reason = case when target_status = 'rejected' then trim(reason) else null end
  where id = target_version_id
  returning * into version_row;
  if self_approval then
    insert into public.activity_logs(organization_id, user_id, activity, metadata)
    values (version_row.organization_id, auth.uid(), 'QHSE knowledge self-approved (sole approver)',
      jsonb_build_object('event_code', 'knowledge_version_self_approved', 'record_id', version_row.id,
        'document_id', version_row.document_id, 'version_number', version_row.version_number));
  end if;
  return version_row;
end;
$$;
