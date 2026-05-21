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
  cnpj text,
  ramo text,
  whatsapp text,
  tipo_negocio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists cnpj text;
alter table public.profiles add column if not exists ramo text;

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
  status text not null default 'ativo' check (status in ('ativo', 'pendente', 'vencido', 'cancelado', 'teste_gratis')),
  valor numeric(12,2) not null default 0,
  tipo_cobranca text not null default 'mensal' check (tipo_cobranca in ('mensal', 'anual')),
  data_inicio date not null default current_date,
  data_vencimento date,
  renovacao_automatica boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

alter table public.profiles enable row level security;
alter table public.movimentacoes enable row level security;
alter table public.clientes enable row level security;
alter table public.das enable row level security;
alter table public.relatorios_ia enable row level security;
alter table public.assinaturas enable row level security;

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
for select using (auth.uid() = user_id);

drop policy if exists "assinaturas_insert_own" on public.assinaturas;
create policy "assinaturas_insert_own" on public.assinaturas
for insert with check (auth.uid() = user_id);

drop policy if exists "assinaturas_update_own" on public.assinaturas;
create policy "assinaturas_update_own" on public.assinaturas
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
