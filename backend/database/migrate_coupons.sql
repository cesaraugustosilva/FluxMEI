-- FluxMEI - cupons promocionais.
-- Cupons sao aplicados no checkout e auditados sem alterar regras de ativacao.

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

create unique index if not exists idx_coupons_code_upper
on public.coupons(upper(code));

create index if not exists idx_coupons_active_validity
on public.coupons(active, valid_from, valid_until);

alter table public.coupons enable row level security;

drop policy if exists "coupons_no_client_write" on public.coupons;
create policy "coupons_no_client_write" on public.coupons
  for all using (false) with check (false);
