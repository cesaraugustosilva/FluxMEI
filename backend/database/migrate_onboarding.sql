-- FluxMEI - onboarding guiado.
-- Guarda progresso no perfil para aparecer apenas no primeiro acesso.

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

create index if not exists idx_profiles_onboarding_completed
on public.profiles(onboarding_completed);
