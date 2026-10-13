-- Publish existing RLS-protected identity/grant rows so active analytics clients can withdraw caches.
do $$
declare
  target_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Supabase Realtime publication is required for analytics access events';
  end if;
  foreach target_table in array array['custom_roles', 'memberships', 'profiles'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end;
$$;
