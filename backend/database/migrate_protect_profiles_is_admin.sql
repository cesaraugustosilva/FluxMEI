-- Protege profiles.is_admin contra autopromocao via clientes autenticados.
-- Admin continua podendo ser definido por service role, SQL direto ou ADMIN_EMAILS.

create or replace function public.prevent_profile_is_admin_client_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' and coalesce(new.is_admin, false) is true then
      raise exception 'profiles.is_admin can only be set by service role or privileged SQL';
    end if;

    if tg_op = 'UPDATE' and new.is_admin is distinct from old.is_admin then
      raise exception 'profiles.is_admin can only be changed by service role or privileged SQL';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profiles_is_admin_client_insert on public.profiles;
create trigger prevent_profiles_is_admin_client_insert
before insert on public.profiles
for each row execute function public.prevent_profile_is_admin_client_change();

drop trigger if exists prevent_profiles_is_admin_client_update on public.profiles;
create trigger prevent_profiles_is_admin_client_update
before update on public.profiles
for each row execute function public.prevent_profile_is_admin_client_change();
