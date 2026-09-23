create or replace function public.assign_incident_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reference_number is null or btrim(new.reference_number) = '' then
    new.reference_number := public.next_incident_reference(new.organization_id);
  end if;
  return new;
end;
$$;

revoke all on function public.assign_incident_reference() from public, anon, authenticated;
