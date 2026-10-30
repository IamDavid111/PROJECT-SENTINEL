-- Replace sequential/padded generators with random alphanumeric codes.
--
-- Format:
--   companies: SENT-XXXXXXXXXX
--   sites:     SIT-XXXXXXXXXX
-- The alphabet omits ambiguous I/O/0/1. Each function re-generates until the
-- candidate is unused for its scope, so uniqueness is still guaranteed by the
-- loop plus the existing unique constraints.

create or replace function public.generate_company_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw text;
  candidate text;
  i int;
begin
  loop
    raw := replace(gen_random_uuid()::text, '-', '');
    candidate := 'SENT-';
    for i in 0..9 loop
      candidate := candidate || substr(
        alphabet,
        (get_byte(decode(substr(raw, i * 2 + 1, 2), 'hex'), 0) % length(alphabet)) + 1,
        1
      );
    end loop;
    exit when not exists (
      select 1 from public.organizations where company_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

revoke all on function public.generate_company_code() from public;
grant execute on function public.generate_company_code() to anon, authenticated;

create or replace function public.generate_site_code(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw text;
  candidate text;
  i int;
begin
  loop
    raw := replace(gen_random_uuid()::text, '-', '');
    candidate := 'SIT-';
    for i in 0..9 loop
      candidate := candidate || substr(
        alphabet,
        (get_byte(decode(substr(raw, i * 2 + 1, 2), 'hex'), 0) % length(alphabet)) + 1,
        1
      );
    end loop;
    exit when not exists (
      select 1 from public.sites
      where organization_id = p_organization_id and code = candidate
    );
  end loop;
  return candidate;
end;
$$;

revoke all on function public.generate_site_code(uuid) from public;
grant execute on function public.generate_site_code(uuid) to authenticated;

drop sequence if exists public.organization_company_code_seq;
drop sequence if exists public.site_code_seq;
