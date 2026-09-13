-- Resolve Prompt 3 foundation conflicts before adding the Prompt 4 workflow domain.
-- This migration persists the staged report context and reserves controlled workflow states.

alter type public.incident_status add value if not exists 'investigation';
alter type public.incident_status add value if not exists 'corrective_action';
alter type public.incident_status add value if not exists 'pending_verification';

alter table public.incidents
  add column if not exists priority text,
  add column if not exists gps_coordinates text,
  add column if not exists weather_conditions text,
  add column if not exists equipment_involved text,
  add column if not exists people_involved text,
  add column if not exists witnesses text,
  add column if not exists potential_root_cause text,
  add column if not exists digital_signature text,
  add column if not exists accuracy_confirmed boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'incidents_priority_length') then
    alter table public.incidents add constraint incidents_priority_length check (priority is null or char_length(priority) <= 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'incidents_gps_coordinates_length') then
    alter table public.incidents add constraint incidents_gps_coordinates_length check (gps_coordinates is null or char_length(gps_coordinates) <= 120);
  end if;
end;
$$;

create index if not exists incidents_organization_id_priority_idx
  on public.incidents(organization_id, priority);

