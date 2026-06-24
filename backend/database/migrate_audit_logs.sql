-- FluxMEI - logs de auditoria seguros.
-- Registra eventos importantes sem armazenar dados sensiveis.

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

create index if not exists idx_audit_logs_created_at
on public.audit_logs(created_at desc);

create index if not exists idx_audit_logs_user_created_at
on public.audit_logs(user_id, created_at desc);

create index if not exists idx_audit_logs_action_created_at
on public.audit_logs(action, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_no_client_access" on public.audit_logs;
create policy "audit_logs_no_client_access" on public.audit_logs
  for all using (false) with check (false);
