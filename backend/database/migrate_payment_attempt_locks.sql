-- FluxMEI - trava transacional para criacao de tentativas de pagamento.
-- Seguro para rodar mais de uma vez no Supabase.
--
-- Objetivo:
-- - impedir que duas requisicoes simultaneas criem duas cobrancas Mercado Pago
--   para o mesmo usuario/provedor/plano;
-- - nao remover dados existentes;
-- - manter assinaturas existentes intactas.

create extension if not exists "pgcrypto";

create table if not exists public.payment_attempt_locks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  plano text not null,
  status text not null default 'locked' check (status in ('locked', 'released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_attempt_locks_user_provider_plan_key unique (user_id, provider, plano)
);

create index if not exists idx_payment_attempt_locks_expires
on public.payment_attempt_locks(provider, plano, status, expires_at);

drop trigger if exists set_payment_attempt_locks_updated_at on public.payment_attempt_locks;
create trigger set_payment_attempt_locks_updated_at before update on public.payment_attempt_locks
for each row execute function public.set_updated_at();

alter table public.payment_attempt_locks enable row level security;

create or replace function public.acquire_payment_attempt_lock(
  p_user_id uuid,
  p_provider text,
  p_plano text,
  p_ttl_seconds integer default 120
)
returns table(acquired boolean, lock_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock_id uuid;
  v_expires_at timestamptz;
  v_ttl_seconds integer := greatest(coalesce(p_ttl_seconds, 120), 10);
begin
  update public.payment_attempt_locks
  set
    status = 'locked',
    expires_at = now() + make_interval(secs => v_ttl_seconds)
  where
    user_id = p_user_id
    and provider = p_provider
    and plano = p_plano
    and (status <> 'locked' or expires_at <= now())
  returning payment_attempt_locks.id, payment_attempt_locks.expires_at
  into v_lock_id, v_expires_at;

  if found then
    return query select true, v_lock_id, v_expires_at;
    return;
  end if;

  begin
    insert into public.payment_attempt_locks (user_id, provider, plano, status, expires_at)
    values (p_user_id, p_provider, p_plano, 'locked', now() + make_interval(secs => v_ttl_seconds))
    returning payment_attempt_locks.id, payment_attempt_locks.expires_at
    into v_lock_id, v_expires_at;

    return query select true, v_lock_id, v_expires_at;
    return;
  exception when unique_violation then
    select id, payment_attempt_locks.expires_at
    into v_lock_id, v_expires_at
    from public.payment_attempt_locks
    where user_id = p_user_id
      and provider = p_provider
      and plano = p_plano;

    return query select false, v_lock_id, v_expires_at;
    return;
  end;
end;
$$;

create or replace function public.release_payment_attempt_lock(p_lock_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payment_attempt_locks
  set status = 'released'
  where id = p_lock_id;

  return found;
end;
$$;

revoke all on function public.acquire_payment_attempt_lock(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.release_payment_attempt_lock(uuid) from public, anon, authenticated;
grant execute on function public.acquire_payment_attempt_lock(uuid, text, text, integer) to service_role;
grant execute on function public.release_payment_attempt_lock(uuid) to service_role;
