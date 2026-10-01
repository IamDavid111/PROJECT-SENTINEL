create type "public"."corrective_action_priority" as enum ('low', 'medium', 'high', 'critical');

create type "public"."corrective_action_status" as enum ('open', 'assigned', 'in_progress', 'pending_verification', 'verified', 'closed', 'rejected');

drop trigger if exists "incidents_enforce_integrity" on "public"."incidents";

drop policy "investigations_insert_authorized" on "public"."investigations";


  create table "public"."corrective_action_sequences" (
    "organization_id" uuid not null,
    "next_value" bigint not null default 1,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."corrective_action_sequences" enable row level security;


  create table "public"."corrective_actions" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "reference_number" text not null,
    "incident_id" uuid not null,
    "investigation_id" uuid,
    "title" text not null,
    "description" text,
    "action_category" text,
    "priority" public.corrective_action_priority not null default 'medium'::public.corrective_action_priority,
    "status" public.corrective_action_status not null default 'open'::public.corrective_action_status,
    "assigned_owner_id" uuid,
    "assigned_by" uuid,
    "assigned_at" timestamp with time zone,
    "due_date" date,
    "completion_date" date,
    "verification_status" text,
    "verification_date" timestamp with time zone,
    "verified_by" uuid,
    "verification_notes" text,
    "created_by" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."corrective_actions" enable row level security;


  create table "public"."investigation_correction_evidence" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "correction_id" uuid not null,
    "storage_path" text not null,
    "original_filename" text not null,
    "mime_type" text not null,
    "file_size" bigint not null,
    "uploaded_by" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."investigation_correction_evidence" enable row level security;


  create table "public"."investigation_corrections" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "investigation_id" uuid not null,
    "correction_description" text not null,
    "containment_taken" text,
    "responsible_person_id" uuid,
    "completed_at" timestamp with time zone,
    "created_by" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."investigation_corrections" enable row level security;


  create table "public"."investigation_findings" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "investigation_id" uuid not null,
    "description" text not null,
    "finding_type" text,
    "significance" text,
    "evidence_reference" text,
    "created_by" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."investigation_findings" enable row level security;


  create table "public"."investigation_root_causes" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "investigation_id" uuid not null,
    "root_cause_statement" text not null,
    "contributing_factors" text,
    "cause_category" text,
    "supporting_explanation" text,
    "evidence_reference" text,
    "created_by" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."investigation_root_causes" enable row level security;

CREATE INDEX activity_logs_notification_key_idx ON public.activity_logs USING btree (((metadata ->> 'notification_key'::text)), created_at DESC) WHERE (metadata ? 'notification_key'::text);

CREATE INDEX activity_logs_workflow_event_code_idx ON public.activity_logs USING btree (((metadata ->> 'event_code'::text)), created_at DESC) WHERE (metadata ? 'event_code'::text);

CREATE UNIQUE INDEX corrective_action_sequences_pkey ON public.corrective_action_sequences USING btree (organization_id);

CREATE INDEX corrective_action_sequences_updated_at_idx ON public.corrective_action_sequences USING btree (updated_at);

CREATE UNIQUE INDEX corrective_actions_id_organization_unique ON public.corrective_actions USING btree (id, organization_id);

CREATE INDEX corrective_actions_organization_due_date_idx ON public.corrective_actions USING btree (organization_id, due_date) WHERE (due_date IS NOT NULL);

CREATE INDEX corrective_actions_organization_incident_idx ON public.corrective_actions USING btree (organization_id, incident_id);

CREATE INDEX corrective_actions_organization_investigation_idx ON public.corrective_actions USING btree (organization_id, investigation_id) WHERE (investigation_id IS NOT NULL);

CREATE INDEX corrective_actions_organization_owner_idx ON public.corrective_actions USING btree (organization_id, assigned_owner_id) WHERE (assigned_owner_id IS NOT NULL);

CREATE INDEX corrective_actions_organization_priority_idx ON public.corrective_actions USING btree (organization_id, priority);

CREATE INDEX corrective_actions_organization_status_idx ON public.corrective_actions USING btree (organization_id, status);

CREATE UNIQUE INDEX corrective_actions_pkey ON public.corrective_actions USING btree (id);

CREATE UNIQUE INDEX corrective_actions_reference_per_organization ON public.corrective_actions USING btree (organization_id, reference_number);

CREATE UNIQUE INDEX investigation_correction_evide_organization_id_storage_path_key ON public.investigation_correction_evidence USING btree (organization_id, storage_path);

CREATE UNIQUE INDEX investigation_correction_evidence_id_organization_unique ON public.investigation_correction_evidence USING btree (id, organization_id);

CREATE INDEX investigation_correction_evidence_organization_correction_idx ON public.investigation_correction_evidence USING btree (organization_id, correction_id);

CREATE UNIQUE INDEX investigation_correction_evidence_pkey ON public.investigation_correction_evidence USING btree (id);

CREATE UNIQUE INDEX investigation_corrections_id_organization_unique ON public.investigation_corrections USING btree (id, organization_id);

CREATE UNIQUE INDEX investigation_corrections_investigation_unique ON public.investigation_corrections USING btree (organization_id, investigation_id);

CREATE INDEX investigation_corrections_organization_investigation_idx ON public.investigation_corrections USING btree (organization_id, investigation_id);

CREATE UNIQUE INDEX investigation_corrections_pkey ON public.investigation_corrections USING btree (id);

CREATE UNIQUE INDEX investigation_findings_id_organization_unique ON public.investigation_findings USING btree (id, organization_id);

CREATE INDEX investigation_findings_organization_investigation_idx ON public.investigation_findings USING btree (organization_id, investigation_id);

CREATE UNIQUE INDEX investigation_findings_pkey ON public.investigation_findings USING btree (id);

CREATE UNIQUE INDEX investigation_root_causes_id_organization_unique ON public.investigation_root_causes USING btree (id, organization_id);

CREATE UNIQUE INDEX investigation_root_causes_investigation_unique ON public.investigation_root_causes USING btree (organization_id, investigation_id);

CREATE INDEX investigation_root_causes_organization_investigation_idx ON public.investigation_root_causes USING btree (organization_id, investigation_id);

CREATE UNIQUE INDEX investigation_root_causes_pkey ON public.investigation_root_causes USING btree (id);

alter table "public"."corrective_action_sequences" add constraint "corrective_action_sequences_pkey" PRIMARY KEY using index "corrective_action_sequences_pkey";

alter table "public"."corrective_actions" add constraint "corrective_actions_pkey" PRIMARY KEY using index "corrective_actions_pkey";

alter table "public"."investigation_correction_evidence" add constraint "investigation_correction_evidence_pkey" PRIMARY KEY using index "investigation_correction_evidence_pkey";

alter table "public"."investigation_corrections" add constraint "investigation_corrections_pkey" PRIMARY KEY using index "investigation_corrections_pkey";

alter table "public"."investigation_findings" add constraint "investigation_findings_pkey" PRIMARY KEY using index "investigation_findings_pkey";

alter table "public"."investigation_root_causes" add constraint "investigation_root_causes_pkey" PRIMARY KEY using index "investigation_root_causes_pkey";

alter table "public"."corrective_action_sequences" add constraint "corrective_action_sequences_next_value_check" CHECK ((next_value > 0)) not valid;

alter table "public"."corrective_action_sequences" validate constraint "corrective_action_sequences_next_value_check";

alter table "public"."corrective_action_sequences" add constraint "corrective_action_sequences_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."corrective_action_sequences" validate constraint "corrective_action_sequences_organization_id_fkey";

alter table "public"."corrective_actions" add constraint "corrective_actions_assigned_by_same_organization" FOREIGN KEY (assigned_by, organization_id) REFERENCES public.profiles(id, organization_id) ON DELETE RESTRICT not valid;

alter table "public"."corrective_actions" validate constraint "corrective_actions_assigned_by_same_organization";

alter table "public"."corrective_actions" add constraint "corrective_actions_assignment_metadata" CHECK ((((assigned_owner_id IS NULL) AND (assigned_by IS NULL) AND (assigned_at IS NULL)) OR ((assigned_owner_id IS NOT NULL) AND (assigned_by IS NOT NULL) AND (assigned_at IS NOT NULL)))) not valid;

alter table "public"."corrective_actions" validate constraint "corrective_actions_assignment_metadata";

alter table "public"."corrective_actions" add constraint "corrective_actions_completion_date_valid" CHECK (((completion_date IS NULL) OR (completion_date >= (created_at)::date))) not valid;

alter table "public"."corrective_actions" validate constraint "corrective_actions_completion_date_valid";

alter table "public"."corrective_actions" add constraint "corrective_actions_created_by_same_organization" FOREIGN KEY (created_by, organization_id) REFERENCES public.profiles(id, organization_id) ON DELETE RESTRICT not valid;

alter table "public"."corrective_actions" validate constraint "corrective_actions_created_by_same_organization";

alter table "public"."corrective_actions" add constraint "corrective_actions_due_date_valid" CHECK (((due_date IS NULL) OR (due_date >= (created_at)::date))) not valid;

alter table "public"."corrective_actions" validate constraint "corrective_actions_due_date_valid";

alter table "public"."corrective_actions" add constraint "corrective_actions_id_organization_unique" UNIQUE using index "corrective_actions_id_organization_unique";

alter table "public"."corrective_actions" add constraint "corrective_actions_incident_same_organization" FOREIGN KEY (incident_id, organization_id) REFERENCES public.incidents(id, organization_id) ON DELETE CASCADE not valid;

alter table "public"."corrective_actions" validate constraint "corrective_actions_incident_same_organization";

alter table "public"."corrective_actions" add constraint "corrective_actions_investigation_same_organization" FOREIGN KEY (investigation_id, organization_id) REFERENCES public.investigations(id, organization_id) ON DELETE SET NULL not valid;

alter table "public"."corrective_actions" validate constraint "corrective_actions_investigation_same_organization";

alter table "public"."corrective_actions" add constraint "corrective_actions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."corrective_actions" validate constraint "corrective_actions_organization_id_fkey";

alter table "public"."corrective_actions" add constraint "corrective_actions_owner_same_organization" FOREIGN KEY (assigned_owner_id, organization_id) REFERENCES public.profiles(id, organization_id) ON DELETE RESTRICT not valid;

alter table "public"."corrective_actions" validate constraint "corrective_actions_owner_same_organization";

alter table "public"."corrective_actions" add constraint "corrective_actions_reference_per_organization" UNIQUE using index "corrective_actions_reference_per_organization";

alter table "public"."corrective_actions" add constraint "corrective_actions_title_check" CHECK ((char_length(btrim(title)) >= 3)) not valid;

alter table "public"."corrective_actions" validate constraint "corrective_actions_title_check";

alter table "public"."corrective_actions" add constraint "corrective_actions_verification_metadata" CHECK ((((verification_status IS NULL) AND (verification_date IS NULL) AND (verified_by IS NULL)) OR ((verification_status IS NOT NULL) AND (verification_date IS NOT NULL) AND (verified_by IS NOT NULL)))) not valid;

alter table "public"."corrective_actions" validate constraint "corrective_actions_verification_metadata";

alter table "public"."corrective_actions" add constraint "corrective_actions_verified_by_same_organization" FOREIGN KEY (verified_by, organization_id) REFERENCES public.profiles(id, organization_id) ON DELETE RESTRICT not valid;

alter table "public"."corrective_actions" validate constraint "corrective_actions_verified_by_same_organization";

alter table "public"."investigation_correction_evidence" add constraint "investigation_correction_evide_organization_id_storage_path_key" UNIQUE using index "investigation_correction_evide_organization_id_storage_path_key";

alter table "public"."investigation_correction_evidence" add constraint "investigation_correction_evidence_correction_same_organization" FOREIGN KEY (correction_id, organization_id) REFERENCES public.investigation_corrections(id, organization_id) ON DELETE CASCADE not valid;

alter table "public"."investigation_correction_evidence" validate constraint "investigation_correction_evidence_correction_same_organization";

alter table "public"."investigation_correction_evidence" add constraint "investigation_correction_evidence_file_size_check" CHECK (((file_size > 0) AND (file_size <= 10485760))) not valid;

alter table "public"."investigation_correction_evidence" validate constraint "investigation_correction_evidence_file_size_check";

alter table "public"."investigation_correction_evidence" add constraint "investigation_correction_evidence_id_organization_unique" UNIQUE using index "investigation_correction_evidence_id_organization_unique";

alter table "public"."investigation_correction_evidence" add constraint "investigation_correction_evidence_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."investigation_correction_evidence" validate constraint "investigation_correction_evidence_organization_id_fkey";

alter table "public"."investigation_correction_evidence" add constraint "investigation_correction_evidence_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."investigation_correction_evidence" validate constraint "investigation_correction_evidence_uploaded_by_fkey";

alter table "public"."investigation_corrections" add constraint "investigation_corrections_completed_after_creation" CHECK (((completed_at IS NULL) OR ((completed_at)::date >= (created_at)::date))) not valid;

alter table "public"."investigation_corrections" validate constraint "investigation_corrections_completed_after_creation";

alter table "public"."investigation_corrections" add constraint "investigation_corrections_correction_description_check" CHECK ((char_length(btrim(correction_description)) >= 3)) not valid;

alter table "public"."investigation_corrections" validate constraint "investigation_corrections_correction_description_check";

alter table "public"."investigation_corrections" add constraint "investigation_corrections_created_by_same_organization" FOREIGN KEY (created_by, organization_id) REFERENCES public.profiles(id, organization_id) ON DELETE RESTRICT not valid;

alter table "public"."investigation_corrections" validate constraint "investigation_corrections_created_by_same_organization";

alter table "public"."investigation_corrections" add constraint "investigation_corrections_id_organization_unique" UNIQUE using index "investigation_corrections_id_organization_unique";

alter table "public"."investigation_corrections" add constraint "investigation_corrections_investigation_same_organization" FOREIGN KEY (investigation_id, organization_id) REFERENCES public.investigations(id, organization_id) ON DELETE CASCADE not valid;

alter table "public"."investigation_corrections" validate constraint "investigation_corrections_investigation_same_organization";

alter table "public"."investigation_corrections" add constraint "investigation_corrections_investigation_unique" UNIQUE using index "investigation_corrections_investigation_unique";

alter table "public"."investigation_corrections" add constraint "investigation_corrections_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."investigation_corrections" validate constraint "investigation_corrections_organization_id_fkey";

alter table "public"."investigation_corrections" add constraint "investigation_corrections_responsible_same_organization" FOREIGN KEY (responsible_person_id, organization_id) REFERENCES public.profiles(id, organization_id) ON DELETE RESTRICT not valid;

alter table "public"."investigation_corrections" validate constraint "investigation_corrections_responsible_same_organization";

alter table "public"."investigation_findings" add constraint "investigation_findings_created_by_same_organization" FOREIGN KEY (created_by, organization_id) REFERENCES public.profiles(id, organization_id) ON DELETE RESTRICT not valid;

alter table "public"."investigation_findings" validate constraint "investigation_findings_created_by_same_organization";

alter table "public"."investigation_findings" add constraint "investigation_findings_description_check" CHECK ((char_length(btrim(description)) >= 3)) not valid;

alter table "public"."investigation_findings" validate constraint "investigation_findings_description_check";

alter table "public"."investigation_findings" add constraint "investigation_findings_id_organization_unique" UNIQUE using index "investigation_findings_id_organization_unique";

alter table "public"."investigation_findings" add constraint "investigation_findings_investigation_same_organization" FOREIGN KEY (investigation_id, organization_id) REFERENCES public.investigations(id, organization_id) ON DELETE CASCADE not valid;

alter table "public"."investigation_findings" validate constraint "investigation_findings_investigation_same_organization";

alter table "public"."investigation_findings" add constraint "investigation_findings_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."investigation_findings" validate constraint "investigation_findings_organization_id_fkey";

alter table "public"."investigation_root_causes" add constraint "investigation_root_causes_created_by_same_organization" FOREIGN KEY (created_by, organization_id) REFERENCES public.profiles(id, organization_id) ON DELETE RESTRICT not valid;

alter table "public"."investigation_root_causes" validate constraint "investigation_root_causes_created_by_same_organization";

alter table "public"."investigation_root_causes" add constraint "investigation_root_causes_id_organization_unique" UNIQUE using index "investigation_root_causes_id_organization_unique";

alter table "public"."investigation_root_causes" add constraint "investigation_root_causes_investigation_same_organization" FOREIGN KEY (investigation_id, organization_id) REFERENCES public.investigations(id, organization_id) ON DELETE CASCADE not valid;

alter table "public"."investigation_root_causes" validate constraint "investigation_root_causes_investigation_same_organization";

alter table "public"."investigation_root_causes" add constraint "investigation_root_causes_investigation_unique" UNIQUE using index "investigation_root_causes_investigation_unique";

alter table "public"."investigation_root_causes" add constraint "investigation_root_causes_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."investigation_root_causes" validate constraint "investigation_root_causes_organization_id_fkey";

alter table "public"."investigation_root_causes" add constraint "investigation_root_causes_root_cause_statement_check" CHECK ((char_length(btrim(root_cause_statement)) >= 3)) not valid;

alter table "public"."investigation_root_causes" validate constraint "investigation_root_causes_root_cause_statement_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.assign_corrective_action_reference()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.reference_number is null or btrim(new.reference_number) = '' then
    new.reference_number := public.next_corrective_action_reference(new.organization_id);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.can_create_corrective_action(target_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_org_role(target_organization_id, array[
    'Super Administrator', 'Organization Administrator', 'QHSE Manager',
    'Site Supervisor', 'Safety Officer / HSE Officer'
  ]::public.membership_role[]);
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_corrective_action(target_organization_id uuid, target_action_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.corrective_actions action
    where action.id = target_action_id
      and action.organization_id = target_organization_id
      and public.is_org_member(target_organization_id)
      and (
        public.has_org_role(target_organization_id, array[
          'Super Administrator', 'Organization Administrator', 'QHSE Manager',
          'Site Supervisor', 'Safety Officer / HSE Officer'
        ]::public.membership_role[])
        or action.assigned_owner_id = (select auth.uid())
        or action.created_by = (select auth.uid())
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_investigation_content(target_organization_id uuid, target_investigation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.can_manage_investigation(target_organization_id, target_investigation_id);
$function$
;

CREATE OR REPLACE FUNCTION public.can_verify_corrective_action(target_organization_id uuid, target_action_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.corrective_actions action
    where action.id = target_action_id
      and action.organization_id = target_organization_id
      and public.is_org_member(target_organization_id)
      and public.has_org_role(target_organization_id, array[
        'Super Administrator', 'Organization Administrator', 'QHSE Manager',
        'Site Supervisor', 'Safety Officer / HSE Officer'
      ]::public.membership_role[])
      and action.assigned_owner_id is distinct from (select auth.uid())
  );
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_corrective_action(target_organization_id uuid, target_action_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.corrective_actions action
    where action.id = target_action_id
      and action.organization_id = target_organization_id
      and public.is_org_member(target_organization_id)
      and (
        public.has_org_role(target_organization_id, array[
          'Super Administrator', 'Organization Administrator', 'QHSE Manager',
          'Site Supervisor', 'Safety Officer / HSE Officer', 'Auditor',
          'Executive / Management'
        ]::public.membership_role[])
        or action.assigned_owner_id = (select auth.uid())
        or action.created_by = (select auth.uid())
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.close_incident(target_incident_id uuid)
 RETURNS public.incidents
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare incident_row public.incidents; investigation_row public.investigations; unresolved integer; closed_incident public.incidents; actor uuid := (select auth.uid());
begin
 select * into incident_row from public.incidents where id=target_incident_id for update;
 if incident_row.id is null then raise exception 'Incident not found'; end if;
 if not public.has_org_role(incident_row.organization_id,array['Super Administrator','Organization Administrator','QHSE Manager','Site Supervisor']::public.membership_role[]) then raise exception 'You are not authorized to close this incident'; end if;
 select * into investigation_row from public.investigations where incident_id=target_incident_id and organization_id=incident_row.organization_id;
 if investigation_row.id is null or investigation_row.status <> 'completed' then raise exception 'Investigation must be completed before closure'; end if;
 if not exists(select 1 from public.investigation_root_causes where investigation_id=investigation_row.id and organization_id=incident_row.organization_id) then raise exception 'Root cause is required before closure'; end if;
 select count(*) into unresolved from public.corrective_actions where incident_id=target_incident_id and organization_id=incident_row.organization_id and status not in ('verified','closed');
 if unresolved > 0 then raise exception 'All corrective actions must be verified before closure'; end if;
 update public.incidents set status='pending_verification' where id=target_incident_id;
 update public.incidents set status='closed' where id=target_incident_id returning * into closed_incident;
 insert into public.activity_logs(organization_id,user_id,activity,metadata) values(incident_row.organization_id,actor,'Incident closed',jsonb_build_object('event_code','incident_closed','incident_id',target_incident_id,'notification_key','incident_closed','notification_ready',true));
 return closed_incident;
end; $function$
;

CREATE OR REPLACE FUNCTION public.create_corrective_action(target_incident_id uuid, target_investigation_id uuid, action_title text, action_description text, action_category text, action_priority public.corrective_action_priority, target_owner_id uuid, target_due_date date)
 RETURNS public.corrective_actions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    declare context_user uuid := (select auth.uid()); incident_row public.incidents; created_action public.corrective_actions;
    begin
      select * into incident_row from public.incidents where id=target_incident_id for update;
      if incident_row.id is null or not public.can_create_corrective_action(incident_row.organization_id) then raise exception 'You are not authorized to create this corrective action'; end if;
      if target_investigation_id is not null and not exists (select 1 from public.investigations where id=target_investigation_id and organization_id=incident_row.organization_id and incident_id=target_incident_id) then raise exception 'Investigation does not belong to this incident'; end if;
      if target_owner_id is not null and not exists (select 1 from public.profiles where id=target_owner_id and organization_id=incident_row.organization_id) then raise exception 'Action owner must belong to the incident organization'; end if;
      if target_due_date is not null and target_due_date < current_date then raise exception 'Due date cannot be in the past'; end if;
      insert into public.corrective_actions (organization_id, incident_id, investigation_id, title, description, action_category, priority, status, assigned_owner_id, assigned_by, assigned_at, due_date, created_by) values (incident_row.organization_id, target_incident_id, target_investigation_id, action_title, action_description, action_category, action_priority, (case when target_owner_id is null then 'open' else 'assigned' end)::public.corrective_action_status, target_owner_id, case when target_owner_id is null then null else context_user end, case when target_owner_id is null then null else now() end, target_due_date, context_user) returning * into created_action;
      insert into public.activity_logs(organization_id,user_id,activity,metadata) values(incident_row.organization_id,context_user,'Corrective action created',jsonb_build_object('event_code','corrective_action_created','corrective_action_id',created_action.id,'incident_id',target_incident_id,'notification_ready',false));
      return created_action;
    end;
    $function$
;

CREATE OR REPLACE FUNCTION public.create_investigation(target_incident_id uuid, target_investigator_id uuid, target_lead_id uuid DEFAULT NULL::uuid, target_completion_date date DEFAULT NULL::date)
 RETURNS public.investigations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  incident_record public.incidents;
  created_investigation public.investigations;
  current_user_id uuid := (select auth.uid());
begin
  select * into incident_record
  from public.incidents
  where id = target_incident_id
  for update;

  if incident_record.id is null then
    raise exception 'Incident not found';
  end if;
  if not public.can_assign_investigation(incident_record.organization_id) then
    raise exception 'You are not authorized to assign an investigation';
  end if;
  if target_investigator_id is null then
    raise exception 'An investigator is required';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = target_investigator_id
      and organization_id = incident_record.organization_id
  ) then
    raise exception 'Investigator must belong to the incident organization';
  end if;
  if target_lead_id is not null and not exists (
    select 1 from public.profiles
    where id = target_lead_id
      and organization_id = incident_record.organization_id
  ) then
    raise exception 'Investigation lead must belong to the incident organization';
  end if;
  if incident_record.status not in ('submitted', 'under_review') then
    raise exception 'Incident is not ready for investigation';
  end if;

  if incident_record.status = 'submitted' then
    update public.incidents set status = 'under_review' where id = incident_record.id;
  end if;

  insert into public.investigations (
    organization_id,
    incident_id,
    status,
    assigned_investigator_id,
    investigation_lead_id,
    assigned_by,
    assigned_at,
    target_completion_date,
    created_by
  ) values (
    incident_record.organization_id,
    incident_record.id,
    'assigned',
    target_investigator_id,
    target_lead_id,
    current_user_id,
    now(),
    target_completion_date,
    current_user_id
  ) returning * into created_investigation;

  update public.incidents set status = 'investigation' where id = incident_record.id;
  return created_investigation;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_corrective_action_parent_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.investigation_id is not null and not exists (
    select 1
    from public.investigations investigation
    where investigation.id = new.investigation_id
      and investigation.organization_id = new.organization_id
      and investigation.incident_id = new.incident_id
  ) then
    raise exception 'Corrective action investigation must belong to the same incident';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_corrective_action_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.organization_id <> old.organization_id or new.incident_id <> old.incident_id then raise exception 'Corrective action ownership cannot be changed'; end if;
  if new.status = 'pending_verification' and old.status <> 'pending_verification' and new.completion_date is null then raise exception 'Completion date is required before verification'; end if;
  if old.status = 'pending_verification' and new.status not in ('pending_verification', 'verified', 'in_progress') then raise exception 'Pending verification may only be approved or returned for rework'; end if;
  if new.status = 'verified' then
    if new.verified_by is null or new.verification_date is null or new.verification_status <> 'approved' then raise exception 'Approved verification metadata is required'; end if;
    if new.verified_by = new.assigned_owner_id then raise exception 'Action owner cannot verify their own action'; end if;
  end if;
  if new.verification_status = 'rejected' and char_length(btrim(coalesce(new.verification_notes, ''))) < 3 then raise exception 'Rejection notes are required'; end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_incident_workflow_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.organization_id <> old.organization_id then
    raise exception 'Incident organization cannot be changed';
  end if;

  if new.status = old.status then
    return new;
  end if;

  if not public.has_org_role(old.organization_id, array[
    'Super Administrator',
    'Organization Administrator',
    'QHSE Manager',
    'Site Supervisor',
    'Safety Officer / HSE Officer'
  ]::public.membership_role[]) then
    if not (old.status = 'draft' and new.status = 'submitted' and old.created_by = (select auth.uid())) then
      raise exception 'You are not authorized to change this incident status';
    end if;
  end if;

  if not (
    (old.status = 'submitted' and new.status = 'under_review')
    or (old.status = 'under_review' and new.status = 'investigation')
    or (old.status = 'investigation' and new.status = 'corrective_action')
    or (old.status = 'corrective_action' and new.status = 'pending_verification')
    or (old.status = 'pending_verification' and new.status = 'closed')
    or (old.status = 'draft' and new.status = 'submitted')
  ) then
    raise exception 'Invalid incident workflow transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_investigation_workflow()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.organization_id <> old.organization_id
    or new.incident_id <> old.incident_id
    or new.created_by <> old.created_by then
    raise exception 'Investigation ownership cannot be changed';
  end if;

  if new.assigned_investigator_id is distinct from old.assigned_investigator_id
    or new.investigation_lead_id is distinct from old.investigation_lead_id
    or new.assigned_by is distinct from old.assigned_by
    or new.assigned_at is distinct from old.assigned_at then
    if not public.can_assign_investigation(old.organization_id) then
      raise exception 'You are not authorized to assign this investigation';
    end if;
    if new.assigned_by <> (select auth.uid()) then
      raise exception 'Assignment actor must be the authenticated user';
    end if;
  end if;

  if new.status <> old.status then
    if not (
      (old.status = 'assigned' and new.status = 'in_progress')
      or (old.status = 'in_progress' and new.status = 'pending_review')
      or (old.status = 'pending_review' and new.status = 'completed')
    ) then
      raise exception 'Invalid investigation workflow transition from % to %', old.status, new.status;
    end if;
    if not public.can_manage_investigation(old.organization_id, old.id) then
      raise exception 'You are not authorized to change this investigation status';
    end if;
  end if;

  if new.status = 'in_progress' and new.started_at is null then
    new.started_at = now();
  end if;
  if new.status = 'completed' and new.completed_at is null then
    new.completed_at = now();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_organization_invitations()
 RETURNS TABLE(id uuid, invitee_email text, department text, role text, status text, invited_user_id uuid, inviter_id uuid, invited_by_name text, created_at timestamp with time zone, expires_at timestamp with time zone, accepted_at timestamp with time zone, revoked_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  caller_organization_id uuid;
  caller_is_admin boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select p.organization_id into caller_organization_id
  from public.profiles p
  where p.id = current_user_id
    and p.account_status = 'active';

  if caller_organization_id is null then
    raise exception 'Your account is not active in an organization';
  end if;

  select public.is_org_admin_for_role_management(caller_organization_id) into caller_is_admin;
  if not caller_is_admin then
    raise exception 'Only organization administrators can view invitations';
  end if;

  return query
  select
    ai.id,
    ai.invitee_email,
    ai.department,
    ai.role,
    ai.status,
    ai.invited_user_id,
    ai.inviter_id,
    nullif(btrim(coalesce(inviter.full_name, '')), ''),
    ai.created_at,
    ai.expires_at,
    ai.accepted_at,
    ai.revoked_at
  from public.admin_invitations ai
  left join public.profiles inviter
    on inviter.id = ai.inviter_id
  where ai.organization_id = caller_organization_id
  order by ai.created_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.next_corrective_action_reference(target_organization_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  allocated_value bigint;
begin
  insert into public.corrective_action_sequences (organization_id, next_value)
  values (target_organization_id, 2)
  on conflict (organization_id) do nothing;

  update public.corrective_action_sequences
  set next_value = next_value + 1
  where organization_id = target_organization_id
  returning next_value - 1 into allocated_value;

  return format('CA-%s-%s', to_char(current_date, 'YYYY'), lpad(allocated_value::text, 6, '0'));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_workflow_activity_event()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  normalized_code text;
  normalized_notification text;
begin
  normalized_code := case
    when new.activity = 'Investigation created' then 'investigation_created'
    when new.activity = 'Investigator assigned' then 'investigator_assigned'
    when new.activity = 'Investigation started' or new.activity ilike 'Investigation status changed to in_progress%' then 'investigation_started'
    when new.activity = 'Investigation completed' or new.activity ilike 'Investigation status changed to completed%' then 'investigation_completed'
    when new.activity = 'Finding added' then 'finding_added'
    when new.activity = 'Finding updated' then 'finding_updated'
    when new.activity = 'Root cause updated' then 'root_cause_updated'
    when new.activity = 'Immediate correction recorded' then 'immediate_correction_recorded'
    when new.activity = 'Corrective action created' then 'corrective_action_created'
    when new.activity = 'Corrective action assigned' then 'corrective_action_assigned'
    when new.activity ilike 'Corrective action status changed%' then 'corrective_action_status_changed'
    when new.activity = 'Corrective action completed' then 'corrective_action_completed'
    when new.activity = 'Corrective action verification requested' then 'verification_requested'
    when new.activity = 'Corrective action verification approved' then 'verification_approved'
    when new.activity = 'Corrective action verification rejected' then 'verification_rejected'
    when new.activity = 'Incident closed' then 'incident_closed'
    else null
  end;
  normalized_notification := case normalized_code
    when 'investigator_assigned' then 'investigation_assigned'
    when 'corrective_action_assigned' then 'corrective_action_assigned'
    when 'verification_requested' then 'verification_requested'
    when 'verification_rejected' then 'verification_rejected'
    when 'incident_closed' then 'incident_closed'
    else null
  end;
  if normalized_code is not null then
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object('event_code', normalized_code, 'notification_key', normalized_notification, 'notification_ready', normalized_notification is not null);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_investigation_activity(target_organization_id uuid, target_investigation_id uuid, activity_name text, activity_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_view_investigation(target_organization_id, target_investigation_id) then
    raise exception 'You are not authorized to record investigation activity';
  end if;
  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  values (
    target_organization_id,
    (select auth.uid()),
    activity_name,
    activity_metadata || jsonb_build_object('investigation_id', target_investigation_id)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_workflow_event(target_organization_id uuid, event_code text, event_label text, entity_type text, entity_id uuid, incident_id uuid DEFAULT NULL::uuid, event_metadata jsonb DEFAULT '{}'::jsonb, notification_key text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_org_member(target_organization_id) then
    raise exception 'Organization membership is required';
  end if;
  if event_code is null or btrim(event_code) = '' then
    raise exception 'Workflow event code is required';
  end if;
  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  values (
    target_organization_id,
    (select auth.uid()),
    event_label,
    coalesce(event_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'event_code', event_code,
        'entity_type', entity_type,
        'entity_id', entity_id,
        'incident_id', incident_id,
        'notification_key', notification_key,
        'notification_ready', notification_key is not null
      )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_corrective_action_for_verification(target_action_id uuid)
 RETURNS public.corrective_actions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  action_record public.corrective_actions;
begin
  select * into action_record from public.corrective_actions where id = target_action_id for update;
  if action_record.id is null then raise exception 'Corrective action not found'; end if;
  if not public.can_manage_corrective_action(action_record.organization_id, action_record.id) then raise exception 'You are not authorized to complete this corrective action'; end if;
  if action_record.assigned_owner_id is distinct from (select auth.uid()) and not public.has_org_role(action_record.organization_id, array['Super Administrator', 'Organization Administrator', 'QHSE Manager', 'Site Supervisor', 'Safety Officer / HSE Officer']::public.membership_role[]) then raise exception 'Only the action owner or an authorized manager can submit completion'; end if;
  if action_record.status not in ('assigned', 'in_progress', 'rejected') then raise exception 'Corrective action is not ready for verification'; end if;
  update public.corrective_actions set status = 'pending_verification', completion_date = current_date where id = action_record.id;
  insert into public.activity_logs (organization_id, user_id, activity, metadata) values (action_record.organization_id, (select auth.uid()), 'Corrective action verification requested', jsonb_build_object('corrective_action_id', action_record.id, 'incident_id', action_record.incident_id));
  return (select action from public.corrective_actions action where action.id = action_record.id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transition_incident_status(target_incident_id uuid, target_status public.incident_status)
 RETURNS public.incidents
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  current_incident public.incidents;
begin
  select * into current_incident
  from public.incidents
  where id = target_incident_id
  for update;

  if current_incident.id is null then
    raise exception 'Incident not found';
  end if;

  update public.incidents
  set status = target_status
  where id = target_incident_id;

  return (select incident from public.incidents incident where incident.id = target_incident_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_corrective_action_status(target_action_id uuid, target_status public.corrective_action_status)
 RETURNS public.corrective_actions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare action_row public.corrective_actions; next_action public.corrective_actions; actor uuid := (select auth.uid());
begin
 select * into action_row from public.corrective_actions where id=target_action_id for update;
 if action_row.id is null or not public.can_manage_corrective_action(action_row.organization_id, action_row.id) then raise exception 'You are not authorized to update this corrective action'; end if;
 if not ((action_row.status='open' and target_status='assigned') or (action_row.status in ('assigned','rejected') and target_status='in_progress') or (action_row.status='in_progress' and target_status='pending_verification') or (action_row.status='pending_verification' and target_status in ('verified','in_progress')) or (action_row.status='verified' and target_status='closed')) then raise exception 'Invalid corrective action transition from % to %', action_row.status, target_status; end if;
 update public.corrective_actions set status=target_status, completion_date=case when target_status='pending_verification' then current_date else completion_date end where id=target_action_id returning * into next_action;
 insert into public.activity_logs(organization_id,user_id,activity,metadata) values(action_row.organization_id,actor,'Corrective action status changed',jsonb_build_object('event_code','corrective_action_status_changed','corrective_action_id',target_action_id,'incident_id',action_row.incident_id,'from_status',action_row.status,'to_status',target_status));
 return next_action;
end; $function$
;

CREATE OR REPLACE FUNCTION public.verify_corrective_action(target_action_id uuid, approved boolean, notes text)
 RETURNS public.corrective_actions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  action_record public.corrective_actions;
  next_status public.corrective_action_status;
  current_user_id uuid := (select auth.uid());
begin
  select * into action_record from public.corrective_actions where id = target_action_id for update;
  if action_record.id is null then raise exception 'Corrective action not found'; end if;
  if not public.can_verify_corrective_action(action_record.organization_id, action_record.id) then raise exception 'You are not authorized to verify this corrective action'; end if;
  if action_record.status <> 'pending_verification' then raise exception 'Corrective action is not pending verification'; end if;
  if not approved and char_length(btrim(coalesce(notes, ''))) < 3 then raise exception 'Rejection notes are required'; end if;

  next_status := case when approved then 'verified'::public.corrective_action_status else 'in_progress'::public.corrective_action_status end;
  update public.corrective_actions
  set status = next_status,
      verification_status = case when approved then 'approved' else 'rejected' end,
      verification_date = now(),
      verified_by = current_user_id,
      verification_notes = nullif(btrim(notes), '')
  where id = action_record.id;

  insert into public.activity_logs (organization_id, user_id, activity, metadata)
  values (action_record.organization_id, current_user_id, case when approved then 'Corrective action verification approved' else 'Corrective action verification rejected' end, jsonb_build_object('corrective_action_id', action_record.id, 'incident_id', action_record.incident_id, 'verification_status', case when approved then 'approved' else 'rejected' end, 'notes', nullif(btrim(notes), '')));
  return (select action from public.corrective_actions action where action.id = action_record.id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.company_setting_has_active_name(setting_value jsonb, target_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when setting_value is null then true
    when jsonb_typeof(setting_value) <> 'array' then true
    when jsonb_array_length(setting_value) = 0 then true
    else exists (
      select 1
      from jsonb_array_elements(setting_value) as item
      where lower(btrim(coalesce(
        case when jsonb_typeof(item) = 'string' then item #>> '{}' else item->>'name' end,
        ''
      ))) = lower(btrim(target_name))
        and coalesce(item->>'active', 'true') <> 'false'
    )
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_org_role(target_organization_id uuid, allowed_roles public.membership_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.memberships
    where user_id = (select auth.uid())
      and organization_id = target_organization_id
      and role = any(
        select allowed::text from unnest(allowed_roles) as allowed
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_org_admin_for_role_management(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and organization_id = p_organization_id
      and role = any(array['Super Administrator', 'Organization Administrator']::text[])
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_org_member(target_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.memberships m
    join public.profiles p
      on p.id = m.user_id
     and p.organization_id = m.organization_id
    where m.user_id = (select auth.uid())
      and m.organization_id = target_organization_id
      and p.account_status is not null
      and p.account_status <> 'pending'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.validate_incident_company_configuration()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  configured_settings public.company_settings;
  configured_site_name text;
  allow_unchanged_draft_value boolean := false;
  previous_site_id uuid;
  previous_department text;
  previous_shift text;
  previous_severity text;
  previous_potential_severity text;
  previous_incident_category text;
begin
  if tg_op = 'UPDATE' then
    allow_unchanged_draft_value := old.status = 'draft' and new.status = 'draft';
    previous_site_id := old.site_id;
    previous_department := old.department;
    previous_shift := old.shift;
    previous_severity := old.severity;
    previous_potential_severity := old.potential_severity;
    previous_incident_category := old.incident_category;
  end if;

  select * into configured_settings
  from public.company_settings
  where organization_id = new.organization_id;

  if new.status = 'submitted' then
    if nullif(btrim(new.site_id::text), '') is null
      or nullif(btrim(new.severity), '') is null
      or nullif(btrim(new.incident_category), '') is null then
      raise exception 'Submitted incidents require a configured site, severity, and incident category.';
    end if;
  end if;

  if new.site_id is not null then
    select name into configured_site_name
    from public.sites
    where id = new.site_id
      and organization_id = new.organization_id;

    if configured_site_name is null
      or (
        not public.company_setting_has_active_name(configured_settings.operational_sites, configured_site_name)
        and not (allow_unchanged_draft_value and new.site_id is not distinct from previous_site_id)
      ) then
      raise exception 'The selected site is not active for this organization.';
    end if;
  end if;

  if nullif(btrim(new.department), '') is not null
    and not public.company_setting_has_active_name(configured_settings.departments, new.department)
    and not (allow_unchanged_draft_value and new.department is not distinct from previous_department) then
    raise exception 'The selected department is not active for this organization.';
  end if;

  if nullif(btrim(new.shift), '') is not null
    and not public.company_setting_has_active_name(configured_settings.working_hours->'shifts', new.shift)
    and not (allow_unchanged_draft_value and new.shift is not distinct from previous_shift) then
    raise exception 'The selected shift is not active for this organization.';
  end if;

  if nullif(btrim(new.severity), '') is not null
    and not public.company_setting_has_active_name(configured_settings.severity_levels, new.severity)
    and not (allow_unchanged_draft_value and new.severity is not distinct from previous_severity) then
    raise exception 'The selected severity is not active for this organization.';
  end if;

  if nullif(btrim(new.potential_severity), '') is not null
    and not public.company_setting_has_active_name(configured_settings.severity_levels, new.potential_severity)
    and not (allow_unchanged_draft_value and new.potential_severity is not distinct from previous_potential_severity) then
    raise exception 'The selected potential severity is not active for this organization.';
  end if;

  if nullif(btrim(new.incident_category), '') is not null
    and not public.company_setting_has_active_name(configured_settings.incident_categories, new.incident_category)
    and not (allow_unchanged_draft_value and new.incident_category is not distinct from previous_incident_category) then
    raise exception 'The selected incident category is not active for this organization.';
  end if;

  return new;
end;
$function$
;

grant delete on table "public"."corrective_action_sequences" to "anon";

grant insert on table "public"."corrective_action_sequences" to "anon";

grant references on table "public"."corrective_action_sequences" to "anon";

grant select on table "public"."corrective_action_sequences" to "anon";

grant trigger on table "public"."corrective_action_sequences" to "anon";

grant truncate on table "public"."corrective_action_sequences" to "anon";

grant update on table "public"."corrective_action_sequences" to "anon";

grant delete on table "public"."corrective_action_sequences" to "authenticated";

grant insert on table "public"."corrective_action_sequences" to "authenticated";

grant references on table "public"."corrective_action_sequences" to "authenticated";

grant select on table "public"."corrective_action_sequences" to "authenticated";

grant trigger on table "public"."corrective_action_sequences" to "authenticated";

grant truncate on table "public"."corrective_action_sequences" to "authenticated";

grant update on table "public"."corrective_action_sequences" to "authenticated";

grant delete on table "public"."corrective_action_sequences" to "service_role";

grant insert on table "public"."corrective_action_sequences" to "service_role";

grant references on table "public"."corrective_action_sequences" to "service_role";

grant select on table "public"."corrective_action_sequences" to "service_role";

grant trigger on table "public"."corrective_action_sequences" to "service_role";

grant truncate on table "public"."corrective_action_sequences" to "service_role";

grant update on table "public"."corrective_action_sequences" to "service_role";

grant delete on table "public"."corrective_actions" to "anon";

grant insert on table "public"."corrective_actions" to "anon";

grant references on table "public"."corrective_actions" to "anon";

grant select on table "public"."corrective_actions" to "anon";

grant trigger on table "public"."corrective_actions" to "anon";

grant truncate on table "public"."corrective_actions" to "anon";

grant update on table "public"."corrective_actions" to "anon";

grant delete on table "public"."corrective_actions" to "authenticated";

grant insert on table "public"."corrective_actions" to "authenticated";

grant references on table "public"."corrective_actions" to "authenticated";

grant select on table "public"."corrective_actions" to "authenticated";

grant trigger on table "public"."corrective_actions" to "authenticated";

grant truncate on table "public"."corrective_actions" to "authenticated";

grant update on table "public"."corrective_actions" to "authenticated";

grant delete on table "public"."corrective_actions" to "service_role";

grant insert on table "public"."corrective_actions" to "service_role";

grant references on table "public"."corrective_actions" to "service_role";

grant select on table "public"."corrective_actions" to "service_role";

grant trigger on table "public"."corrective_actions" to "service_role";

grant truncate on table "public"."corrective_actions" to "service_role";

grant update on table "public"."corrective_actions" to "service_role";

grant delete on table "public"."investigation_correction_evidence" to "authenticated";

grant insert on table "public"."investigation_correction_evidence" to "authenticated";

grant references on table "public"."investigation_correction_evidence" to "authenticated";

grant select on table "public"."investigation_correction_evidence" to "authenticated";

grant trigger on table "public"."investigation_correction_evidence" to "authenticated";

grant truncate on table "public"."investigation_correction_evidence" to "authenticated";

grant update on table "public"."investigation_correction_evidence" to "authenticated";

grant delete on table "public"."investigation_correction_evidence" to "service_role";

grant insert on table "public"."investigation_correction_evidence" to "service_role";

grant references on table "public"."investigation_correction_evidence" to "service_role";

grant select on table "public"."investigation_correction_evidence" to "service_role";

grant trigger on table "public"."investigation_correction_evidence" to "service_role";

grant truncate on table "public"."investigation_correction_evidence" to "service_role";

grant update on table "public"."investigation_correction_evidence" to "service_role";

grant delete on table "public"."investigation_corrections" to "authenticated";

grant insert on table "public"."investigation_corrections" to "authenticated";

grant references on table "public"."investigation_corrections" to "authenticated";

grant select on table "public"."investigation_corrections" to "authenticated";

grant trigger on table "public"."investigation_corrections" to "authenticated";

grant truncate on table "public"."investigation_corrections" to "authenticated";

grant update on table "public"."investigation_corrections" to "authenticated";

grant delete on table "public"."investigation_corrections" to "service_role";

grant insert on table "public"."investigation_corrections" to "service_role";

grant references on table "public"."investigation_corrections" to "service_role";

grant select on table "public"."investigation_corrections" to "service_role";

grant trigger on table "public"."investigation_corrections" to "service_role";

grant truncate on table "public"."investigation_corrections" to "service_role";

grant update on table "public"."investigation_corrections" to "service_role";

grant delete on table "public"."investigation_findings" to "authenticated";

grant insert on table "public"."investigation_findings" to "authenticated";

grant references on table "public"."investigation_findings" to "authenticated";

grant select on table "public"."investigation_findings" to "authenticated";

grant trigger on table "public"."investigation_findings" to "authenticated";

grant truncate on table "public"."investigation_findings" to "authenticated";

grant update on table "public"."investigation_findings" to "authenticated";

grant delete on table "public"."investigation_findings" to "service_role";

grant insert on table "public"."investigation_findings" to "service_role";

grant references on table "public"."investigation_findings" to "service_role";

grant select on table "public"."investigation_findings" to "service_role";

grant trigger on table "public"."investigation_findings" to "service_role";

grant truncate on table "public"."investigation_findings" to "service_role";

grant update on table "public"."investigation_findings" to "service_role";

grant delete on table "public"."investigation_root_causes" to "authenticated";

grant insert on table "public"."investigation_root_causes" to "authenticated";

grant references on table "public"."investigation_root_causes" to "authenticated";

grant select on table "public"."investigation_root_causes" to "authenticated";

grant trigger on table "public"."investigation_root_causes" to "authenticated";

grant truncate on table "public"."investigation_root_causes" to "authenticated";

grant update on table "public"."investigation_root_causes" to "authenticated";

grant delete on table "public"."investigation_root_causes" to "service_role";

grant insert on table "public"."investigation_root_causes" to "service_role";

grant references on table "public"."investigation_root_causes" to "service_role";

grant select on table "public"."investigation_root_causes" to "service_role";

grant trigger on table "public"."investigation_root_causes" to "service_role";

grant truncate on table "public"."investigation_root_causes" to "service_role";

grant update on table "public"."investigation_root_causes" to "service_role";


  create policy "corrective_action_sequences_no_direct_access"
  on "public"."corrective_action_sequences"
  as permissive
  for all
  to authenticated
using (false)
with check (false);



  create policy "corrective_actions_delete_authorized"
  on "public"."corrective_actions"
  as permissive
  for delete
  to authenticated
using ((public.has_org_role(organization_id, ARRAY['Super Administrator'::public.membership_role, 'Organization Administrator'::public.membership_role]) AND (status = 'open'::public.corrective_action_status)));



  create policy "corrective_actions_insert_authorized"
  on "public"."corrective_actions"
  as permissive
  for insert
  to authenticated
with check ((public.can_create_corrective_action(organization_id) AND public.is_org_member(organization_id) AND (created_by = ( SELECT auth.uid() AS uid)) AND ((assigned_by IS NULL) OR (assigned_by = ( SELECT auth.uid() AS uid)))));



  create policy "corrective_actions_select_authorized"
  on "public"."corrective_actions"
  as permissive
  for select
  to authenticated
using (public.can_view_corrective_action(organization_id, id));



  create policy "corrective_actions_update_authorized"
  on "public"."corrective_actions"
  as permissive
  for update
  to authenticated
using (public.can_manage_corrective_action(organization_id, id))
with check ((public.is_org_member(organization_id) AND ((assigned_by IS NULL) OR (assigned_by = ( SELECT auth.uid() AS uid)) OR public.has_org_role(organization_id, ARRAY['Super Administrator'::public.membership_role, 'Organization Administrator'::public.membership_role, 'QHSE Manager'::public.membership_role]))));



  create policy "investigation_correction_evidence_delete_authorized"
  on "public"."investigation_correction_evidence"
  as permissive
  for delete
  to authenticated
using (((uploaded_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.investigation_corrections correction
  WHERE ((correction.id = investigation_correction_evidence.correction_id) AND (correction.organization_id = correction.organization_id) AND public.can_manage_investigation_content(correction.organization_id, correction.investigation_id))))));



  create policy "investigation_correction_evidence_insert_authorized"
  on "public"."investigation_correction_evidence"
  as permissive
  for insert
  to authenticated
with check (((uploaded_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.investigation_corrections correction
  WHERE ((correction.id = investigation_correction_evidence.correction_id) AND (correction.organization_id = correction.organization_id) AND public.can_manage_investigation_content(correction.organization_id, correction.investigation_id))))));



  create policy "investigation_correction_evidence_select_authorized"
  on "public"."investigation_correction_evidence"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.investigation_corrections correction
  WHERE ((correction.id = investigation_correction_evidence.correction_id) AND (correction.organization_id = correction.organization_id) AND public.can_view_investigation(correction.organization_id, correction.investigation_id)))));



  create policy "investigation_corrections_manage_authorized"
  on "public"."investigation_corrections"
  as permissive
  for all
  to authenticated
using (public.can_manage_investigation_content(organization_id, investigation_id))
with check ((public.can_manage_investigation_content(organization_id, investigation_id) AND (created_by = ( SELECT auth.uid() AS uid))));



  create policy "investigation_corrections_select_authorized"
  on "public"."investigation_corrections"
  as permissive
  for select
  to authenticated
using (public.can_view_investigation(organization_id, investigation_id));



  create policy "investigation_findings_manage_authorized"
  on "public"."investigation_findings"
  as permissive
  for all
  to authenticated
using (public.can_manage_investigation_content(organization_id, investigation_id))
with check ((public.can_manage_investigation_content(organization_id, investigation_id) AND (created_by = ( SELECT auth.uid() AS uid))));



  create policy "investigation_findings_select_authorized"
  on "public"."investigation_findings"
  as permissive
  for select
  to authenticated
using (public.can_view_investigation(organization_id, investigation_id));



  create policy "investigation_root_causes_manage_authorized"
  on "public"."investigation_root_causes"
  as permissive
  for all
  to authenticated
using (public.can_manage_investigation_content(organization_id, investigation_id))
with check ((public.can_manage_investigation_content(organization_id, investigation_id) AND (created_by = ( SELECT auth.uid() AS uid))));



  create policy "investigation_root_causes_select_authorized"
  on "public"."investigation_root_causes"
  as permissive
  for select
  to authenticated
using (public.can_view_investigation(organization_id, investigation_id));



  create policy "investigations_insert_authorized"
  on "public"."investigations"
  as permissive
  for insert
  to authenticated
with check ((public.can_assign_investigation(organization_id) AND (created_by = ( SELECT auth.uid() AS uid)) AND ((assigned_by IS NULL) OR (assigned_by = ( SELECT auth.uid() AS uid))) AND public.is_org_member(organization_id)));


CREATE TRIGGER activity_logs_normalize_workflow_event BEFORE INSERT ON public.activity_logs FOR EACH ROW EXECUTE FUNCTION public.normalize_workflow_activity_event();

CREATE TRIGGER corrective_action_sequences_set_updated_at BEFORE UPDATE ON public.corrective_action_sequences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER corrective_actions_assign_reference BEFORE INSERT ON public.corrective_actions FOR EACH ROW EXECUTE FUNCTION public.assign_corrective_action_reference();

CREATE TRIGGER corrective_actions_parent_integrity BEFORE INSERT OR UPDATE ON public.corrective_actions FOR EACH ROW EXECUTE FUNCTION public.enforce_corrective_action_parent_integrity();

CREATE TRIGGER corrective_actions_set_updated_at BEFORE UPDATE ON public.corrective_actions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER corrective_actions_verification_integrity BEFORE UPDATE ON public.corrective_actions FOR EACH ROW EXECUTE FUNCTION public.enforce_corrective_action_verification();

CREATE TRIGGER investigation_corrections_set_updated_at BEFORE UPDATE ON public.investigation_corrections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER investigation_findings_set_updated_at BEFORE UPDATE ON public.investigation_findings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER investigation_root_causes_set_updated_at BEFORE UPDATE ON public.investigation_root_causes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER investigations_enforce_workflow BEFORE UPDATE ON public.investigations FOR EACH ROW EXECUTE FUNCTION public.enforce_investigation_workflow();

CREATE TRIGGER incidents_enforce_integrity BEFORE UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.enforce_incident_workflow_transition();


