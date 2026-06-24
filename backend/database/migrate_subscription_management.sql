-- FluxMEI - gerenciamento seguro de cancelamento e reativacao de assinatura.
-- Mantem pagamentos e historico intactos; apenas agenda encerramento de ciclo.

alter table public.assinaturas
  add column if not exists cancel_at_period_end boolean not null default false;

alter table public.assinaturas
  add column if not exists cancelled_at timestamptz;

alter table public.assinaturas
  add column if not exists reactivated_at timestamptz;

create index if not exists idx_assinaturas_user_cancel_at_period_end
on public.assinaturas(user_id, cancel_at_period_end);

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

create index if not exists idx_notification_events_user_created
on public.notification_events(user_id, created_at desc);

alter table public.notification_events enable row level security;

drop policy if exists "notification_events_select_own" on public.notification_events;
create policy "notification_events_select_own" on public.notification_events
for select using (auth.uid() = user_id);
