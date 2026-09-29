alter table public.incidents
  add column if not exists draft_stage smallint not null default 0;

alter table public.incidents
  drop constraint if exists incidents_draft_stage_range;

alter table public.incidents
  add constraint incidents_draft_stage_range check (draft_stage between 0 and 3);