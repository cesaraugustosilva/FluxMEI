-- FluxMEI - Supabase PostgreSQL schema
-- Execute este arquivo no SQL Editor do Supabase.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  nome_negocio text,
  cpf text,
  cnpj text,
  ramo text,
  whatsapp text,
  tipo_negocio text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists cnpj text;
alter table public.profiles add column if not exists cpf text;
alter table public.profiles add column if not exists ramo text;
alter table public.profiles add column if not exists is_admin boolean not null default false;

create table if not exists public.movimentacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida')),
  descricao text not null,
  valor numeric(12,2) not null check (valor >= 0),
  categoria text not null,
  forma_pagamento text,
  observacao text,
  data date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.movimentacoes add column if not exists observacao text;

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  telefone text,
  email text,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.das (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mes_referencia text not null,
  vencimento date not null,
  valor numeric(12,2) not null check (valor >= 0),
  status text not null default 'pendente' check (status in ('pendente', 'pago', 'vencido')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.relatorios_ia (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  periodo_inicio date not null,
  periodo_fim date not null,
  prompt text not null,
  resposta text not null,
  dados_base jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plano text not null default 'gratuito' check (plano in ('gratuito', 'pro_mensal', 'pro_anual')),
  status text not null default 'teste_gratis' check (status in ('ativo', 'pendente', 'vencido', 'cancelado', 'teste_gratis')),
  valor numeric(12,2) not null default 0,
  tipo_cobranca text not null default 'mensal' check (tipo_cobranca in ('mensal', 'anual')),
  data_inicio date not null default current_date,
  data_vencimento date default (current_date + 7),
  data_trial_fim date default (current_date + 7),
  teste_gratis_usado boolean not null default false,
  bloqueado boolean not null default false,
  renovacao_automatica boolean not null default false,
  payment_provider text,
  provider_payment_id text,
  provider_customer_id text,
  provider_subscription_id text,
  provider_status text,
  provider_raw jsonb,
  paid_at timestamptz,
  checkout_url text,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  reactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  event_key text not null,
  provider text not null default 'email',
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  metadata jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_events_user_type_event_key unique (user_id, type, event_key)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  discount_type text not null check (discount_type in ('PERCENTAGE', 'FIXED')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  max_uses integer check (max_uses is null or max_uses > 0),
  current_uses integer not null default 0 check (current_uses >= 0),
  active boolean not null default true,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_id on public.profiles(id);
create index if not exists idx_movimentacoes_user_data on public.movimentacoes(user_id, data);
create index if not exists idx_movimentacoes_user_tipo on public.movimentacoes(user_id, tipo);
create index if not exists idx_movimentacoes_user_categoria on public.movimentacoes(user_id, categoria);
create index if not exists idx_clientes_user_nome on public.clientes(user_id, nome);
create index if not exists idx_das_user_vencimento on public.das(user_id, vencimento);
create index if not exists idx_das_user_status on public.das(user_id, status);
create index if not exists idx_relatorios_ia_user_created on public.relatorios_ia(user_id, created_at desc);
create index if not exists idx_assinaturas_user_status on public.assinaturas(user_id, status);
create index if not exists idx_assinaturas_user_created on public.assinaturas(user_id, created_at desc);
create index if not exists idx_assinaturas_provider_payment on public.assinaturas(payment_provider, provider_payment_id);
create index if not exists idx_assinaturas_provider_subscription on public.assinaturas(payment_provider, provider_subscription_id);
create index if not exists idx_payment_attempt_locks_expires on public.payment_attempt_locks(provider, plano, status, expires_at);
create index if not exists idx_notification_events_user_created on public.notification_events(user_id, created_at desc);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_user_created_at on public.audit_logs(user_id, created_at desc);
create index if not exists idx_audit_logs_action_created_at on public.audit_logs(action, created_at desc);
create unique index if not exists idx_coupons_code_upper on public.coupons(upper(code));
create index if not exists idx_coupons_active_validity on public.coupons(active, valid_from, valid_until);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_movimentacoes_updated_at on public.movimentacoes;
create trigger set_movimentacoes_updated_at before update on public.movimentacoes
for each row execute function public.set_updated_at();

drop trigger if exists set_clientes_updated_at on public.clientes;
create trigger set_clientes_updated_at before update on public.clientes
for each row execute function public.set_updated_at();

drop trigger if exists set_das_updated_at on public.das;
create trigger set_das_updated_at before update on public.das
for each row execute function public.set_updated_at();

drop trigger if exists set_assinaturas_updated_at on public.assinaturas;
create trigger set_assinaturas_updated_at before update on public.assinaturas
for each row execute function public.set_updated_at();

drop trigger if exists set_payment_attempt_locks_updated_at on public.payment_attempt_locks;
create trigger set_payment_attempt_locks_updated_at before update on public.payment_attempt_locks
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.movimentacoes enable row level security;
alter table public.clientes enable row level security;
alter table public.das enable row level security;
alter table public.relatorios_ia enable row level security;
alter table public.assinaturas enable row level security;
alter table public.payment_attempt_locks enable row level security;
alter table public.notification_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.coupons enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "movimentacoes_select_own" on public.movimentacoes;
create policy "movimentacoes_select_own" on public.movimentacoes
for select using (auth.uid() = user_id);

drop policy if exists "movimentacoes_insert_own" on public.movimentacoes;
create policy "movimentacoes_insert_own" on public.movimentacoes
for insert with check (auth.uid() = user_id);

drop policy if exists "movimentacoes_update_own" on public.movimentacoes;
create policy "movimentacoes_update_own" on public.movimentacoes
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "movimentacoes_delete_own" on public.movimentacoes;
create policy "movimentacoes_delete_own" on public.movimentacoes
for delete using (auth.uid() = user_id);

drop policy if exists "clientes_select_own" on public.clientes;
create policy "clientes_select_own" on public.clientes
for select using (auth.uid() = user_id);

drop policy if exists "clientes_insert_own" on public.clientes;
create policy "clientes_insert_own" on public.clientes
for insert with check (auth.uid() = user_id);

drop policy if exists "clientes_update_own" on public.clientes;
create policy "clientes_update_own" on public.clientes
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "clientes_delete_own" on public.clientes;
create policy "clientes_delete_own" on public.clientes
for delete using (auth.uid() = user_id);

drop policy if exists "das_select_own" on public.das;
create policy "das_select_own" on public.das
for select using (auth.uid() = user_id);

drop policy if exists "das_insert_own" on public.das;
create policy "das_insert_own" on public.das
for insert with check (auth.uid() = user_id);

drop policy if exists "das_update_own" on public.das;
create policy "das_update_own" on public.das
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "das_delete_own" on public.das;
create policy "das_delete_own" on public.das
for delete using (auth.uid() = user_id);

drop policy if exists "relatorios_ia_select_own" on public.relatorios_ia;
create policy "relatorios_ia_select_own" on public.relatorios_ia
for select using (auth.uid() = user_id);

drop policy if exists "relatorios_ia_insert_own" on public.relatorios_ia;
create policy "relatorios_ia_insert_own" on public.relatorios_ia
for insert with check (auth.uid() = user_id);

drop policy if exists "assinaturas_select_own" on public.assinaturas;
create policy "assinaturas_select_own" on public.assinaturas
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "assinaturas_insert_own" on public.assinaturas;
drop policy if exists "assinaturas_update_own" on public.assinaturas;
drop policy if exists "assinaturas_delete_own" on public.assinaturas;

drop policy if exists "notification_events_select_own" on public.notification_events;
create policy "notification_events_select_own" on public.notification_events
for select using (auth.uid() = user_id);

drop policy if exists "audit_logs_no_client_access" on public.audit_logs;
create policy "audit_logs_no_client_access" on public.audit_logs
for all using (false) with check (false);

drop policy if exists "coupons_no_client_write" on public.coupons;
create policy "coupons_no_client_write" on public.coupons
for all using (false) with check (false);

alter table public.profiles
  add column if not exists referral_code text;

alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false;

alter table public.profiles
  add column if not exists onboarding_step integer not null default 0;

alter table public.profiles
  add constraint profiles_onboarding_step_check
  check (onboarding_step between 0 and 6)
  not valid;

alter table public.profiles
  validate constraint profiles_onboarding_step_check;

create unique index if not exists idx_profiles_referral_code
on public.profiles(referral_code)
where referral_code is not null;

create index if not exists idx_profiles_onboarding_completed
on public.profiles(onboarding_completed);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null references auth.users(id) on delete cascade,
  referral_code text not null,
  status text not null default 'pending',
  reward_days integer not null default 15,
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint referrals_status_check check (status in ('pending', 'converted', 'rewarded', 'invalid')),
  constraint referrals_reward_days_check check (reward_days > 0),
  constraint referrals_no_self_referral check (referrer_user_id <> referred_user_id),
  constraint referrals_referred_user_unique unique (referred_user_id)
);

create index if not exists idx_referrals_referrer_status
on public.referrals(referrer_user_id, status);

create index if not exists idx_referrals_referred_status
on public.referrals(referred_user_id, status);

create index if not exists idx_referrals_created_at
on public.referrals(created_at desc);

alter table public.referrals enable row level security;

drop policy if exists "referrals_no_client_access" on public.referrals;
create policy "referrals_no_client_access" on public.referrals
for all using (false) with check (false);

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
  update public.payment_attempt_locks as pal
  set
    status = 'locked',
    expires_at = now() + make_interval(secs => v_ttl_seconds)
  where
    pal.user_id = p_user_id
    and pal.provider = p_provider
    and pal.plano = p_plano
    and (pal.status <> 'locked' or pal.expires_at <= now())
  returning pal.id, pal.expires_at
  into v_lock_id, v_expires_at;

  if found then
    return query select true, v_lock_id, v_expires_at;
    return;
  end if;

  begin
    insert into public.payment_attempt_locks as pal (user_id, provider, plano, status, expires_at)
    values (p_user_id, p_provider, p_plano, 'locked', now() + make_interval(secs => v_ttl_seconds))
    returning pal.id, pal.expires_at
    into v_lock_id, v_expires_at;

    return query select true, v_lock_id, v_expires_at;
    return;
  exception when unique_violation then
    select pal.id, pal.expires_at
    into v_lock_id, v_expires_at
    from public.payment_attempt_locks as pal
    where pal.user_id = p_user_id
      and pal.provider = p_provider
      and pal.plano = p_plano;

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
  update public.payment_attempt_locks as pal
  set status = 'released'
  where pal.id = p_lock_id;

  return found;
end;
$$;

revoke all on function public.acquire_payment_attempt_lock(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.release_payment_attempt_lock(uuid) from public, anon, authenticated;
grant execute on function public.acquire_payment_attempt_lock(uuid, text, text, integer) to service_role;
grant execute on function public.release_payment_attempt_lock(uuid) to service_role;
