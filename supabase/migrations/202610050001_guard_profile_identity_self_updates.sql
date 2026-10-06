create or replace function public.prevent_profile_identity_self_update()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' and auth.uid() = old.id and (
    new.full_name is distinct from old.full_name
    or new.employee_id is distinct from old.employee_id
    or new.department is distinct from old.department
  ) then
    raise exception 'Identity fields are managed by your administrator.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_identity_self_update on public.profiles;

create trigger profiles_prevent_identity_self_update
before update on public.profiles
for each row execute function public.prevent_profile_identity_self_update();