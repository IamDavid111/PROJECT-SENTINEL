-- Keep lifecycle, tenant and upload guards; only Super Administrators may self-approve.
create or replace function public.transition_knowledge_version(
  target_version_id uuid, target_status text, reason text default null
)
returns public.knowledge_document_versions
language plpgsql security definer set search_path = public
as $$
declare
  version_row public.knowledge_document_versions;
  parent public.knowledge_documents;
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
  select * into parent from public.knowledge_documents
  where id = version_row.document_id for update;
  if parent.lifecycle_status <> 'active' then
    raise exception 'Archived documents cannot receive lifecycle decisions' using errcode = '42501';
  end if;
  select v.* into version_row from public.knowledge_document_versions v
  where v.id = target_version_id for update;
  if target_status = 'approved' and version_row.approval_status = 'pending_review'
    and version_row.submitted_by = auth.uid()
    and not exists (
      select 1 from public.memberships m
      join public.profiles p on p.id = m.user_id and p.organization_id = m.organization_id
      where m.user_id = auth.uid() and m.organization_id = version_row.organization_id
        and m.role = 'Super Administrator' and p.account_status = 'active'
    ) then
    raise exception 'Only Super Administrators may approve their own submissions' using errcode = '42501';
  end if;
  update public.knowledge_document_versions
  set approval_status = target_status,
      rejection_reason = case when target_status = 'rejected' then trim(reason) else null end
  where id = target_version_id
  returning * into version_row;
  return version_row;
end;
$$;

-- Extend the existing atomic audit event, without inventing historical submission evidence.
do $$
declare
  definition text := pg_get_functiondef('public.audit_knowledge_lifecycle()'::regprocedure);
  patched text;
begin
  patched := replace(definition, '''notification_ready'', false',
    '''decision'', new_status,
        ''submitter_id'', to_jsonb(new)->''submitted_by'',
        ''approver_id'', case when new_status = ''approved'' then to_jsonb(new)->''approved_by''
          when new_status = ''rejected'' then to_jsonb(new)->''rejected_by'' else null end,
        ''decision_at'', case when new_status = ''approved'' then to_jsonb(new)->''approved_at''
          when new_status = ''rejected'' then to_jsonb(new)->''rejected_at'' else null end,
        ''self_approval'', coalesce(new_status = ''approved''
          and (to_jsonb(new)->>''submitted_by'')::uuid = auth.uid(), false),
        ''notification_ready'', false');
  if patched = definition then raise exception 'Knowledge lifecycle audit extension did not match'; end if;
  execute patched;
end;
$$;
