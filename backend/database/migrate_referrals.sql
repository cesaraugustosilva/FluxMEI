-- FluxMEI - programa de indicacao seguro.
-- Mantem a recompensa no backend e nao permite escrita direta pelo cliente.

alter table public.profiles
  add column if not exists referral_code text;

create unique index if not exists idx_profiles_referral_code
on public.profiles(referral_code)
where referral_code is not null;

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
