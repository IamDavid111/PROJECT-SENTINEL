alter table public.incidents
  add column if not exists client_submission_id text;

create unique index if not exists incidents_organization_client_submission_id_key
  on public.incidents (organization_id, client_submission_id)
  where client_submission_id is not null;
