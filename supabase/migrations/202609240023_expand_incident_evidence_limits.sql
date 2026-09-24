alter table public.incident_evidence
  drop constraint if exists incident_evidence_file_size_check;

alter table public.incident_evidence
  add constraint incident_evidence_file_size_check
  check (file_size > 0 and file_size <= 104857600);
